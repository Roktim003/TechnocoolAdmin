import sharp from "sharp";
import * as productsRoute from "@/app/api/v1/products/route";
import * as roleRoute from "@/app/api/v1/roles/[id]/route";
import { call } from "./http";
import { prisma, roleId } from "./db";
import { createUser, loginMobile } from "./fixtures";

export const catalogId = async (name: string) => (await prisma.catalog.findFirstOrThrow({ where: { name } })).id;
export const categoryId = async (name: string) => (await prisma.category.findFirstOrThrow({ where: { name } })).id;
export const unitId = async (code: string) => (await prisma.unit.findUniqueOrThrow({ where: { code } })).id;

let n = 0;

/** A valid create-product body; override any field. */
export async function productBody(overrides: Record<string, unknown> = {}) {
  n++;
  return {
    code: `TEST-${n}`,
    name: `Test product ${n}`,
    catalogId: await catalogId("LG"),
    model: `MODEL-${n}`,
    categoryId: await categoryId("Split AC"),
    unitId: await unitId("set"),
    purchaseCost: "61000.00",
    sellingPrice: "85000",
    ...overrides,
  };
}

export async function createProduct(token: string, overrides: Record<string, unknown> = {}) {
  const res = await call(productsRoute.POST, "POST", "/products", { token, body: await productBody(overrides) });
  if (res.status !== 201) throw new Error(`createProduct failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as { id: string; code: string; [k: string]: any };
}

/** Logs in a fresh user of `role`, optionally after setting the role's catalog level first. */
export async function tokenForRole(adminToken: string, role: string, catalogLevel?: string) {
  if (catalogLevel) {
    const id = await roleId(role);
    const res = await call(roleRoute.PATCH, "PATCH", `/roles/${id}`, { token: adminToken, params: { id }, body: { permissions: { catalog: catalogLevel } } });
    if (res.status !== 200) throw new Error(`role patch failed: ${res.status}`);
  }
  const user = await createUser(adminToken, { role });
  return { token: (await loginMobile(user.username, user.password)).accessToken, userId: user.id };
}

export async function image(format: "png" | "jpeg" | "webp" | "gif", size = 800): Promise<Uint8Array> {
  const img = sharp({ create: { width: size, height: Math.round(size * 0.75), channels: 3, background: { r: 15, g: 98, b: 254 } } });
  const buf = await (format === "png" ? img.png() : format === "jpeg" ? img.jpeg() : format === "webp" ? img.webp() : img.gif()).toBuffer();
  return new Uint8Array(buf);
}

export function form(files: { name: string; bytes: Uint8Array; type?: string }[], fields: Record<string, string> = {}, field = "file"): FormData {
  const fd = new FormData();
  for (const f of files) fd.append(field, new Blob([f.bytes as BlobPart], { type: f.type ?? "application/octet-stream" }), f.name);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}
