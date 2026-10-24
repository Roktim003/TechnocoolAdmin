import { beforeEach, describe, expect, it } from "vitest";
import * as productsRoute from "@/app/api/v1/products/route";
import * as productRoute from "@/app/api/v1/products/[id]/route";
import * as discontinueRoute from "@/app/api/v1/products/[id]/discontinue/route";
import * as reactivateRoute from "@/app/api/v1/products/[id]/reactivate/route";
import * as historyRoute from "@/app/api/v1/products/[id]/history/route";
import * as byCodeRoute from "@/app/api/v1/products/by-code/[code]/route";
import * as byBarcodeRoute from "@/app/api/v1/products/by-barcode/[barcode]/route";
import * as checkCodeRoute from "@/app/api/v1/products/check-code/route";
import * as catalogRoute from "@/app/api/v1/catalogs/[id]/route";
import * as categoryRoute from "@/app/api/v1/categories/[id]/route";
import { call } from "../helpers/http";
import { prisma, resetDatabase } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";
import { catalogId, categoryId, createProduct, productBody, tokenForRole, unitId } from "../helpers/catalog";

let token: string;

beforeEach(async () => {
  await resetDatabase();
  token = await adminToken();
});

const post = async (body: unknown, t = token, headers: Record<string, string> = {}) => call(productsRoute.POST, "POST", "/products", { token: t, body, headers });
const patch = (id: string, body: unknown, t = token) => call(productRoute.PATCH, "PATCH", `/products/${id}`, { token: t, params: { id }, body });
const list = (query: Record<string, string | number>, t = token) => call(productsRoute.GET, "GET", "/products", { token: t, query });

describe("POST /products", () => {
  it("creates a product with the code stored upper-case and money as decimal strings", async () => {
    const res = await post(await productBody({ code: "  lg-s18et ", sellingPrice: 85000.5, purchaseCost: "61,000", minStockLevel: "2.5", trackSerial: true, source: "imported" }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      code: "LG-S18ET",
      sellingPrice: "85000.50",
      purchaseCost: "61000.00",
      minStockLevel: "2.5",
      trackSerial: true,
      source: "IMPORTED",
      status: "ACTIVE",
      catalog: { name: "LG" },
      category: { name: "Split AC" },
      unit: { code: "set" },
      photos: [],
      createdBy: { name: "Test Admin" },
    });
    const row = await prisma.product.findUniqueOrThrow({ where: { code: "LG-S18ET" } });
    expect(row.sellingPrice.toFixed(2)).toBe("85000.50");
  });

  it("rejects a duplicate code (409), even in different case", async () => {
    await post(await productBody({ code: "DK-001" }));
    const res = await post(await productBody({ code: "dk-001" }));
    expect(res.status).toBe(409);
    expect(res.body.error.details[0].path).toBe("code");
  });

  it.each(["A", "-ABC", "HAS SPACE", "UNDER_SCORE", "X".repeat(32), "ÄBC"])("rejects invalid code format %j (400)", async (code) => {
    const res = await post(await productBody({ code }));
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe("code");
  });

  it("validates required fields and money (400)", async () => {
    const res = await post({ code: "OK-1", sellingPrice: "-5" });
    expect(res.status).toBe(400);
    const paths = res.body.error.details.map((d: any) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["name", "catalogId", "categoryId", "unitId", "sellingPrice"]));
    const decimals = await post(await productBody({ sellingPrice: "10.123" }));
    expect(decimals.status).toBe(400);
  });

  it("requires purchaseCost from roles that can see cost", async () => {
    const body = await productBody();
    delete (body as any).purchaseCost;
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe("purchaseCost");
  });

  it("rejects inactive catalog, category and unit (422)", async () => {
    const lg = await catalogId("LG");
    await prisma.catalog.update({ where: { id: lg }, data: { isActive: false } });
    expect((await post(await productBody())).body.error.details[0].code).toBe("INACTIVE_CATALOG");

    await prisma.catalog.update({ where: { id: lg }, data: { isActive: true } });
    await prisma.category.update({ where: { id: await categoryId("Split AC") }, data: { isActive: false } });
    const cat = await post(await productBody());
    expect(cat.status).toBe(422);
    expect(cat.body.error.details[0].code).toBe("INACTIVE_CATEGORY");

    await prisma.unit.update({ where: { id: await unitId("pcs") }, data: { isActive: false } });
    const unit = await post(await productBody({ categoryId: await categoryId("Piping"), unitId: await unitId("pcs") }));
    expect(unit.status).toBe(422);
    expect(unit.body.error.details[0].code).toBe("INACTIVE_UNIT");
  });

  it("requires purchase unit and factor together", async () => {
    const res = await post(await productBody({ unitId: await unitId("m"), purchaseUnitId: await unitId("roll") }));
    expect(res.status).toBe(422);
    const ok = await post(await productBody({ unitId: await unitId("m"), purchaseUnitId: await unitId("roll"), purchaseUnitFactor: 50 }));
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ purchaseUnit: { code: "roll" }, purchaseUnitFactor: "50" });
  });

  it("enforces barcode uniqueness only when present", async () => {
    expect((await post(await productBody({ barcode: "" }))).status).toBe(201);
    expect((await post(await productBody({ barcode: null }))).status).toBe(201);
    expect((await post(await productBody({ barcode: "8801234567890" }))).status).toBe(201);
    const dup = await post(await productBody({ barcode: "8801234567890" }));
    expect(dup.status).toBe(409);
    expect(dup.body.error.details[0].path).toBe("barcode");
  });

  it("does not create a duplicate when replayed with the same Idempotency-Key", async () => {
    const body = await productBody({ code: "IDEM-1" });
    const a = await post(body, token, { "Idempotency-Key": "product-create-0001" });
    const b = await post(body, token, { "Idempotency-Key": "product-create-0001" });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.headers.get("idempotent-replayed")).toBe("true");
    expect(b.body.data.id).toBe(a.body.data.id);
    expect(await prisma.product.count({ where: { code: "IDEM-1" } })).toBe(1);
  });

  it("writes an audit row on create", async () => {
    const p = await createProduct(token, { code: "AUD-1" });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "product.create", entityId: p.id } });
    expect(audit.after).toMatchObject({ code: "AUD-1", catalog: "LG", purchaseCost: "61000.00", sellingPrice: "85000.00" });
  });
});

describe("check-code, by-code, by-barcode", () => {
  it("reports availability with normalisation and format validity", async () => {
    await createProduct(token, { code: "TAKEN-1" });
    const check = (code: string) => call(checkCodeRoute.GET, "GET", "/products/check-code", { token, query: { code } });
    expect((await check("taken-1")).body.data).toEqual({ code: "TAKEN-1", valid: true, available: false });
    expect((await check("free-1")).body.data).toEqual({ code: "FREE-1", valid: true, available: true });
    expect((await check("bad code")).body.data).toMatchObject({ valid: false, available: false });
  });

  it("finds products by code (case-insensitive) and barcode", async () => {
    const p = await createProduct(token, { code: "SCAN-1", barcode: "BC-777" });
    const byCode = await call(byCodeRoute.GET, "GET", "/products/by-code/scan-1", { token, params: { code: "scan-1" } });
    expect(byCode.body.data.id).toBe(p.id);
    const byBarcode = await call(byBarcodeRoute.GET, "GET", "/products/by-barcode/BC-777", { token, params: { barcode: "BC-777" } });
    expect(byBarcode.body.data.id).toBe(p.id);
    expect((await call(byCodeRoute.GET, "GET", "/products/by-code/NOPE", { token, params: { code: "NOPE" } })).status).toBe(404);
  });
});

describe("PATCH /products/:id", () => {
  it("updates fields, keeps the code, and audits before/after", async () => {
    const p = await createProduct(token, { code: "UPD-1" });
    const res = await patch(p.id, { code: "upd-1", name: "Renamed", sellingPrice: "90000", categoryId: await categoryId("Cassette AC"), specifications: "" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ code: "UPD-1", name: "Renamed", sellingPrice: "90000.00", category: { name: "Cassette AC" }, specifications: null, updatedBy: { name: "Test Admin" } });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "product.update", entityId: p.id } });
    expect(audit.before).toMatchObject({ name: p.name, sellingPrice: "85000.00", category: "Split AC" });
    expect(audit.after).toMatchObject({ name: "Renamed", sellingPrice: "90000.00", category: "Cassette AC" });
  });

  it("refuses to change the code (422 CODE_IMMUTABLE)", async () => {
    const p = await createProduct(token, { code: "IMM-1" });
    const res = await patch(p.id, { code: "IMM-2" });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].code).toBe("CODE_IMMUTABLE");
  });

  it("rejects moving to an inactive category but allows editing a product already on one", async () => {
    const p = await createProduct(token);
    await prisma.category.update({ where: { id: await categoryId("Chiller") }, data: { isActive: false } });
    expect((await patch(p.id, { categoryId: await categoryId("Chiller") })).status).toBe(422);
    await prisma.category.update({ where: { id: await categoryId("Split AC") }, data: { isActive: false } });
    expect((await patch(p.id, { name: "Still editable" })).status).toBe(200);
  });

  it("rejects unknown fields (400)", async () => {
    const p = await createProduct(token);
    expect((await patch(p.id, { colour: "red" })).status).toBe(400);
  });
});

describe("discontinue / reactivate", () => {
  it("toggles status, audits it, and the ACTIVE filter excludes discontinued products", async () => {
    const a = await createProduct(token, { code: "KEEP-1" });
    const b = await createProduct(token, { code: "STOP-1" });
    const d = await call(discontinueRoute.POST, "POST", `/products/${b.id}/discontinue`, { token, params: { id: b.id } });
    expect(d.status).toBe(200);
    expect(d.body.data.status).toBe("DISCONTINUED");
    expect(d.body.data.discontinuedAt).toEqual(expect.any(String));
    expect((await call(discontinueRoute.POST, "POST", `/products/${b.id}/discontinue`, { token, params: { id: b.id } })).status).toBe(422);

    const active = await list({ status: "ACTIVE" });
    expect(active.body.data.map((p: any) => p.code)).toEqual(["KEEP-1"]);
    const disc = await list({ status: "discontinued" });
    expect(disc.body.data.map((p: any) => p.code)).toEqual(["STOP-1"]);
    expect((await list({})).body.meta.total).toBe(2);

    const r = await call(reactivateRoute.POST, "POST", `/products/${b.id}/reactivate`, { token, params: { id: b.id } });
    expect(r.body.data.status).toBe("ACTIVE");
    expect(await prisma.auditLog.count({ where: { entityId: b.id, action: { in: ["product.discontinue", "product.reactivate"] } } })).toBe(2);
    expect(a.status).toBe("ACTIVE");
  });
});

describe("GET /products — search, filters, sort, pagination", () => {
  beforeEach(async () => {
    const daikin = await catalogId("Daikin");
    const vrv = await categoryId("VRF / VRV");
    await createProduct(token, { code: "LG-AAA", name: "Alpha split", model: "S4-Q12", sellingPrice: "50000", source: "IMPORTED" });
    await createProduct(token, { code: "LG-BBB", name: "Bravo split", model: "S4-Q18", sellingPrice: "70000", barcode: "BAR-42", trackSerial: true });
    await createProduct(token, { code: "DK-CCC", name: "Charlie VRV outdoor", catalogId: daikin, categoryId: vrv, sellingPrice: "900000", source: "LOCAL" });
    await createProduct(token, { code: "DK-DDD", name: "Delta VRV indoor", catalogId: daikin, categoryId: vrv, sellingPrice: "120000", source: "IMPORTED", trackSerial: true });
  });

  it("paginates and sorts", async () => {
    const res = await list({ sort: "-sellingPrice", page: 1, pageSize: 3 });
    expect(res.body.meta).toEqual({ page: 1, pageSize: 3, total: 4, totalPages: 2 });
    expect(res.body.data.map((p: any) => p.code)).toEqual(["DK-CCC", "DK-DDD", "LG-BBB"]);
    const page2 = await list({ sort: "-sellingPrice", page: 2, pageSize: 3 });
    expect(page2.body.data.map((p: any) => p.code)).toEqual(["LG-AAA"]);
    expect((await list({ sort: "code" })).body.data.map((p: any) => p.code)).toEqual(["DK-CCC", "DK-DDD", "LG-AAA", "LG-BBB"]);
    expect((await list({ sort: "purchaseCost" })).status).toBe(400);
  });

  it("searches name, code, model and barcode", async () => {
    const q = async (q: string) => (await list({ q })).body.data.map((p: any) => p.code).sort();
    expect(await q("bravo")).toEqual(["LG-BBB"]);
    expect(await q("dk-")).toEqual(["DK-CCC", "DK-DDD"]);
    expect(await q("q12")).toEqual(["LG-AAA"]);
    expect(await q("bar-42")).toEqual(["LG-BBB"]);
  });

  it("filters by catalog, category, source and trackSerial", async () => {
    const codes = async (query: Record<string, string>) => (await list(query)).body.data.map((p: any) => p.code).sort();
    expect(await codes({ catalogId: await catalogId("Daikin") })).toEqual(["DK-CCC", "DK-DDD"]);
    expect(await codes({ categoryId: await categoryId("Split AC") })).toEqual(["LG-AAA", "LG-BBB"]);
    expect(await codes({ source: "local" })).toEqual(["DK-CCC"]);
    expect(await codes({ trackSerial: "true" })).toEqual(["DK-DDD", "LG-BBB"]);
    expect(await codes({ catalogId: await catalogId("Daikin"), source: "IMPORTED" })).toEqual(["DK-DDD"]);
  });
});

describe("purchaseCost is sensitive", () => {
  it("is present for Admin and absent everywhere for Store Manager (no seeCost)", async () => {
    const p = await createProduct(token, { code: "COST-1" });
    expect((await list({})).body.data[0].purchaseCost).toBe("61000.00");

    const { token: store } = await tokenForRole(token, "Store Manager");
    const listRes = await list({}, store);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data[0]).not.toHaveProperty("purchaseCost");
    expect(listRes.body.data[0].sellingPrice).toBe("85000.00");
    const one = await call(productRoute.GET, "GET", `/products/${p.id}`, { token: store, params: { id: p.id } });
    expect(one.body.data).not.toHaveProperty("purchaseCost");
    const hist = await call(historyRoute.GET, "GET", `/products/${p.id}/history`, { token: store, params: { id: p.id } });
    expect(hist.status).toBe(200);
    expect(JSON.stringify(hist.body)).not.toContain("purchaseCost");
    expect(JSON.stringify(hist.body)).not.toContain("61000");
  });

  it("can't be set by a role without seeCost: it starts at 0 and edits ignore it", async () => {
    const { token: store } = await tokenForRole(token, "Store Manager", "FULL");
    const res = await post(await productBody({ code: "NOCOST-1", purchaseCost: "999" }), store);
    expect(res.status).toBe(201);
    expect(res.body.data).not.toHaveProperty("purchaseCost");
    const row = await prisma.product.findUniqueOrThrow({ where: { code: "NOCOST-1" } });
    expect(row.purchaseCost.toFixed(2)).toBe("0.00");
    await patch(row.id, { purchaseCost: "5", name: "x" }, store);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: row.id } })).purchaseCost.toFixed(2)).toBe("0.00");
  });
});

describe("catalog permissions", () => {
  it("VIEW can read but not create (403)", async () => {
    const { token: view } = await tokenForRole(token, "Manager");
    expect((await list({}, view)).status).toBe(200);
    expect((await post(await productBody(), view)).status).toBe(403);
  });

  it("CREATE can create but not edit or discontinue (403)", async () => {
    const { token: creator } = await tokenForRole(token, "Manager", "CREATE");
    const res = await post(await productBody({ code: "MINE-1" }), creator);
    expect(res.status).toBe(201);
    expect((await patch(res.body.data.id, { name: "nope" }, creator)).status).toBe(403);
    const id = res.body.data.id;
    expect((await call(discontinueRoute.POST, "POST", `/products/${id}/discontinue`, { token: creator, params: { id } })).status).toBe(403);
  });

  it("FULL can create and edit", async () => {
    const { token: full } = await tokenForRole(token, "Manager", "FULL");
    const res = await post(await productBody(), full);
    expect(res.status).toBe(201);
    expect((await patch(res.body.data.id, { name: "edited" }, full)).status).toBe(200);
  });

  it("users without catalog access get 403 on reads", async () => {
    const { token: none } = await tokenForRole(token, "Store Manager", "NONE");
    expect((await list({}, none)).status).toBe(403);
  });
});

describe("catalog and category deletion", () => {
  it("is blocked while products use them (422) and allowed when unused", async () => {
    await createProduct(token);
    const lg = await catalogId("LG");
    const res = await call(catalogRoute.DELETE, "DELETE", `/catalogs/${lg}`, { token, params: { id: lg } });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].code).toBe("CATALOG_IN_USE");
    const split = await categoryId("Split AC");
    const cat = await call(categoryRoute.DELETE, "DELETE", `/categories/${split}`, { token, params: { id: split } });
    expect(cat.status).toBe(422);
    expect(cat.body.error.details[0].code).toBe("CATEGORY_IN_USE");

    const unused = await categoryId("Controls");
    expect((await call(categoryRoute.DELETE, "DELETE", `/categories/${unused}`, { token, params: { id: unused } })).status).toBe(204);
  });
});

describe("product history", () => {
  it("lists create, update and discontinue newest first", async () => {
    const p = await createProduct(token);
    await patch(p.id, { name: "v2" });
    await call(discontinueRoute.POST, "POST", `/products/${p.id}/discontinue`, { token, params: { id: p.id } });
    const res = await call(historyRoute.GET, "GET", `/products/${p.id}/history`, { token, params: { id: p.id } });
    expect(res.body.data.map((a: any) => a.action)).toEqual(["product.discontinue", "product.update", "product.create"]);
    expect(res.body.data[0].user).toMatchObject({ username: "admin" });
  });
});
