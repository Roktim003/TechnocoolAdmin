import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as catalogRoute from "@/app/api/v1/reports/route";
import * as runRoute from "@/app/api/v1/reports/[id]/run/route";
import * as exportRoute from "@/app/api/v1/reports/[id]/exports/route";
import * as lookupsRoute from "@/app/api/v1/reports/lookups/route";
import * as schedulesRoute from "@/app/api/v1/report-schedules/route";
import { setQueryTimeoutMs } from "@/modules/reporting/infrastructure/sql";
import { call } from "../helpers/http";
import { resetDatabase } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";
import { createEntry, customer, grn, post, prisma, product, project, userToken, wh } from "../helpers/inventory";
import { approvedPo, customUser } from "../helpers/purchasing";

/**
 * One fixture for all 14 reports (built once): known receipts, a sale, a damage write-off, an
 * issue to a project, a low-stock item, serials, an overdue PO and an entry awaiting approval.
 */

let token: string;
let A: string;
let B: string;
const ids = {} as Record<"p1" | "p2" | "p3" | "p4" | "p1Code" | "p2Code" | "p3Code" | "sale" | "project" | "po" | "pending", string>;

const day = (n: number) => new Date(Date.now() + 6 * 3600_000 + n * 86400_000).toISOString().slice(0, 10);
const run = (id: string, query: Record<string, string | number> = {}, t = token) => call(runRoute.GET, "GET", "/x", { token: t, params: { id }, query });
const rowsOf = async (id: string, query: Record<string, string | number> = {}, t = token) => {
  const r = await run(id, query, t);
  if (r.status !== 200) throw new Error(`${id} ${r.status} ${JSON.stringify(r.body)}`);
  return r.body as { data: any[]; meta: any; totals: Record<string, any>; chart: any; report: any };
};

beforeAll(async () => {
  await resetDatabase();
  token = await adminToken();
  A = await wh("A");
  B = await wh("B");
  const p1 = await product(token, { sellingPrice: "1500" });
  const p2 = await product(token);
  const p3 = await product(token, { minStockLevel: "5" });
  const p4 = await product(token, { trackSerial: true });
  Object.assign(ids, { p1: p1.id, p2: p2.id, p3: p3.id, p4: p4.id, p1Code: p1.code, p2Code: p2.code, p3Code: p3.code });

  await grn(token, A, [{ productId: p1.id, qty: 10, unitPrice: 1000 }]);
  await grn(token, B, [{ productId: p2.id, qty: 4, unitPrice: 500 }]);
  await grn(token, A, [{ productId: p3.id, qty: 2, unitPrice: 100 }]);
  await grn(token, A, [{ productId: p4.id, qty: 2, unitPrice: 300, serials: ["SN-RPT-001", "SN-RPT-002"] }]);
  const sale = await post(token, { type: "SALE", warehouseId: A, customerId: await customer(), lines: [{ productId: p1.id, qty: 2 }] });
  ids.sale = sale.id;
  await post(token, { type: "DAMAGE_WRITE_OFF", warehouseId: A, reason: "Dropped", lines: [{ productId: p1.id, qty: 1 }] });
  ids.project = await project();
  await post(token, { type: "ISSUE_TO_PROJECT", warehouseId: A, projectId: ids.project, lines: [{ productId: p1.id, qty: 3 }] });
  const po = await approvedPo(token, [{ productId: p3.id, qty: 10, unitPrice: 200 }], { poDate: day(-10), expectedDeliveryDate: day(-3) });
  ids.po = po.id;
  const pending = await createEntry(token, { action: "submit", type: "GRN_LOCAL", warehouseId: B, supplierId: (await prisma.supplier.findFirstOrThrow({ where: { name: "LG Electronics Bangladesh" } })).id, lines: [{ productId: p2.id, qty: 1, unitPrice: 500 }] });
  if (pending.status !== 201) throw new Error(`pending ${pending.status} ${JSON.stringify(pending.body)}`);
  ids.pending = pending.body.data.id;
}, 120_000);

afterAll(async () => {
  setQueryTimeoutMs(null);
  await prisma.$disconnect();
});

const row = (rows: any[], key: string, value: unknown) => rows.find((r) => r[key] === value);

describe("catalog and access", () => {
  it("lists the 14 reports in order with a schedule count", async () => {
    const r = await call(catalogRoute.GET, "GET", "/reports", { token });
    expect(r.status).toBe(200);
    expect(r.body.data.map((x: any) => x.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(r.body.scheduleCount).toBe(0);
  });

  it("Manager and Store Manager get 403 on every reports endpoint", async () => {
    for (const role of ["Manager", "Store Manager"]) {
      const t = (await userToken(token, role)).token;
      expect((await call(catalogRoute.GET, "GET", "/reports", { token: t })).status, role).toBe(403);
      expect((await run("stock-summary", {}, t)).status, role).toBe(403);
      expect((await call(exportRoute.POST, "POST", "/x", { token: t, params: { id: "stock-summary" }, body: { format: "xlsx" } })).status, role).toBe(403);
      expect((await call(lookupsRoute.GET, "GET", "/x", { token: t })).status, role).toBe(403);
      expect((await call(schedulesRoute.GET, "GET", "/x", { token: t })).status, role).toBe(403);
    }
  });

  it("unknown report → 404; bad page size → 400; bad sort → 400", async () => {
    expect((await run("nope")).status).toBe(404);
    expect((await run("stock-summary", { pageSize: 201 })).status).toBe(400);
    expect((await run("stock-summary", { sort: "secret" })).status).toBe(400);
    expect((await run("stock-movement", { dateFrom: "2026-10-10", dateTo: "2026-10-01" })).status).toBe(400);
  });

  it("a query over the time limit fails with a clear 503", async () => {
    setQueryTimeoutMs(1);
    try {
      const r = await run("stock-movement");
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe("QUERY_TIMEOUT");
      expect(r.body.error.message).toMatch(/narrow the filters/i);
    } finally {
      setQueryTimeoutMs(null);
    }
  });
});

describe("1 · stock summary", () => {
  it("quantities per warehouse, value at average cost, totals and chart", async () => {
    const r = await rowsOf("stock-summary");
    expect(r.meta.total).toBe(4);
    expect(row(r.data, "code", ids.p1Code)).toMatchObject({ wh_A: "4.000", wh_B: "0.000", total: "4.000", available: "4.000", avgCost: "1000.00", stockValue: "4000.00" });
    expect(row(r.data, "code", ids.p2Code)).toMatchObject({ wh_A: "0.000", wh_B: "4.000", stockValue: "2000.00" });
    expect(r.totals).toMatchObject({ products: 4, total: "12.000", stockValue: "6800.00" });
    expect(row(r.data, "code", ids.p1Code)._links.code).toBe(`/stock/products/${ids.p1}`);
    expect(r.chart.type).toBe("bar");
  });

  it("sort and pagination happen in the database", async () => {
    const p1 = await rowsOf("stock-summary", { sort: "-value", pageSize: 2, page: 1 });
    const p2 = await rowsOf("stock-summary", { sort: "-value", pageSize: 2, page: 2 });
    expect(p1.data.map((x) => x.stockValue)).toEqual(["4000.00", "2000.00"]);
    expect(p2.data.map((x) => x.stockValue)).toEqual(["600.00", "200.00"]);
    expect(p2.meta).toMatchObject({ page: 2, pageSize: 2, total: 4, totalPages: 2 });
    expect(p1.totals.stockValue).toBe("6800.00"); // totals cover every row, not the page
  });

  it("filters: warehouse and search", async () => {
    const b = await rowsOf("stock-summary", { warehouseId: B });
    expect(b.data.map((x) => x.code)).toEqual([ids.p2Code]);
    const q = await rowsOf("stock-summary", { q: ids.p3Code });
    expect(q.data).toHaveLength(1);
  });
});

describe("2 · stock movement", () => {
  it("every posted line in the range with in / out and value", async () => {
    const r = await rowsOf("stock-movement");
    expect(r.totals).toMatchObject({ inQty: "18.000", outQty: "6.000", netQty: "12.000", valueChange: "6800.00" });
    const sale = r.data.find((x) => x.type === "SALE");
    expect(sale).toMatchObject({ outQty: "2.000", unitCost: "1000.00", valueChange: "-2000.00" });
    expect(sale._links.entryNo).toBe(`/stock/${ids.sale}`);
  });

  it("filters by warehouse, type and product", async () => {
    expect((await rowsOf("stock-movement", { warehouseId: B })).totals.inQty).toBe("4.000");
    expect((await rowsOf("stock-movement", { type: "DAMAGE_WRITE_OFF" })).data).toHaveLength(1);
    expect((await rowsOf("stock-movement", { productId: ids.p1 })).meta.total).toBe(4);
    expect((await rowsOf("stock-movement", { dateFrom: day(1), dateTo: day(2) })).meta.total).toBe(0);
  });
});

describe("3 · stock aging", () => {
  it("buckets by receipt age (FIFO), as of a date", async () => {
    const now = await rowsOf("stock-aging");
    expect(row(now.data, "code", ids.p1Code)).toMatchObject({ qtyAge0to30: "4.000", qtyAge31to90: "0.000", totalQty: "4.000", valueAge0to30: "4000.00" });
    const later = await rowsOf("stock-aging", { asOf: day(60) });
    expect(row(later.data, "code", ids.p1Code)).toMatchObject({ qtyAge0to30: "0.000", qtyAge31to90: "4.000" });
    const old = await rowsOf("stock-aging", { asOf: day(200) });
    expect(old.totals).toMatchObject({ qtyAge180plus: "12.000", valueAge180plus: "6800.00", totalValue: "6800.00" });
  });
});

describe("4 · low stock", () => {
  it("below minimum, with the Create PO action for purchasing ≥ CREATE only", async () => {
    const r = await rowsOf("low-stock");
    expect(r.data).toHaveLength(1);
    expect(r.data[0]).toMatchObject({ code: ids.p3Code, available: "2.000", minimum: "5.000", shortBy: "3.000" });
    expect(r.data[0]._id).toBe(ids.p3);
    expect(r.report.rowAction).toMatchObject({ kind: "createPo" });

    const accounts = (await userToken(token, "Accounts")).token; // purchasing VIEW
    const a = await rowsOf("low-stock", {}, accounts);
    expect(a.report.rowAction).toBeNull();
    expect(a.data[0]._id).toBeUndefined();
  });
});

describe("5 · serial lookup", () => {
  it("finds units by part of the serial", async () => {
    const r = await rowsOf("serial-lookup", { q: "SN-RPT" });
    expect(r.data.map((x) => x.serial)).toEqual(["SN-RPT-001", "SN-RPT-002"]);
    expect(r.data[0]).toMatchObject({ status: "IN_STOCK" });
    expect((await rowsOf("serial-lookup", { q: "SN-RPT", status: "SOLD" })).data).toHaveLength(0);
  });
});

describe("6–8 · purchases", () => {
  it("open POs: remaining quantity and overdue flag", async () => {
    const r = await rowsOf("open-pos");
    expect(r.data).toHaveLength(1);
    expect(r.data[0]).toMatchObject({ remaining: "10.000", overdue: "OVERDUE" });
    expect(r.data[0]._links.poNumber).toBe(`/purchases/${ids.po}`);
    expect((await rowsOf("open-pos", { overdueOnly: "true" })).data).toHaveLength(1);
    expect(r.totals).toMatchObject({ lines: 1, remaining: "10.000", overdueLines: 1 });
  });

  it("purchases by supplier: received at landed cost, imported vs local", async () => {
    const r = await rowsOf("purchases-by-supplier");
    const lg = row(r.data, "supplier", "LG Electronics Bangladesh");
    expect(lg).toMatchObject({ type: "LOCAL", poCount: 1, orderedValueBdt: "2000.00", grnCount: 4, importedValueBdt: "0.00", localValueBdt: "12800.00", receivedValueBdt: "12800.00" });
  });

  it("price history per product", async () => {
    const r = await rowsOf("price-history", { productId: ids.p1 });
    expect(r.data).toHaveLength(1);
    expect(r.data[0]).toMatchObject({ unitPriceBdt: "1000.00", currency: "BDT" });
  });
});

describe("9–10 · projects", () => {
  it("project cost summary: material at ledger cost", async () => {
    const r = await rowsOf("project-cost-summary");
    const p = r.data.find((x) => x._links.code === `/projects/${ids.project}`);
    expect(p).toMatchObject({ materialCost: "3000.00", totalCost: "3000.00" });
    expect(p).toHaveProperty("margin");
  });

  it("material by project", async () => {
    const r = await rowsOf("material-by-project", { projectId: ids.project });
    expect(r.data).toHaveLength(1);
    expect(r.data[0]).toMatchObject({ productCode: ids.p1Code, issued: "3.000", returned: "0.000", net: "3.000", netCost: "3000.00" });
  });
});

describe("11–13 · sales, losses and pending", () => {
  it("sales with cost and profit", async () => {
    const r = await rowsOf("sales");
    expect(r.data).toHaveLength(1);
    const s = r.data[0];
    expect(s.costTotal).toBe("2000.00");
    expect(Number(s.profit)).toBeCloseTo(Number(s.salesExVat) - 2000, 2);
    expect(r.totals.invoices).toBe(1);
  });

  it("damage & loss", async () => {
    const r = await rowsOf("damage-loss");
    expect(r.data).toHaveLength(1);
    expect(r.data[0]).toMatchObject({ reason: "Dropped", lossValue: "1000.00", status: "POSTED" });
  });

  it("pending verification", async () => {
    const r = await rowsOf("pending");
    expect(r.data).toHaveLength(1);
    expect(r.data[0]._links.number).toBe(`/stock/${ids.pending}`);
    expect(r.totals).toMatchObject({ records: 1, pendingValue: "500.00" });
    expect((await rowsOf("pending", { kind: "po" })).data).toHaveLength(0);
  });
});

describe("14 · audit log", () => {
  it("events with user and a change summary, filterable", async () => {
    const r = await rowsOf("audit-log");
    expect(r.meta.total).toBeGreaterThan(5);
    const entries = await rowsOf("audit-log", { entityType: "StockEntry" });
    expect(entries.data.length).toBeGreaterThan(0);
    expect(new Set(entries.data.map((x) => x.recordType)).size).toBe(1); // friendly label, e.g. "Stock entry"
    expect(entries.data[0].changes).toBeTruthy();
    const admin = await prisma.user.findFirstOrThrow({ where: { username: "admin" } });
    const byUser = await rowsOf("audit-log", { userId: admin.id });
    expect(byUser.data.every((x) => x.user === admin.name)).toBe(true);
  });
});

describe("sensitive fields and scope", () => {
  it("Accounts gets profit but no margin or contract value", async () => {
    const t = (await userToken(token, "Accounts")).token;
    const sales = await rowsOf("sales", {}, t);
    expect(sales.data[0]).toHaveProperty("profit");
    expect(sales.report.columns.map((c: any) => c.key)).toContain("profitPercent");
    const projects = await rowsOf("project-cost-summary", {}, t);
    const keys = projects.report.columns.map((c: any) => c.key);
    expect(keys).not.toContain("margin");
    expect(keys).not.toContain("contractValue");
    expect(keys).not.toContain("marginPercent");
    for (const r of projects.data) {
      expect(r).not.toHaveProperty("margin");
      expect(r).not.toHaveProperty("contractValue");
    }
    expect(projects.totals).not.toHaveProperty("margin");
    expect(projects.totals).not.toHaveProperty("contractValue");
    expect(JSON.stringify(projects)).not.toMatch(/16500000/);
  });

  it("without seeCost: no cost columns, totals or money chart", async () => {
    const u = await customUser(token, { reports: "VIEW" }, {});
    const r = await rowsOf("stock-summary", {}, u.token);
    const keys = r.report.columns.map((c: any) => c.key);
    expect(keys).not.toContain("stockValue");
    expect(keys).not.toContain("avgCost");
    expect(r.data[0]).not.toHaveProperty("stockValue");
    expect(r.totals).not.toHaveProperty("stockValue");
    expect(r.chart === null || r.chart.valueType !== "money").toBe(true);
    const sales = await rowsOf("sales", {}, u.token);
    expect(sales.data[0]).toHaveProperty("salesExVat");
    expect(sales.data[0]).not.toHaveProperty("costTotal");
    expect(sales.data[0]).not.toHaveProperty("profit");
  });

  it("rows are limited to the user's warehouses; another warehouse is 403", async () => {
    const u = await customUser(token, { reports: "VIEW" }, { seeCost: true }, ["B"]);
    const r = await rowsOf("stock-summary", {}, u.token);
    expect(r.data.map((x) => x.code)).toEqual([ids.p2Code]);
    expect(r.report.columns.map((c: any) => c.key)).not.toContain("wh_A");
    expect(r.totals.stockValue).toBe("2000.00");
    expect((await run("stock-summary", { warehouseId: A }, u.token)).status).toBe(403);
    expect((await rowsOf("stock-movement", {}, u.token)).totals.inQty).toBe("4.000");
    expect((await rowsOf("sales", {}, u.token)).data).toHaveLength(0);
    // Minimums are per product; in B alone the low-stock item has nothing available.
    expect((await rowsOf("low-stock", {}, u.token)).data.map((x) => [x.code, x.available])).toEqual([[ids.p3Code, "0.000"]]);
    expect((await rowsOf("serial-lookup", { q: "SN-RPT" }, u.token)).data).toHaveLength(0);
    expect((await rowsOf("open-pos", {}, u.token)).data).toHaveLength(0);
  });
});

describe("OpenAPI", () => {
  it("documents every reporting, schedule and dashboard endpoint", async () => {
    const openapiRoute = await import("@/app/api/v1/openapi.json/route");
    const doc = await (await openapiRoute.GET()).json();
    const expected: [string, string][] = [
      ["/reports", "get"], ["/reports/{id}/run", "get"], ["/reports/{id}/exports", "post"], ["/exports/{jobId}", "get"], ["/exports/{jobId}/download", "get"],
      ["/reports/lookups", "get"], ["/reports/lookups/products", "get"],
      ["/report-schedules", "get"], ["/report-schedules", "post"], ["/report-schedules/{id}", "get"], ["/report-schedules/{id}", "patch"], ["/report-schedules/{id}", "delete"],
      ["/report-schedules/{id}/pause", "post"], ["/report-schedules/{id}/resume", "post"], ["/report-schedules/{id}/run-now", "post"], ["/report-schedules/{id}/runs", "get"],
      ["/report-schedules/{id}/runs/{runId}/files/{index}", "get"], ["/dashboard", "get"],
    ];
    for (const [p, m] of expected) expect(doc.paths[p]?.[m], `${m} ${p}`).toBeDefined();
  });
});
