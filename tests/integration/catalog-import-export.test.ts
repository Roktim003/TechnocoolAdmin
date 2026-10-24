import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { Worker } from "bullmq";
import * as templateRoute from "@/app/api/v1/products/import/template/route";
import * as importRoute from "@/app/api/v1/products/import/route";
import * as importStatusRoute from "@/app/api/v1/products/import/[jobId]/route";
import * as exportRoute from "@/app/api/v1/products/export/route";
import { processCatalogImportJob } from "@/modules/catalog/interface/import-jobs";
import { getQueue, queuePrefix, QUEUES } from "@/shared/queue/queue";
import { bullConnection } from "@/shared/redis/redis";
import { logger } from "@/shared/logger/logger";
import { call } from "../helpers/http";
import { prisma, resetDatabase } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";
import { catalogId, createProduct, form, tokenForRole } from "../helpers/catalog";

let token: string;
let worker: Worker;

beforeAll(() => {
  worker = new Worker(QUEUES.catalogImport, (job) => processCatalogImportJob(job, logger), { connection: bullConnection(), prefix: queuePrefix() });
});

afterAll(async () => {
  await worker.close();
  await getQueue(QUEUES.catalogImport).close();
});

beforeEach(async () => {
  await resetDatabase();
  token = await adminToken();
});

async function template(t = token): Promise<ExcelJS.Workbook> {
  const res = await call(templateRoute.GET, "GET", "/products/import/template", { token: t });
  expect(res.status).toBe(200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.bytes as unknown as ArrayBuffer);
  return wb;
}

/** Builds an import file from the template with `rows` (keyed by template header without "*"). */
async function file(rows: Record<string, string | number>[], t = token): Promise<Uint8Array> {
  const wb = await template(t);
  const ws = wb.getWorksheet("Products")!;
  ws.spliceRows(2, 1); // drop the example row
  const headers = (ws.getRow(1).values as string[]).map((h) => (h ?? "").replace(" *", ""));
  rows.forEach((r, i) => headers.forEach((h, col) => h && r[h] !== undefined && (ws.getCell(i + 2, col).value = r[h])));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

const row = (code: string, extra: Record<string, string | number> = {}) => ({
  "Code / SKU": code,
  "Item name": `Imported ${code}`,
  "Brand (catalog)": "Daikin",
  "Category": "Fan coil unit",
  "Unit": "pcs",
  "Purchase cost (BDT)": 12000,
  "Selling price (BDT)": "15500.5",
  ...extra,
});

async function runImport(bytes: Uint8Array, mode: "validate" | "commit", t = token) {
  const res = await call(importRoute.POST, "POST", "/products/import", { token: t, body: form([{ name: "products.xlsx", bytes }], { mode }) });
  expect(res.status, JSON.stringify(res.body)).toBe(202);
  const jobId = res.body.data.jobId as string;
  for (let i = 0; i < 100; i++) {
    const s = await call(importStatusRoute.GET, "GET", `/products/import/${jobId}`, { token: t, params: { jobId } });
    if (s.body.data.status === "completed" || s.body.data.status === "failed") return { jobId, ...s.body.data };
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("import job timed out");
}

describe("import template", () => {
  it("has headers, an example row and a Lists sheet of valid values", async () => {
    const wb = await template();
    const ws = wb.getWorksheet("Products")!;
    const headers = (ws.getRow(1).values as string[]).filter(Boolean);
    expect(headers).toEqual(expect.arrayContaining(["Code / SKU *", "Item name *", "Brand (catalog) *", "Category *", "Unit *", "Purchase cost (BDT) *", "Selling price (BDT) *", "Barcode"]));
    expect(ws.getRow(2).getCell(1).value).toBe("LG-S18ET");
    const lists = wb.getWorksheet("Lists")!;
    const col = (n: number) => (lists.getColumn(n).values as string[]).filter(Boolean);
    expect(col(1)).toEqual(["Catalogs (brands)", "LG", "Daikin", "Dunham-Bush"]);
    expect(col(2)).toContain("VRF / VRV");
    expect(col(3)).toEqual(expect.arrayContaining(["pcs", "set", "m", "roll"]));
  });

  it("omits the cost column for roles without seeCost", async () => {
    const { token: noCost } = await tokenForRole(token, "Store Manager", "FULL");
    const headers = ((await template(noCost)).getWorksheet("Products")!.getRow(1).values as string[]).filter(Boolean);
    expect(headers.some((h) => h.startsWith("Purchase cost"))).toBe(false);
  });
});

describe("import", () => {
  it("validate mode reports row errors and writes nothing", async () => {
    await createProduct(token, { code: "EXISTS-1" });
    const bytes = await file([
      row("NEW-1"),
      row("EXISTS-1"),
      row("bad code"),
      row("NEW-2", { "Brand (catalog)": "Samsung", "Unit": "crate" }),
      row("NEW-3", { "Selling price (BDT)": "abc" }),
      row("NEW-1"),
    ]);
    const res = await runImport(bytes, "validate");
    expect(res.status).toBe("completed");
    expect(res.result).toMatchObject({ totalRows: 6, validRows: 1, committed: false, createdCount: 0 });
    const errs = res.result.errors.map((e: any) => `${e.row}:${e.field}`);
    expect(errs).toEqual(
      expect.arrayContaining(["3:Code / SKU", "4:Code / SKU", "5:Brand (catalog)", "5:Unit", "6:Selling price (BDT)", "7:Code / SKU"]),
    );
    expect(res.result.errors.find((e: any) => e.row === 7).message).toMatch(/Duplicate code 'NEW-1' \(also in row 2\)/);
    expect(res.result.errors.find((e: any) => e.row === 3).message).toMatch(/already exists/);
    expect(await prisma.product.count()).toBe(1);
  });

  it("commit mode is all-or-nothing: one bad row means nothing is created", async () => {
    const res = await runImport(await file([row("OK-1"), row("OK-2"), row("OK-3", { Category: "Nope" })]), "commit");
    expect(res.result).toMatchObject({ committed: false, createdCount: 0, validRows: 2 });
    expect(res.result.errors).toHaveLength(1);
    expect(await prisma.product.count()).toBe(0);
  });

  it("commit mode creates every product in one go, with audit rows", async () => {
    const res = await runImport(await file([row("IMP-1", { "Track serial numbers": "Yes", Source: "Imported" }), row("IMP-2", { "Barcode": "IMPBAR-2" })]), "commit");
    expect(res.result).toMatchObject({ committed: true, createdCount: 2, totalRows: 2, errors: [] });
    const p = await prisma.product.findUniqueOrThrow({ where: { code: "IMP-1" } });
    expect(p).toMatchObject({ trackSerial: true, source: "IMPORTED", catalogId: await catalogId("Daikin") });
    expect(p.sellingPrice.toFixed(2)).toBe("15500.50");
    expect(p.purchaseCost.toFixed(2)).toBe("12000.00");
    expect(await prisma.auditLog.count({ where: { action: "product.create" } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: "product.import" } })).toBe(1);
  });

  it("detects duplicate barcodes in the file", async () => {
    const res = await runImport(await file([row("B-1", { Barcode: "SAME" }), row("B-2", { Barcode: "SAME" })]), "validate");
    expect(res.result.errors).toEqual([expect.objectContaining({ row: 3, field: "Barcode" })]);
  });

  it("rejects files that are not .xlsx (400) and requires FULL (403)", async () => {
    const bad = await call(importRoute.POST, "POST", "/products/import", { token, body: form([{ name: "x.csv", bytes: new TextEncoder().encode("a,b") }]) });
    expect(bad.status).toBe(400);
    const { token: view } = await tokenForRole(token, "Manager");
    const denied = await call(importRoute.POST, "POST", "/products/import", { token: view, body: form([{ name: "x.xlsx", bytes: await file([row("X-1")]) }]) });
    expect(denied.status).toBe(403);
  });

  it("only the uploader can read a job's status", async () => {
    const res = await runImport(await file([row("OWN-1")]), "validate");
    const { token: other } = await tokenForRole(token, "Accounts", "FULL");
    expect((await call(importStatusRoute.GET, "GET", "/x", { token: other, params: { jobId: res.jobId } })).status).toBe(404);
  });
});

describe("export", () => {
  beforeEach(async () => {
    await createProduct(token, { code: "EXP-LG-1" });
    await createProduct(token, { code: "EXP-DK-1", catalogId: await catalogId("Daikin") });
  });

  async function exported(query: Record<string, string>, t = token) {
    const res = await call(exportRoute.GET, "GET", "/products/export", { token: t, query });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="products-\d{8}-\d{4}\.xlsx"/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.bytes as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Products")!;
    const headers = (ws.getRow(1).values as string[]).filter(Boolean);
    const codes: string[] = [];
    ws.eachRow((r, n) => n > 1 && codes.push(String(r.getCell(1).value)));
    return { headers, codes, ws };
  }

  it("respects filters", async () => {
    expect((await exported({ catalogId: await catalogId("Daikin") })).codes).toEqual(["EXP-DK-1"]);
    expect((await exported({ sort: "code" })).codes).toEqual(["EXP-DK-1", "EXP-LG-1"]);
    expect((await exported({ q: "lg" })).codes).toEqual(["EXP-LG-1"]);
  });

  it("includes purchase cost only with seeCost", async () => {
    const admin = await exported({});
    expect(admin.headers).toContain("Purchase cost (BDT)");
    expect(admin.ws.getRow(2).getCell(admin.headers.indexOf("Purchase cost (BDT)") + 1).value).toBe(61000);

    const { token: noCost } = await tokenForRole(token, "Store Manager", "FULL");
    const res = await exported({}, noCost);
    expect(res.headers).not.toContain("Purchase cost (BDT)");
    expect(res.headers).toContain("Selling price (BDT)");
  });
});
