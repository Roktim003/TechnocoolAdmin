import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import * as photosRoute from "@/app/api/v1/products/[id]/photos/route";
import * as photoRoute from "@/app/api/v1/products/[id]/photos/[photoId]/route";
import * as fileRoute from "@/app/api/v1/products/[id]/photos/[photoId]/file/route";
import * as productRoute from "@/app/api/v1/products/[id]/route";
import { call } from "../helpers/http";
import { prisma, resetDatabase } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";
import { createProduct, form, image, tokenForRole } from "../helpers/catalog";

let token: string;
let productId: string;

beforeEach(async () => {
  await resetDatabase();
  token = await adminToken();
  productId = (await createProduct(token)).id;
});

const upload = (files: { name: string; bytes: Uint8Array; type?: string }[], t = token, id = productId) =>
  call(photosRoute.POST, "POST", `/products/${id}/photos`, { token: t, params: { id }, body: form(files) });
const photos = async () => (await call(productRoute.GET, "GET", `/products/${productId}`, { token, params: { id: productId } })).body.data.photos;

describe("photo upload", () => {
  it("stores the original and a 400px thumbnail; the first photo becomes primary", async () => {
    const res = await upload([
      { name: "front.jpg", bytes: await image("jpeg", 1600), type: "image/jpeg" },
      { name: "side.png", bytes: await image("png"), type: "image/png" },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({ isPrimary: true, sortOrder: 0, contentType: "image/jpeg", width: 1600, height: 1200 });
    expect(res.body.data[1]).toMatchObject({ isPrimary: false, sortOrder: 1, contentType: "image/png" });

    const photo = res.body.data[0];
    const original = await call(fileRoute.GET, "GET", photo.url.replace("/api/v1", ""), { token, params: { id: productId, photoId: photo.id } });
    expect(original.status).toBe(200);
    expect(original.headers.get("content-type")).toBe("image/jpeg");
    expect(original.headers.get("cache-control")).toMatch(/^private/);
    expect((await sharp(original.bytes).metadata()).width).toBe(1600);

    const thumb = await call(fileRoute.GET, "GET", photo.thumbnailUrl.replace("/api/v1", ""), { token, params: { id: productId, photoId: photo.id }, query: { variant: "thumb" } });
    expect(thumb.headers.get("content-type")).toBe("image/webp");
    const meta = await sharp(thumb.bytes).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  it("rejects wrong types by content, not by name (400)", async () => {
    const gif = await upload([{ name: "anim.gif", bytes: await image("gif"), type: "image/gif" }]);
    expect(gif.status).toBe(400);
    expect(gif.body.error.details[0].code).toBe("INVALID_FILE_TYPE");

    const fake = await upload([{ name: "photo.jpg", bytes: new TextEncoder().encode("definitely not an image"), type: "image/jpeg" }]);
    expect(fake.status).toBe(400);
    expect(fake.body.error.details[0].code).toBe("INVALID_FILE_TYPE");
    expect(await prisma.productPhoto.count()).toBe(0);
  });

  it("rejects files over 5 MB (400) and stores nothing from that request", async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    const res = await upload([
      { name: "ok.webp", bytes: await image("webp") },
      { name: "big.jpg", bytes: big },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].code).toBe("FILE_TOO_LARGE");
    expect(await prisma.productPhoto.count()).toBe(0);
  });

  it("allows at most 10 photos per product (422)", async () => {
    const one = { name: "p.webp", bytes: await image("webp", 200) };
    expect((await upload(Array(8).fill(one))).status).toBe(201);
    const over = await upload(Array(3).fill(one));
    expect(over.status).toBe(422);
    expect(over.body.error.details[0].code).toBe("PHOTO_LIMIT");
    expect((await upload(Array(2).fill(one))).status).toBe(201);
    expect(await prisma.productPhoto.count({ where: { productId } })).toBe(10);
    expect((await upload([one])).status).toBe(422);
  });

  it("requires a multipart body with at least one file", async () => {
    expect((await call(photosRoute.POST, "POST", `/products/${productId}/photos`, { token, params: { id: productId }, body: { file: "x" } })).status).toBe(400);
    expect((await upload([])).status).toBe(400);
  });
});

describe("primary, reorder, delete", () => {
  it("sets the primary photo, reorders, and promotes the next photo when the primary is deleted", async () => {
    const res = await upload([
      { name: "a.png", bytes: await image("png", 300) },
      { name: "b.png", bytes: await image("png", 310) },
      { name: "c.png", bytes: await image("png", 320) },
    ]);
    const [a, b, c] = res.body.data;
    const patch = (photoId: string, body: unknown) => call(photoRoute.PATCH, "PATCH", `/products/${productId}/photos/${photoId}`, { token, params: { id: productId, photoId }, body });

    const primary = await patch(c.id, { isPrimary: true });
    expect(primary.status).toBe(200);
    expect(primary.body.data.filter((p: any) => p.isPrimary).map((p: any) => p.id)).toEqual([c.id]);

    const moved = await patch(c.id, { sortOrder: 0 });
    expect(moved.body.data.map((p: any) => p.id)).toEqual([c.id, a.id, b.id]);
    expect(moved.body.data.map((p: any) => p.sortOrder)).toEqual([0, 1, 2]);

    const del = await call(photoRoute.DELETE, "DELETE", `/products/${productId}/photos/${c.id}`, { token, params: { id: productId, photoId: c.id } });
    expect(del.status).toBe(204);
    const after = await photos();
    expect(after.map((p: any) => p.id)).toEqual([a.id, b.id]);
    expect(after[0].isPrimary).toBe(true);
    // The object is gone from storage too.
    expect((await call(fileRoute.GET, "GET", "/x", { token, params: { id: productId, photoId: c.id } })).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { entityId: productId, action: { startsWith: "product.photo_" } } })).toBe(4);
  });

  it("shows the primary thumbnail in the product list", async () => {
    const res = await upload([{ name: "a.png", bytes: await image("png", 300) }]);
    const listed = await call((await import("@/app/api/v1/products/route")).GET, "GET", "/products", { token });
    expect(listed.body.data[0].thumbnailUrl).toBe(res.body.data[0].thumbnailUrl);
  });
});

describe("photo permissions", () => {
  it("CREATE can manage photos of products they created, not of others; VIEW can only view", async () => {
    const { token: creator } = await tokenForRole(token, "Manager", "CREATE");
    const mine = await createProduct(creator, { code: "MINE-PH" });
    const png = { name: "a.png", bytes: await image("png", 300) };
    expect((await upload([png], creator, mine.id)).status).toBe(201);
    expect((await upload([png], creator, productId)).status).toBe(403);

    const { token: viewer } = await tokenForRole(token, "Store Manager");
    expect((await upload([png], viewer, mine.id)).status).toBe(403);
    const p = (await call(productRoute.GET, "GET", `/products/${mine.id}`, { token: viewer, params: { id: mine.id } })).body.data.photos[0];
    expect((await call(fileRoute.GET, "GET", "/x", { token: viewer, params: { id: mine.id, photoId: p.id } })).status).toBe(200);
  });

  it("requires authentication to fetch images", async () => {
    const res = await upload([{ name: "a.png", bytes: await image("png", 300) }]);
    const anon = await call(fileRoute.GET, "GET", "/x", { params: { id: productId, photoId: res.body.data[0].id } });
    expect(anon.status).toBe(401);
  });
});
