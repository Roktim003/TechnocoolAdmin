import ExcelJS from "exceljs";
import { Worker } from "bullmq";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as catalogRoute from "@/app/api/v1/reports/route";
import * as runRoute from "@/app/api/v1/reports/[id]/run/route";
import * as exportRoute from "@/app/api/v1/reports/[id]/exports/route";
import * as lookupsRoute from "@/app/api/v1/reports/lookups/route";
import * as statusRoute from "@/app/api/v1/exports/[jobId]/route";
import * as downloadRoute from "@/app/api/v1/exports/[jobId]/download/route";
import * as dashRoute from "@/app/api/v1/dashboard/route";
import * as projectsRoute from "@/app/api/v1/projects/route";
import * as costsRoute from "@/app/api/v1/projects/[id]/costs/route";
import * as voidRoute from "@/app/api/v1/projects/[id]/costs/[costId]/void/route";
import * as costFilesRoute from "@/app/api/v1/projects/[id]/costs/[costId]/attachments/route";
import * as wcRoute from "@/app/api/v1/warehouse-costs/route";
import * as wcVoidRoute from "@/app/api/v1/warehouse-costs/[id]/void/route";
import { principalForUser } from "@/modules/identity/interface/principal-loader";
import { todayInDhaka } from "@/modules/inventory/domain/numbering";
import { covers, recipientAudience } from "@/modules/reporting/application/schedule.service";
import { monthLabel } from "@/modules/reporting/domain/schedule";
import { intersectFlags, visibleColumns } from "@/modules/reporting/domain/visibility";
import { projectCostSummary } from "@/modules/reporting/infrastructure/reports/projects";
import { processReportJob, reporting, viewerOf } from "@/modules/reporting/interface/container";
import { logger } from "@/shared/logger/logger";
import { QUEUES, queuePrefix } from "@/shared/queue/queue";
import { bullConnection } from "@/shared/redis/redis";
import { call } from "../helpers/http";
import { resetDatabase } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";
import { grn, key, post, prisma, product, userToken, wh } from "../helpers/inventory";
import { customUser } from "../helpers/purchasing";

/**
 * Overheads in reports and on the dashboard: project cost summary (direct vs full cost, margins),
 * Warehouse holding cost (#16), Overheads: spent vs charged to projects (#17), the audit log,
 * the dashboard tiles and schedule audiences. One fixture, built once:
 *
 * - Warehouse A: a GRN of 10 × 1 000 today, 2 issued to project 1 → closing stock value 8 000.
 * - Project 1 (contract 20 000): material 2 000 + labour 1 000 = direct 3 000; overheads store
 *   charge 500 + holding 300 + established 200 = 1 000 (+ a voided holding 777) → full 4 000.
 * - Project 2: established 100 over the period M-2 … M0 → 33.33 + 33.33 + 33.34.
 * - Register M0: A store charge 1 000, A holding 300 + 200 (+ a voided 999), B store charge 50,
 *   company established 2 000. M-1: A holding 123, company established 400.
 */

let token: string;
let worker: Worker;
let A: string;
let B: string;
let adminId: string;
let M0: string; // this month, YYYY-MM (Asia/Dhaka)
let M1: string; // last month
let M2: string; // two months ago
let dayOfMonth: number;
const p1 = {} as { id: string; code: string };
const p2 = {} as { id: string; code: string };
/** reports + projects + dashboard VIEW with seeCost / seeProfit / seeMargin, but no overheads (a "Manager with reports"). */
let noOh: { id: string; token: string };
/** Overheads VIEW + reports VIEW, warehouse B only. */
let scopedB: { id: string; token: string };
/** Overheads VIEW + dashboard VIEW (no reports), warehouse B only. */
let dashB: { id: string; token: string };
let accounts: { id: string; token: string };
let manager: { id: string; token: string };

const OVERHEAD_KEYS = ["storeChargeCost", "holdingCost", "establishmentCost", "overheadCost", "fullCost", "directMargin", "directMarginPercent"];

const run = (id: string, query: Record<string, string | number> = {}, t = token) => call(runRoute.GET, "GET", "/x", { token: t, params: { id }, query });
const rowsOf = async (id: string, query: Record<string, string | number> = {}, t = token) => {
  const r = await run(id, query, t);
  if (r.status !== 200) throw new Error(`${id} ${r.status} ${JSON.stringify(r.body)}`);
  return r.body as { data: any[]; meta: any; totals: Record<string, any>; chart: any; report: any };
};
const keysOf = (r: { report: any }) => r.report.columns.map((c: any) => c.key) as string[];
const labelOf = (r: { report: any }, k: string) => r.report.columns.find((c: any) => c.key === k)?.label;

const dashboard = async (t = token) => {
  const r = await call(dashRoute.GET, "GET", "/dashboard", { token: t });
  if (r.status !== 200) throw new Error(`dashboard ${r.status} ${JSON.stringify(r.body)}`);
  return r.body as { data: any[]; cached: boolean };
};
const widget = (d: { data: any[] }, id: string) => d.data.find((w) => w.id === id);

async function newProject(contractValue: string) {
  const r = await call(projectsRoute.POST, "POST", "/projects", { token, body: { clientName: "Overhead Client Ltd.", name: `Overhead project ${Date.now().toString(36)}`, status: "RUNNING", defaultWarehouseId: A, contractValue } });
  if (r.status !== 201) throw new Error(`project ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data as { id: string; code: string };
}
async function addCost(projectId: string, body: Record<string, unknown>) {
  const r = await call(costsRoute.POST, "POST", "/x", { token, params: { id: projectId }, body: { description: "Charge", ...body }, headers: { "Idempotency-Key": key("cost") } });
  if (r.status !== 201) throw new Error(`cost ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data as { id: string };
}
async function voidCost(projectId: string, costId: string) {
  const r = await call(voidRoute.POST, "POST", "/x", { token, params: { id: projectId, costId }, body: { reason: "Charged twice" }, headers: { "Idempotency-Key": key("void") } });
  if (r.status !== 200) throw new Error(`void cost ${r.status} ${JSON.stringify(r.body)}`);
}
async function addWc(body: Record<string, unknown>) {
  const r = await call(wcRoute.POST, "POST", "/warehouse-costs", { token, body: { description: "Overhead", ...body } });
  if (r.status !== 201) throw new Error(`warehouse cost ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data as { id: string };
}
async function voidWc(id: string) {
  const r = await call(wcVoidRoute.POST, "POST", "/x", { token, params: { id }, body: { reason: "Entered twice" }, headers: { "Idempotency-Key": key("wv") } });
  if (r.status !== 200) throw new Error(`void warehouse cost ${r.status} ${JSON.stringify(r.body)}`);
}

/* Excel export through the API and the in-process worker (the same path as the screen's Export button). */
async function exportXlsx(id: string, params: Record<string, string>, t = token) {
  const r = await call(exportRoute.POST, "POST", "/x", { token: t, params: { id }, body: { format: "xlsx", params } });
  if (r.status !== 202) throw new Error(`export ${r.status} ${JSON.stringify(r.body)}`);
  let done: any;
  for (let i = 0; i < 120 && !done; i++) {
    const s = await call(statusRoute.GET, "GET", "/x", { token: t, params: { jobId: r.body.data.jobId } });
    if (s.body.data?.status === "completed" || s.body.data?.status === "failed") done = s.body.data;
    else await new Promise((res) => setTimeout(res, 250));
  }
  if (done?.status !== "completed") throw new Error(`export failed: ${done?.failedReason}`);
  const u = new URL(done.downloadUrl, "http://x");
  const file = await call(downloadRoute.GET, "GET", u.pathname.replace("/api/v1", ""), { params: { jobId: u.pathname.split("/")[4]! }, query: Object.fromEntries(u.searchParams) });
  expect(file.status).toBe(200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(file.bytes) as unknown as ArrayBuffer);
  const ws = wb.worksheets[0]!;
  return { header: (ws.getRow(6).values as unknown[]).slice(1).map(String), all: JSON.stringify(ws.getSheetValues()) };
}

const money2 = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
const monthBack = (n: number) => {
  const [y, m] = todayInDhaka().slice(0, 7).split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 - n, 1)).toISOString().slice(0, 7);
};

beforeAll(async () => {
  await resetDatabase();
  token = await adminToken();
  A = await wh("A");
  B = await wh("B");
  adminId = (await prisma.user.findFirstOrThrow({ where: { username: "admin" } })).id;
  worker = new Worker(QUEUES.reports, (job) => processReportJob(job, logger), { connection: bullConnection(), prefix: queuePrefix() });
  [M0, M1, M2] = [monthBack(0), monthBack(1), monthBack(2)];
  dayOfMonth = Number(todayInDhaka().slice(8, 10));

  noOh = await customUser(token, { reports: "VIEW", projects: "VIEW", dashboard: "VIEW", inventory: "VIEW", overheads: "NONE" }, { seeCost: true, seeProfit: true, seeMargin: true });
  scopedB = await customUser(token, { reports: "VIEW", overheads: "VIEW" }, { seeCost: true }, ["B"]);
  dashB = await customUser(token, { dashboard: "VIEW", overheads: "VIEW" }, { seeCost: true }, ["B"]);
  accounts = await userToken(token, "Accounts");
  manager = await userToken(token, "Manager");

  // Stock and project 1.
  Object.assign(p1, await newProject("20000"));
  const item = await product(token);
  await grn(token, A, [{ productId: item.id, qty: 10, unitPrice: 1000 }]);
  await post(token, { type: "ISSUE_TO_PROJECT", warehouseId: A, projectId: p1.id, lines: [{ productId: item.id, qty: 2 }] });
  await addCost(p1.id, { category: "LABOUR", amount: "1000" });
  const store = await addCost(p1.id, { category: "STORE_CHARGE", amount: "500" });
  await addCost(p1.id, { category: "HOLDING", amount: "300" });
  await addCost(p1.id, { category: "ESTABLISHMENT", amount: "200" });
  await voidCost(p1.id, (await addCost(p1.id, { category: "HOLDING", amount: "777" })).id);
  // A receipt on an overhead line (its audit row is an overhead row too).
  const fd = new FormData();
  fd.append("file", new File([new TextEncoder().encode("%PDF-1.4\n% bill\n%%EOF\n") as BlobPart], "bill.pdf", { type: "application/pdf" }));
  const up = await call(costFilesRoute.POST, "POST", "/x", { token, params: { id: p1.id, costId: store.id }, body: fd });
  if (up.status !== 201) throw new Error(`receipt ${up.status} ${JSON.stringify(up.body)}`);

  // Project 2: one established-cost line spread over three months.
  Object.assign(p2, await newProject("5000"));
  await addCost(p2.id, { category: "ESTABLISHMENT", amount: "100", periodFrom: `${M2}-01`, periodTo: `${M0}-01` });

  // The register.
  await addWc({ scope: "WAREHOUSE", warehouseId: A, category: "STORE_CHARGE", month: M0, amount: "1000" });
  await addWc({ scope: "WAREHOUSE", warehouseId: A, category: "HOLDING", month: M0, amount: "300" });
  await addWc({ scope: "WAREHOUSE", warehouseId: A, category: "HOLDING", month: M0, amount: "200" });
  await voidWc((await addWc({ scope: "WAREHOUSE", warehouseId: A, category: "HOLDING", month: M0, amount: "999" })).id);
  await addWc({ scope: "WAREHOUSE", warehouseId: B, category: "STORE_CHARGE", month: M0, amount: "50" });
  await addWc({ scope: "COMPANY", category: "ESTABLISHMENT", month: M0, amount: "2000" });
  await addWc({ scope: "WAREHOUSE", warehouseId: A, category: "HOLDING", month: M1, amount: "123" });
  await addWc({ scope: "COMPANY", category: "ESTABLISHMENT", month: M1, amount: "400" });
}, 180_000);

afterAll(async () => {
  await worker.close();
  await prisma.$disconnect();
});

/* ───────────────────────── catalog ───────────────────────── */

describe("catalog", () => {
  it("overhead viewers get all 17 reports; others 15 (16 and 17 need overhead access)", async () => {
    const admin = await call(catalogRoute.GET, "GET", "/reports", { token });
    expect(admin.body.data.map((x: any) => x.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(admin.body.data.find((x: any) => x.id === "warehouse-holding-cost")).toMatchObject({ group: "Stock", number: 16 });
    expect(admin.body.data.find((x: any) => x.id === "overheads-spent-vs-charged")).toMatchObject({ group: "Projects", number: 17 });
    const other = await call(catalogRoute.GET, "GET", "/reports", { token: noOh.token });
    expect(other.body.data.map((x: any) => x.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    const pcs = other.body.data.find((x: any) => x.id === "project-cost-summary");
    for (const k of OVERHEAD_KEYS) expect(pcs.columns.map((c: any) => c.key)).not.toContain(k);
  });
});

/* ───────────────────────── 9. project cost summary ───────────────────────── */

describe("project cost summary with overheads", () => {
  it("Admin: overheads, direct and full cost; margin on full cost plus the direct margin", async () => {
    const r = await rowsOf("project-cost-summary", { q: p1.code });
    expect(r.data).toHaveLength(1);
    expect(r.data[0]).toMatchObject({
      materialCost: "2000.00",
      labourCost: "1000.00",
      totalCost: "3000.00",
      storeChargeCost: "500.00",
      holdingCost: "300.00",
      establishmentCost: "200.00",
      overheadCost: "1000.00",
      fullCost: "4000.00",
      contractValue: "20000.00",
      margin: "16000.00",
      marginPercent: "80.00",
      directMargin: "17000.00",
      directMarginPercent: "85.00",
    });
    expect(labelOf(r, "totalCost")).toBe("Direct cost");
    expect(labelOf(r, "fullCost")).toBe("Full cost");
    expect(r.totals).toMatchObject({ projects: 1, totalCost: "3000.00", overheadCost: "1000.00", fullCost: "4000.00", margin: "16000.00", directMargin: "17000.00" });
    expect(r.chart).toMatchObject({ title: "Full cost by project (incl. overheads)", requires: "overheads", points: [{ values: ["4000.00"] }] });
    expect(r.chart.points[0].label.startsWith(p1.code)).toBe(true);
    // Sorting by full cost / margin works for overhead viewers.
    expect((await run("project-cost-summary", { sort: "-full" })).status).toBe(200);
  });

  it("without overhead access: no overhead columns, totals or chart values; margin stays on direct cost", async () => {
    const r = await rowsOf("project-cost-summary", { q: p1.code }, noOh.token);
    const keys = keysOf(r);
    for (const k of OVERHEAD_KEYS) {
      expect(keys).not.toContain(k);
      expect(r.data[0]).not.toHaveProperty(k);
      expect(r.totals).not.toHaveProperty(k);
    }
    expect(labelOf(r, "totalCost")).toBe("Total cost");
    expect(r.data[0]).toMatchObject({ totalCost: "3000.00", contractValue: "20000.00", margin: "17000.00", marginPercent: "85.00" });
    expect(r.totals).toMatchObject({ totalCost: "3000.00", margin: "17000.00" });
    expect(r.chart).toMatchObject({ title: "Total cost by project", points: [{ values: ["3000.00"] }] });
    expect(JSON.stringify(r)).not.toMatch(/16000|4000\.00|"80\.00"/);
    // "full" sorts on the direct cost (no ordering by a hidden value), and isn't an error.
    expect((await run("project-cost-summary", { sort: "-full" }, noOh.token)).status).toBe(200);
  });

  it("Accounts (overheads, no seeMargin): overhead columns, but no margin of either kind", async () => {
    const r = await rowsOf("project-cost-summary", { q: p1.code }, accounts.token);
    expect(r.data[0]).toMatchObject({ totalCost: "3000.00", overheadCost: "1000.00", fullCost: "4000.00" });
    for (const k of ["contractValue", "margin", "marginPercent", "directMargin", "directMarginPercent"]) {
      expect(keysOf(r)).not.toContain(k);
      expect(r.data[0]).not.toHaveProperty(k);
    }
    expect(r.totals).not.toHaveProperty("directMargin");
  });

  it("Excel: overhead columns for Admin; none for a viewer without overhead access", async () => {
    const admin = await exportXlsx("project-cost-summary", { q: p1.code });
    expect(admin.header).toEqual(expect.arrayContaining(["Direct cost", "Store charge", "Holding cost", "Established cost", "Overheads", "Full cost", "Margin", "Direct margin"]));
    expect(admin.all).toMatch(/16000/);
    const other = await exportXlsx("project-cost-summary", { q: p1.code }, noOh.token);
    expect(other.header).toEqual(expect.arrayContaining(["Total cost", "Margin", "Margin %"]));
    for (const h of ["Direct cost", "Store charge", "Holding cost", "Established cost", "Overheads", "Full cost", "Direct margin", "Direct margin %"]) expect(other.header).not.toContain(h);
    expect(other.all).toMatch(/17000/);
    expect(other.all).not.toMatch(/16000/);
  });
});

/* ───────────────────────── 16. warehouse holding cost ───────────────────────── */

describe("warehouse holding cost", () => {
  it("sums a month's lines (voided excluded); holding % uses that month's average stock value", async () => {
    const r = await rowsOf("warehouse-holding-cost", { monthFrom: M0, monthTo: M0, warehouseId: A });
    expect(r.data).toHaveLength(1);
    // Closing value 0 on every day of the month before today, 8 000 today.
    const avg = money2(new Prisma.Decimal(8000).div(dayOfMonth));
    expect(r.data[0]).toEqual({
      month: monthLabel(`${M0}-01`),
      warehouse: "Warehouse A",
      storeChargeCost: "1000.00",
      holdingCost: "500.00",
      overheadCost: "1500.00",
      averageStockValue: avg,
      holdingPercent: money2(new Prisma.Decimal(500).div(avg).times(100)),
    });
  });

  it("every month × warehouse in scope, totals and a total-by-month chart", async () => {
    const r = await rowsOf("warehouse-holding-cost", { monthFrom: M1, monthTo: M0 });
    expect(r.meta.total).toBe(4);
    expect(r.data.map((x) => [x.month, x.warehouse])).toEqual([
      [monthLabel(`${M1}-01`), "Warehouse A"],
      [monthLabel(`${M1}-01`), "Warehouse B"],
      [monthLabel(`${M0}-01`), "Warehouse A"],
      [monthLabel(`${M0}-01`), "Warehouse B"],
    ]);
    // Last month: holding without any stock yet → no percentage.
    expect(r.data[0]).toMatchObject({ holdingCost: "123.00", overheadCost: "123.00", averageStockValue: "0.00", holdingPercent: null });
    expect(r.data[3]).toMatchObject({ storeChargeCost: "50.00", holdingCost: "0.00", overheadCost: "50.00" });
    expect(r.totals).toEqual({ storeChargeCost: "1050.00", holdingCost: "623.00", overheadCost: "1673.00" });
    expect(r.chart).toMatchObject({ type: "bar", points: [{ label: monthLabel(`${M1}-01`), values: ["123.00"] }, { label: monthLabel(`${M0}-01`), values: ["1550.00"] }] });
  });

  it("needs overhead access (403, also for exports) and respects warehouse scope", async () => {
    expect((await run("warehouse-holding-cost", {}, noOh.token)).status).toBe(403);
    expect((await run("overheads-spent-vs-charged", {}, noOh.token)).status).toBe(403);
    expect((await call(exportRoute.POST, "POST", "/x", { token: noOh.token, params: { id: "warehouse-holding-cost" }, body: { format: "xlsx" } })).status).toBe(403);
    expect((await run("warehouse-holding-cost", { warehouseId: A }, scopedB.token)).status).toBe(403);
    const b = await rowsOf("warehouse-holding-cost", { monthFrom: M0, monthTo: M0 }, scopedB.token);
    expect(b.data).toEqual([expect.objectContaining({ warehouse: "Warehouse B", storeChargeCost: "50.00" })]);
  });

  it("month filters: tokens resolve, and the last month can't be before the first", async () => {
    const r = await rowsOf("warehouse-holding-cost", { monthFrom: "lastMonth", monthTo: "thisMonth", warehouseId: A });
    expect(r.data.map((x) => x.month)).toEqual([monthLabel(`${M1}-01`), monthLabel(`${M0}-01`)]);
    expect((await run("warehouse-holding-cost", { monthFrom: M0, monthTo: M1 })).status).toBe(400);
    expect((await run("warehouse-holding-cost", { monthFrom: "2026-13" })).status).toBe(400);
  });
});

/* ───────────────────────── 17. spent vs charged ───────────────────────── */

describe("overheads: spent vs charged to projects", () => {
  it("per month and category; a period is spread evenly (last month takes the remainder); voided lines excluded", async () => {
    const r = await rowsOf("overheads-spent-vs-charged", { monthFrom: M2, monthTo: M0 });
    expect(r.data.map((x) => x.month)).toEqual([M2, M1, M0].map((m) => monthLabel(`${m}-01`)));
    const [m2, m1, m0] = r.data;
    expect(m2).toMatchObject({ establishmentSpent: "0.00", establishmentCharged: "33.33", establishmentDifference: "-33.33", totalSpent: "0.00", totalCharged: "33.33", totalDifference: "-33.33" });
    expect(m1).toMatchObject({ holdingSpent: "123.00", holdingCharged: "0.00", holdingDifference: "123.00", establishmentSpent: "400.00", establishmentCharged: "33.33", establishmentDifference: "366.67", totalDifference: "489.67" });
    expect(m0).toEqual({
      month: monthLabel(`${M0}-01`),
      storeChargeSpent: "1050.00",
      storeChargeCharged: "500.00",
      storeChargeDifference: "550.00",
      holdingSpent: "500.00",
      holdingCharged: "300.00",
      holdingDifference: "200.00",
      establishmentSpent: "2000.00",
      establishmentCharged: "233.34",
      establishmentDifference: "1766.66",
      totalSpent: "3550.00",
      totalCharged: "1033.34",
      totalDifference: "2516.66",
    });
    expect(r.totals).toMatchObject({ storeChargeSpent: "1050.00", holdingSpent: "623.00", holdingCharged: "300.00", establishmentSpent: "2400.00", establishmentCharged: "300.00", totalSpent: "4073.00", totalCharged: "1100.00", totalDifference: "2973.00" });
  });

  it("a range starting inside a period only counts that period's months in range", async () => {
    const r = await rowsOf("overheads-spent-vs-charged", { monthFrom: M1, monthTo: M1 });
    expect(r.data).toEqual([expect.objectContaining({ establishmentCharged: "33.33" })]);
  });

  it("store charge and holding spent are limited to the viewer's warehouses; the established cost is company-wide", async () => {
    const r = await rowsOf("overheads-spent-vs-charged", { monthFrom: M0, monthTo: M0 }, scopedB.token);
    expect(r.data[0]).toMatchObject({ storeChargeSpent: "50.00", holdingSpent: "0.00", establishmentSpent: "2000.00", storeChargeCharged: "500.00" });
  });
});

/* ───────────────────────── 14. audit log ───────────────────────── */

describe("audit log", () => {
  const actions = (r: { data: any[] }) => r.data.map((x) => x.action as string);

  it("overhead rows only for viewers with overhead access", async () => {
    const admin = actions(await rowsOf("audit-log", { pageSize: 200 }));
    expect(admin).toEqual(expect.arrayContaining(["project.overhead_add", "project.overhead_void", "project.cost_receipt_add", "warehouse_cost.create", "warehouse_cost.void", "project.cost_add"]));

    const r = await rowsOf("audit-log", { pageSize: 200 }, noOh.token);
    const other = actions(r);
    expect(other).toContain("project.cost_add"); // the labour line
    expect(other.filter((a) => a.startsWith("project.overhead_") || a.startsWith("warehouse_cost.") || a === "project.cost_receipt_add")).toEqual([]);
    expect(r.data.some((x) => x.recordType === "Overhead cost")).toBe(false);
    expect(r.meta.total).toBe(other.length);
    expect((await rowsOf("audit-log", { entityType: "WarehouseCost" }, noOh.token)).meta.total).toBe(0);
    expect((await rowsOf("audit-log", { entityType: "WarehouseCost" })).meta.total).toBeGreaterThan(0);
  });

  it("the record-type filter doesn't offer WarehouseCost without overhead access", async () => {
    const admin = await call(lookupsRoute.GET, "GET", "/x", { token });
    expect(admin.body.data.recordTypes).toContain("WarehouseCost");
    const other = await call(lookupsRoute.GET, "GET", "/x", { token: noOh.token });
    expect(other.body.data.recordTypes).not.toContain("WarehouseCost");
  });
});

/* ───────────────────────── schedule audiences ───────────────────────── */

describe("schedule audiences", () => {
  it("a recipient without overhead access never gets overhead data, whatever the owner's permissions", async () => {
    const owner = viewerOf((await principalForUser(adminId))!);
    const recipient = viewerOf((await principalForUser(noOh.id))!);
    expect(owner.flags.overheads).toBe(true);
    expect(recipient.flags.overheads).toBe(false);

    const audience = recipientAudience(owner, recipient);
    expect(audience.flags).toEqual({ seeCost: true, seeProfit: true, seeMargin: true, overheads: false });
    expect(intersectFlags(recipient.flags, owner.flags).overheads).toBe(false);
    const cols = visibleColumns(projectCostSummary.columns([], audience.flags), audience.flags).map((c) => c.key);
    for (const k of OVERHEAD_KEYS) expect(cols).not.toContain(k);
    // The recipient can't download the owner's file (made for overhead access).
    expect(covers(recipient, recipientAudience(owner, owner))).toBe(false);
    expect(covers(owner, audience)).toBe(true);

    // As a schedule run builds the file: the owner's permissions (overheads FULL) with the audience's flags.
    const asSent = { ...owner, flags: audience.flags, warehouseIds: audience.warehouseIds };
    const p = await reporting().reports.prepare(asSent, "project-cost-summary", { q: p1.code });
    for (const k of OVERHEAD_KEYS) expect(p.columns.map((c) => c.key)).not.toContain(k);
    const out = reporting().reports.shape(p, await p.def.run(p.params, { page: 1, pageSize: 10, offset: 0, sort: p.sort, summary: true }, p.ctx));
    expect(out.rows[0]).toMatchObject({ totalCost: "3000.00", margin: "17000.00", marginPercent: "85.00" });
    expect(JSON.stringify(out)).not.toMatch(/16000|4000\.00/);
    await expect(reporting().reports.prepare(asSent, "warehouse-holding-cost", {})).rejects.toMatchObject({ status: 403 });

    // And the other way round: an owner without overhead access never sends overheads either.
    expect(recipientAudience(recipient, owner).flags.overheads).toBe(false);
  });
});

/* ───────────────────────── dashboard (last: one test adds a charge) ───────────────────────── */

describe("dashboard tiles", () => {
  it("Admin and Accounts: overheads this month and not yet charged to projects", async () => {
    for (const t of [token, accounts.token]) {
      const d = await dashboard(t);
      expect(widget(d, "overheadsThisMonth")).toMatchObject({ kind: "kpi", value: "3550.00", valueType: "money", link: "/reports?r=overheads-spent-vs-charged&monthFrom=thisMonth&monthTo=thisMonth" });
      expect(widget(d, "overheadsNotCharged")).toMatchObject({ value: "2516.66", valueType: "money" });
    }
  });

  it("Manager and other roles without overhead access: no tiles, no overhead amounts", async () => {
    for (const t of [manager.token, noOh.token]) {
      const d = await dashboard(t);
      expect(widget(d, "overheadsThisMonth")).toBeUndefined();
      expect(widget(d, "overheadsNotCharged")).toBeUndefined();
      expect(JSON.stringify(d)).not.toMatch(/3550\.00|2516\.66/);
    }
  });

  it("warehouse scope: store charge / holding of the user's warehouses + the company's established cost", async () => {
    const d = await dashboard(dashB.token);
    expect(widget(d, "overheadsThisMonth")).toMatchObject({ value: "2050.00", link: "/warehouse-costs" });
    expect(widget(d, "overheadsNotCharged").value).toBe("1016.66");
  });

  it("project cost vs contract: full cost with overhead access, direct cost without", async () => {
    const admin = widget(await dashboard(), "project-cost").chart;
    expect(admin.series[0]).toBe("Full cost");
    expect(admin.points.find((x: any) => x.label === p1.code).values).toEqual(["4000.00", "16000.00"]);
    const other = widget(await dashboard(noOh.token), "project-cost").chart;
    expect(other.series[0]).toBe("Total cost");
    expect(other.points.find((x: any) => x.label === p1.code).values).toEqual(["3000.00", "17000.00"]);
  });

  it("the cache key includes overhead access", async () => {
    const v = viewerOf((await principalForUser(adminId))!);
    const svc = reporting().dashboard;
    expect(svc.cacheKey(v)).not.toBe(svc.cacheKey({ ...v, flags: { ...v.flags, overheads: false } }));
  });

  it("not yet charged never goes below zero (and an overhead charge clears the cached tiles)", async () => {
    await dashboard(); // warm the cache
    await addCost(p2.id, { category: "ESTABLISHMENT", amount: "5000" });
    const d = await dashboard();
    expect(d.cached).toBe(false);
    expect(widget(d, "overheadsNotCharged").value).toBe("0.00");
    await addWc({ scope: "COMPANY", category: "ESTABLISHMENT", month: M0, amount: "10000" });
    const after = await dashboard();
    expect(after.cached).toBe(false);
    expect(widget(after, "overheadsThisMonth").value).toBe("13550.00");
  });
});
