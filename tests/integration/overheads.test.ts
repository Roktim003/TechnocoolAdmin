import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as projectsRoute from "@/app/api/v1/projects/route";
import * as projectRoute from "@/app/api/v1/projects/[id]/route";
import * as statusRoute from "@/app/api/v1/projects/[id]/status/route";
import * as activityRoute from "@/app/api/v1/projects/[id]/activity/route";
import * as materialRoute from "@/app/api/v1/projects/[id]/material/route";
import * as costsRoute from "@/app/api/v1/projects/[id]/costs/route";
import * as costRoute from "@/app/api/v1/projects/[id]/costs/[costId]/route";
import * as costHistoryRoute from "@/app/api/v1/projects/[id]/costs/[costId]/history/route";
import * as voidRoute from "@/app/api/v1/projects/[id]/costs/[costId]/void/route";
import * as costFilesRoute from "@/app/api/v1/projects/[id]/costs/[costId]/attachments/route";
import * as wcRoute from "@/app/api/v1/warehouse-costs/route";
import * as wcOneRoute from "@/app/api/v1/warehouse-costs/[id]/route";
import * as wcVoidRoute from "@/app/api/v1/warehouse-costs/[id]/void/route";
import * as wcHistoryRoute from "@/app/api/v1/warehouse-costs/[id]/history/route";
import * as wcFilesRoute from "@/app/api/v1/warehouse-costs/[id]/attachments/route";
import * as wcFileRoute from "@/app/api/v1/warehouse-costs/[id]/attachments/[attachmentId]/route";
import * as wcSummaryRoute from "@/app/api/v1/warehouse-costs/summary/route";
import * as wcExportRoute from "@/app/api/v1/warehouse-costs/summary/export/route";
import * as matrixRoute from "@/app/api/v1/roles/matrix/route";
import * as openapiRoute from "@/app/api/v1/openapi.json/route";
import { projects } from "@/modules/projects/interface/container";
import { costStatementHtml } from "@/modules/projects/interface/documents";
import { todayInDhaka } from "@/modules/inventory/domain/numbering";
import { call } from "../helpers/http";
import { resetDatabase } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";
import { balance, cost, grn, key, post, prisma, product, userToken, wh } from "../helpers/inventory";
import { customUser } from "../helpers/purchasing";

let token: string;
let A: string;
let B: string;

beforeEach(async () => {
  await resetDatabase();
  token = await adminToken();
  A = await wh("A");
  B = await wh("B");
});

afterAll(async () => {
  await prisma.$disconnect();
});

/* ── helpers ── */

async function newProject(body: Record<string, unknown> = {}, t = token) {
  const r = await call(projectsRoute.POST, "POST", "/projects", { token: t, body: { clientName: "Test Client Ltd.", name: `Project ${Date.now().toString(36)}`, status: "RUNNING", defaultWarehouseId: A, ...body } });
  if (r.status !== 201) throw new Error(`create project ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data as { id: string; code: string };
}
const get = (id: string, t = token) => call(projectRoute.GET, "GET", "/x", { token: t, params: { id } });
const summary = async (id: string, t = token) => (await get(id, t)).body.data.summary;
const status = (id: string, toStatus: string, reason?: string) =>
  call(statusRoute.POST, "POST", "/x", { token, params: { id }, body: { toStatus, ...(reason ? { reason } : {}) }, headers: { "Idempotency-Key": key("st") } });
const addCost = (id: string, body: Record<string, unknown>, t = token, k = key("cost")) =>
  call(costsRoute.POST, "POST", "/x", { token: t, params: { id }, body: { description: "Charge", amount: "1000", ...body }, headers: { "Idempotency-Key": k } });
const editCost = (id: string, costId: string, body: Record<string, unknown>, t = token) => call(costRoute.PATCH, "PATCH", "/x", { token: t, params: { id, costId }, body });
const voidCost = (id: string, costId: string, reason = "Charged twice", t = token) =>
  call(voidRoute.POST, "POST", "/x", { token: t, params: { id, costId }, body: { reason }, headers: { "Idempotency-Key": key("void") } });
const costHistory = (id: string, costId: string, t = token) => call(costHistoryRoute.GET, "GET", "/x", { token: t, params: { id, costId } });
const costs = (id: string, t = token) => call(costsRoute.GET, "GET", "/x", { token: t, params: { id } });

const addWc = (body: Record<string, unknown>, t = token, headers: Record<string, string> = {}) =>
  call(wcRoute.POST, "POST", "/warehouse-costs", { token: t, body: { amount: "1000", description: "Rent", ...body }, headers });
const listWc = (query: Record<string, string> = {}, t = token) => call(wcRoute.GET, "GET", "/warehouse-costs", { token: t, query });
const wcSummary = (query: Record<string, string>, t = token) => call(wcSummaryRoute.GET, "GET", "/warehouse-costs/summary", { token: t, query });
const thisMonth = () => todayInDhaka().slice(0, 7);
const monthOffset = (n: number) => {
  const [y, m] = thisMonth().split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
const codes = (r: { body: any }) => (r.body.error?.details ?? []).map((d: any) => d.code);

/** Moves the whole stock ledger to `postedAt` (the ledger is append-only: its trigger is paused for this test setup only). */
async function backdateLedger(postedAt: Date) {
  await prisma.$executeRawUnsafe(`ALTER TABLE "StockMovement" DISABLE TRIGGER USER`);
  try {
    await prisma.stockMovement.updateMany({ data: { postedAt } });
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "StockMovement" ENABLE TRIGGER USER`);
  }
}
const PDF = new TextEncoder().encode("%PDF-1.4\n% receipt\n%%EOF\n");

/** A project with material 2 000 (issued at ledger cost), labour 1 000 and contract 10 000. */
async function costedProject() {
  const pr = await newProject({ contractValue: "10000" });
  const p = await product(token);
  await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "200" }]);
  await post(token, { type: "ISSUE_TO_PROJECT", warehouseId: A, projectId: pr.id, lines: [{ productId: p.id, qty: 10 }] });
  expect((await addCost(pr.id, { category: "LABOUR", amount: "1000" })).status).toBe(201);
  return { pr, p };
}

/* ───────────────────────────── calculations ───────────────────────────── */

describe("overhead calculations", () => {
  it("directCost, overheadCost, fullCost, margin and directMargin", async () => {
    const { pr } = await costedProject();
    await addCost(pr.id, { category: "STORE_CHARGE", amount: "300", basisNote: "2% of material issued" });
    await addCost(pr.id, { category: "HOLDING", amount: "200" });
    await addCost(pr.id, { category: "ESTABLISHMENT", amount: "500", periodFrom: "2026-09-15", periodTo: "2026-10-03" });
    expect(await summary(pr.id)).toMatchObject({
      netMaterialCost: "2000.00",
      labourCost: "1000.00",
      totalCost: "3000.00",
      directCost: "3000.00",
      storeChargeCost: "300.00",
      holdingCost: "200.00",
      establishmentCost: "500.00",
      overheadCost: "1000.00",
      fullCost: "4000.00",
      contractValue: "10000.00",
      margin: "6000.00",
      marginPercent: "60.00",
      costUsedPercent: "40.00",
      directMargin: "7000.00",
      directMarginPercent: "70.00",
      directCostUsedPercent: "30.00",
    });
    // Period stored as whole months.
    const est = (await costs(pr.id)).body.data.costs.find((c: any) => c.category === "ESTABLISHMENT");
    expect(est).toMatchObject({ kind: "OVERHEAD", periodFrom: "2026-09-01", periodTo: "2026-10-31", categoryLabel: "Established cost (overhead)" });
    // Material endpoint carries the same summary.
    expect((await call(materialRoute.GET, "GET", "/x", { token, params: { id: pr.id } })).body.data.summary).toMatchObject({ fullCost: "4000.00" });
    // List cards too.
    const list = await call(projectsRoute.GET, "GET", "/projects", { token });
    expect(list.body.data.find((x: any) => x.id === pr.id).summary).toMatchObject({ fullCost: "4000.00", directCost: "3000.00" });
  });

  it("never changes stock quantities, unit cost, average cost or stock value", async () => {
    const { pr, p } = await costedProject();
    await grn(token, A, [{ productId: p.id, qty: 5, unitPrice: "300" }]);
    const before = { bal: await balance(p.id, "A"), cost: await cost(p.id), movements: await prisma.stockMovement.count(), lines: await prisma.stockEntryLine.findMany({ orderBy: { id: "asc" } }) };
    const c = (await addCost(pr.id, { category: "STORE_CHARGE", amount: "999" })).body.data;
    await editCost(pr.id, c.id, { amount: "1500" });
    await voidCost(pr.id, c.id);
    await addWc({ scope: "WAREHOUSE", warehouseId: A, category: "HOLDING", month: thisMonth(), amount: "50000" });
    await addWc({ scope: "COMPANY", category: "ESTABLISHMENT", month: thisMonth(), amount: "80000" });
    expect(await balance(p.id, "A")).toEqual(before.bal);
    expect(await cost(p.id)).toEqual(before.cost);
    expect(await prisma.stockMovement.count()).toBe(before.movements);
    expect(await prisma.stockEntryLine.findMany({ orderBy: { id: "asc" } })).toEqual(before.lines);
  });
});

/* ───────────────────────────── permissions ───────────────────────────── */

describe("overhead permissions", () => {
  it("Manager and Store Manager can't add, edit or see overheads; Manager still adds labour, transport and other", async () => {
    const { pr } = await costedProject();
    const oh = (await addCost(pr.id, { category: "HOLDING", amount: "400" })).body.data;
    const mgr = await userToken(token, "Manager", ["A"]);
    const store = await userToken(token, "Store Manager", ["A"]);

    for (const cat of ["STORE_CHARGE", "HOLDING", "ESTABLISHMENT"]) expect((await addCost(pr.id, { category: cat }, mgr.token)).status).toBe(403);
    expect((await editCost(pr.id, oh.id, { amount: "1" }, mgr.token)).status).toBe(404);
    expect((await voidCost(pr.id, oh.id, "x".repeat(5), mgr.token)).status).toBe(404);
    expect((await costHistory(pr.id, oh.id, mgr.token)).status).toBe(404);
    expect((await call(costFilesRoute.GET, "GET", "/x", { token: mgr.token, params: { id: pr.id, costId: oh.id } })).status).toBe(404);
    for (const cat of ["LABOUR", "TRANSPORT", "OTHER"]) expect((await addCost(pr.id, { category: cat, amount: "10" }, mgr.token)).status).toBe(201);

    // Project data: direct cost only, no overhead keys, margin on direct cost.
    const s = await summary(pr.id, mgr.token);
    expect(s).toMatchObject({ totalCost: "3030.00", directCost: "3030.00" });
    for (const k of ["storeChargeCost", "holdingCost", "establishmentCost", "overheadCost", "fullCost", "directMargin"]) expect(s).not.toHaveProperty(k);
    const list = await costs(pr.id, mgr.token);
    expect(list.body.data.costs.some((c: any) => c.kind === "OVERHEAD")).toBe(false);
    expect(list.body.data.subtotals).toEqual({ labourCost: "1010.00", transportCost: "10.00", otherCost: "10.00", costsTotal: "1030.00" });
    const act = await call(activityRoute.GET, "GET", "/x", { token: mgr.token, params: { id: pr.id } });
    expect(act.body.data.audit.some((x: any) => x.action.startsWith("project.overhead_"))).toBe(false);
    expect(JSON.stringify((await get(pr.id, mgr.token)).body)).not.toMatch(/fullCost|overheadCost|holdingCost/);
    expect((await get(pr.id, mgr.token)).body.data.actions).toMatchObject({ addOverhead: false, seeOverheads: false });

    // Cost statement PDF: direct cost only.
    const html = (await costStatementHtml({ projectId: pr.id, userName: "Manager", showMargin: false, showOverheads: false })).html;
    expect(html).not.toContain("Holding cost");
    expect(html).not.toContain("Full cost");
    const full = (await costStatementHtml({ projectId: pr.id, userName: "Admin", showMargin: true, showOverheads: true })).html;
    expect(full).toContain("Holding cost");
    expect(full).toContain("Full cost (incl. overheads)");

    // The register.
    for (const t of [mgr.token, store.token]) {
      expect((await listWc({}, t)).status).toBe(403);
      expect((await addWc({ scope: "COMPANY", category: "ESTABLISHMENT", month: thisMonth() }, t)).status).toBe(403);
      expect((await wcSummary({}, t)).status).toBe(403);
    }
  });

  it("Accounts and Admin can (Accounts with projects VIEW only)", async () => {
    const { pr } = await costedProject();
    const acc = await userToken(token, "Accounts", ["A", "B"]);
    const c = await addCost(pr.id, { category: "ESTABLISHMENT", amount: "700" }, acc.token);
    expect(c.status).toBe(201);
    expect((await editCost(pr.id, c.body.data.id, { amount: "750", reason: "Revised share" }, acc.token)).status).toBe(200);
    expect((await summary(pr.id, acc.token)).establishmentCost).toBe("750.00");
    // Accounts still can't add a direct cost (projects VIEW).
    expect((await addCost(pr.id, { category: "LABOUR" }, acc.token)).status).toBe(403);
    const fd = new FormData();
    fd.append("file", new File([PDF as BlobPart], "bill.pdf", { type: "application/pdf" }));
    expect((await call(costFilesRoute.POST, "POST", "/x", { token: acc.token, params: { id: pr.id, costId: c.body.data.id }, body: fd })).status).toBe(201);
    expect((await addWc({ scope: "WAREHOUSE", warehouseId: A, category: "STORE_CHARGE", month: thisMonth() }, acc.token)).status).toBe(201);
    expect((await addWc({ scope: "COMPANY", category: "ESTABLISHMENT", month: thisMonth() })).status).toBe(201);
  });

  it("a role without overheads gets direct-cost figures only, even with seeCost and seeMargin", async () => {
    const { pr } = await costedProject();
    await addCost(pr.id, { category: "STORE_CHARGE", amount: "1000" });
    const u = await customUser(token, { projects: "FULL", overheads: "NONE" }, { seeCost: true, seeMargin: true });
    const s = await summary(pr.id, u.token);
    expect(s).toMatchObject({ totalCost: "3000.00", margin: "7000.00", marginPercent: "70.00", costUsedPercent: "30.00" });
    expect(s).not.toHaveProperty("fullCost");
    // overheads VIEW without seeCost: still nothing.
    const noCost = await customUser(token, { projects: "VIEW", overheads: "FULL" }, { seeCost: false, seeMargin: true });
    expect(await summary(pr.id, noCost.token)).toMatchObject({ margin: "7000.00" });
    expect((await listWc({}, noCost.token)).status).toBe(403);
  });

  it("the RBAC matrix lists the overheads module", async () => {
    const m = await call(matrixRoute.GET, "GET", "/roles/matrix", { token });
    expect(m.body.data.modules.find((x: any) => x.key === "overheads")).toMatchObject({ key: "overheads", label: "Overheads" });
    const byName = Object.fromEntries(m.body.data.roles.map((r: any) => [r.name, r.permissions.overheads]));
    expect(byName).toEqual({ Admin: "FULL", Accounts: "FULL", Manager: "NONE", "Store Manager": "NONE" });
    const doc = await openapiRoute.GET().json();
    for (const p of ["/warehouse-costs", "/warehouse-costs/{id}", "/warehouse-costs/{id}/void", "/warehouse-costs/{id}/history", "/warehouse-costs/{id}/attachments", "/warehouse-costs/summary", "/projects/{id}/costs/{costId}", "/projects/{id}/costs/{costId}/history"]) {
      expect(doc.paths[p], p).toBeDefined();
    }
  });
});

/* ───────────────────────────── editing ───────────────────────────── */

describe("editing overheads", () => {
  it("edits on Running and Completed projects; a reason is required on Closed; voids exclude the row", async () => {
    const { pr } = await costedProject();
    const c = (await addCost(pr.id, { category: "STORE_CHARGE", amount: "300" })).body.data;
    expect((await editCost(pr.id, c.id, { amount: "350" })).status).toBe(200);
    expect((await summary(pr.id)).storeChargeCost).toBe("350.00");

    expect((await status(pr.id, "COMPLETED")).status).toBe(200);
    expect((await editCost(pr.id, c.id, { amount: "400" })).status).toBe(200);
    expect((await summary(pr.id)).fullCost).toBe("3400.00");

    expect((await status(pr.id, "CLOSED", "Handed over")).status).toBe(200);
    const noReason = await editCost(pr.id, c.id, { amount: "450" });
    expect(noReason.status).toBe(400);
    expect(codes(noReason)).toContain("REASON_REQUIRED");
    expect((await editCost(pr.id, c.id, { amount: "450", reason: "Final rent invoice" })).status).toBe(200);
    expect((await addCost(pr.id, { category: "HOLDING", amount: "50" })).status).toBe(400);
    expect((await addCost(pr.id, { category: "HOLDING", amount: "50", reason: "Late holding bill" })).status).toBe(201);
    // Direct costs stay read-only on closed projects.
    expect(codes(await addCost(pr.id, { category: "LABOUR", amount: "1" }))).toContain("PROJECT_CLOSED");

    expect((await summary(pr.id)).overheadCost).toBe("500.00");
    expect((await voidCost(pr.id, c.id, "Charged to the wrong project")).status).toBe(200);
    expect(await summary(pr.id)).toMatchObject({ storeChargeCost: "0.00", overheadCost: "50.00", fullCost: "3050.00" });
    const all = await call(costsRoute.GET, "GET", "/x", { token, params: { id: pr.id }, query: { includeVoided: "true" } });
    expect(all.body.data.costs.find((x: any) => x.id === c.id)).toMatchObject({ voided: true, voidReason: "Charged to the wrong project" });
  });

  it("audit-logs every edit with before / after; the history endpoint returns the trail", async () => {
    const { pr } = await costedProject();
    const c = (await addCost(pr.id, { category: "HOLDING", amount: "200", description: "Security" })).body.data;
    await editCost(pr.id, c.id, { amount: "260", description: "Security and insurance", reason: "Insurance added" });
    await voidCost(pr.id, c.id, "Moved to the warehouse register");
    const logs = await prisma.auditLog.findMany({ where: { entityId: pr.id, action: { startsWith: "project.overhead_" } }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => l.action)).toEqual(["project.overhead_add", "project.overhead_edit", "project.overhead_void"]);
    expect(logs[1]!.before).toMatchObject({ costId: c.id, amount: "200.00", description: "Security" });
    expect(logs[1]!.after).toMatchObject({ costId: c.id, amount: "260.00", description: "Security and insurance", reason: "Insurance added" });

    const h = (await costHistory(pr.id, c.id)).body.data.history;
    expect(h.map((x: any) => x.action)).toEqual(["CREATED", "EDITED", "VOIDED"]);
    expect(h[1]).toMatchObject({ amountBefore: "200.00", amount: "260.00", reason: "Insurance added", by: { name: expect.any(String) } });
    expect(h[1].changes).toEqual(expect.arrayContaining([{ field: "amount", from: "200.00", to: "260.00" }, { field: "description", from: "Security", to: "Security and insurance" }]));
    expect(h[2]).toMatchObject({ reason: "Moved to the warehouse register" });
  });

  it("only overheads can be edited; warnings for a large line and overheads above 30 % of direct cost", async () => {
    const { pr } = await costedProject(); // direct 3 000
    const labour = (await costs(pr.id)).body.data.costs.find((c: any) => c.category === "LABOUR");
    expect(codes(await editCost(pr.id, labour.id, { amount: "5" }))).toContain("COST_NOT_EDITABLE");
    const small = await addCost(pr.id, { category: "HOLDING", amount: "100" });
    expect(small.body.data.warnings).toEqual([]);
    const big = await addCost(pr.id, { category: "ESTABLISHMENT", amount: "1000000.01" });
    expect(big.body.data.warnings.map((w: any) => w.code)).toEqual(["OVERHEAD_LARGE_AMOUNT", "OVERHEAD_ABOVE_30_PERCENT"]);
    expect((await editCost(pr.id, big.body.data.id, { category: "LABOUR" })).status).toBe(400);
  });
});

/* ───────────────────────────── warehouse costs ───────────────────────────── */

describe("warehouse costs register", () => {
  it("validates scope / category combinations, amount and month", async () => {
    const m = thisMonth();
    expect(codes(await addWc({ scope: "WAREHOUSE", warehouseId: A, category: "ESTABLISHMENT", month: m }))).toContain("SCOPE_CATEGORY");
    expect(codes(await addWc({ scope: "COMPANY", category: "HOLDING", month: m }))).toContain("SCOPE_CATEGORY");
    expect(codes(await addWc({ scope: "WAREHOUSE", category: "HOLDING", month: m }))).toContain("WAREHOUSE_REQUIRED");
    expect(codes(await addWc({ scope: "COMPANY", warehouseId: A, category: "ESTABLISHMENT", month: m }))).toContain("WAREHOUSE_NOT_ALLOWED");
    expect((await addWc({ scope: "COMPANY", category: "ESTABLISHMENT", month: m, amount: "0" })).status).toBe(400);
    expect((await addWc({ scope: "COMPANY", category: "ESTABLISHMENT", month: "2026-13" })).status).toBe(400);
    expect((await addWc({ scope: "COMPANY", category: "ESTABLISHMENT", month: monthOffset(1) })).status).toBe(201);
    expect(codes(await addWc({ scope: "COMPANY", category: "ESTABLISHMENT", month: monthOffset(2) }))).toContain("MONTH_TOO_FAR");
    const ok = await addWc({ scope: "WAREHOUSE", warehouseId: A, category: "HOLDING", month: `${m}-17`, amount: "1000000.50" });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ month: `${m}-01`, scope: "WAREHOUSE", warehouse: { id: A }, category: "HOLDING", amount: "1000000.50" });
    expect(ok.body.data.warnings.map((w: any) => w.code)).toEqual(["OVERHEAD_LARGE_AMOUNT"]);
    // A warehouse outside the user's scope.
    const accA = await userToken(token, "Accounts", ["A"]);
    expect((await addWc({ scope: "WAREHOUSE", warehouseId: B, category: "HOLDING", month: m }, accA.token)).status).toBe(403);
  });

  it("edits (audited, history), voids with a reason, filters and totals", async () => {
    const m = thisMonth();
    const rent = (await addWc({ scope: "WAREHOUSE", warehouseId: A, category: "STORE_CHARGE", month: m, amount: "100000", description: "Rent", vendorOrPayee: "Landlord" })).body.data;
    await addWc({ scope: "WAREHOUSE", warehouseId: A, category: "STORE_CHARGE", month: m, amount: "60000", description: "Store staff" });
    await addWc({ scope: "WAREHOUSE", warehouseId: B, category: "HOLDING", month: m, amount: "20000" });
    await addWc({ scope: "COMPANY", category: "ESTABLISHMENT", month: monthOffset(-1), amount: "300000" });

    const e = await call(wcOneRoute.PATCH, "PATCH", "/x", { token, params: { id: rent.id }, body: { amount: "110000", reason: "Rent increase" } });
    expect(e.status).toBe(200);
    expect(e.body.data.amount).toBe("110000.00");
    const v = await call(wcVoidRoute.POST, "POST", "/x", { token, params: { id: rent.id }, body: { reason: "Duplicate" }, headers: { "Idempotency-Key": key("wv") } });
    expect(v.body.data).toMatchObject({ voided: true, voidReason: "Duplicate" });
    expect((await call(wcOneRoute.PATCH, "PATCH", "/x", { token, params: { id: rent.id }, body: { amount: "1" } })).status).toBe(422);

    const h = (await call(wcHistoryRoute.GET, "GET", "/x", { token, params: { id: rent.id } })).body.data.history;
    expect(h.map((x: any) => x.action)).toEqual(["CREATE", "UPDATE", "VOID"]);
    expect(h[1]).toMatchObject({ amount: "110000.00", reason: "Rent increase", changes: [{ field: "amount", from: "100000.00", to: "110000.00" }] });

    const list = await listWc({ monthFrom: m, monthTo: m });
    expect(list.body.data).toHaveLength(2); // voided excluded
    expect(list.body.totals).toEqual({ amount: "80000.00" });
    expect((await listWc({ monthFrom: m, includeVoided: "true" })).body.data).toHaveLength(3);
    expect((await listWc({ scope: "COMPANY" })).body.data).toHaveLength(1);
    expect((await listWc({ warehouseId: B })).body.data.map((x: any) => x.category)).toEqual(["HOLDING"]);
    expect((await listWc({ category: "STORE_CHARGE" })).body.data).toHaveLength(1);
    expect((await listWc({ q: "staff" })).body.data).toHaveLength(1);
  });

  it("monthly summary sums several entries per month; holding % uses that month's average stock value", async () => {
    // Stock in warehouse A since before this month: 100 × 500 = 50 000 every day.
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 100, unitPrice: "500" }]);
    const m = thisMonth();
    // Backdate the ledger so the whole month carries the stock value.
    await backdateLedger(new Date(`${monthOffset(-1)}-15T00:00:00Z`));
    await addWc({ scope: "WAREHOUSE", warehouseId: A, category: "STORE_CHARGE", month: m, amount: "1000" });
    await addWc({ scope: "WAREHOUSE", warehouseId: A, category: "STORE_CHARGE", month: m, amount: "2500.50" });
    await addWc({ scope: "WAREHOUSE", warehouseId: A, category: "HOLDING", month: m, amount: "400" });
    await addWc({ scope: "WAREHOUSE", warehouseId: A, category: "HOLDING", month: m, amount: "100" });
    await addWc({ scope: "WAREHOUSE", warehouseId: B, category: "HOLDING", month: m, amount: "75" });
    await addWc({ scope: "COMPANY", category: "ESTABLISHMENT", month: m, amount: "9000" });
    await addWc({ scope: "COMPANY", category: "ESTABLISHMENT", month: m, amount: "1000" });
    const voided = (await addWc({ scope: "WAREHOUSE", warehouseId: A, category: "HOLDING", month: m, amount: "99999" })).body.data;
    await call(wcVoidRoute.POST, "POST", "/x", { token, params: { id: voided.id }, body: { reason: "Wrong month" }, headers: { "Idempotency-Key": key("wv") } });

    const r = await wcSummary({ monthFrom: monthOffset(-1), monthTo: m });
    expect(r.status).toBe(200);
    expect(r.body.data.months.map((x: any) => x.month.slice(0, 7))).toEqual([monthOffset(-1), m]);
    const cur = r.body.data.months[1];
    const a = cur.warehouses.find((w: any) => w.warehouse.code === "A");
    const b = cur.warehouses.find((w: any) => w.warehouse.code === "B");
    expect(a).toMatchObject({ storeChargeCost: "3500.50", holdingCost: "500.00", warehouseTotal: "4000.50", averageStockValue: "50000.00", holdingPercent: "1.00" });
    expect(b).toMatchObject({ holdingCost: "75.00", averageStockValue: "0.00", holdingPercent: null });
    expect(cur.company).toEqual({ establishmentCost: "10000.00" });
    expect(cur.total).toBe("14075.50");
    expect(r.body.data.months[0].total).toBe("0.00");

    // Half a month of stock → half the average.
    await resetDatabase();
    token = await adminToken();
    const p2 = await product(token);
    await grn(token, await wh("A"), [{ productId: p2.id, qty: 10, unitPrice: "100" }]); // 1 000
    const prev = monthOffset(-1);
    const [py, pm] = prev.split("-").map(Number) as [number, number];
    const days = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    // Posted at the start (Dhaka) of day 16 → closing value 1 000 on days 16..end.
    await backdateLedger(new Date(Date.UTC(py, pm - 1, 16) - 6 * 3600 * 1000));
    const s2 = await wcSummary({ monthFrom: prev, monthTo: prev });
    const expected = ((1000 * (days - 15)) / days).toFixed(2);
    expect(s2.body.data.months[0].warehouses.find((w: any) => w.warehouse.code === "A").averageStockValue).toBe(expected);
  });

  it("receipts on warehouse costs; idempotent create; Excel export", async () => {
    const k = key("wc");
    const first = await addWc({ scope: "COMPANY", category: "ESTABLISHMENT", month: thisMonth(), amount: "5000" }, token, { "Idempotency-Key": k });
    const again = await addWc({ scope: "COMPANY", category: "ESTABLISHMENT", month: thisMonth(), amount: "5000" }, token, { "Idempotency-Key": k });
    expect(again.status).toBe(201);
    expect(again.headers.get("idempotent-replayed")).toBe("true");
    expect(again.body.data.id).toBe(first.body.data.id);
    expect(await prisma.warehouseCost.count()).toBe(1);
    expect((await addWc({ scope: "COMPANY", category: "ESTABLISHMENT", month: thisMonth(), amount: "6000" }, token, { "Idempotency-Key": k })).status).toBe(409);

    const id = first.body.data.id;
    const fd = new FormData();
    fd.append("file", new File([PDF as BlobPart], "office-rent.pdf", { type: "application/pdf" }));
    const up = await call(wcFilesRoute.POST, "POST", "/x", { token, params: { id }, body: fd });
    expect(up.status).toBe(201);
    const att = up.body.data[0];
    expect(att.url).toBe(`/api/v1/warehouse-costs/${id}/attachments/${att.id}`);
    expect((await call(wcFilesRoute.GET, "GET", "/x", { token, params: { id } })).body.data).toHaveLength(1);
    const file = await call(wcFileRoute.GET, "GET", "/x", { token, params: { id, attachmentId: att.id } });
    expect(Buffer.from(file.bytes).equals(Buffer.from(PDF))).toBe(true);
    const mgr = await userToken(token, "Manager", ["A"]);
    expect((await call(wcFileRoute.GET, "GET", "/x", { token: mgr.token, params: { id, attachmentId: att.id } })).status).toBe(403);
    expect((await call(wcFileRoute.DELETE, "DELETE", "/x", { token, params: { id, attachmentId: att.id } })).status).toBe(204);
    const hist = (await call(wcHistoryRoute.GET, "GET", "/x", { token, params: { id } })).body.data.history;
    expect(hist.map((x: any) => x.action)).toEqual(["CREATE", "ATTACHMENT_ADD", "ATTACHMENT_REMOVE"]);
    expect((await listWc()).body.data[0].attachmentCount).toBe(0);

    const x = await call(wcExportRoute.GET, "GET", "/x", { token, query: { monthFrom: thisMonth(), monthTo: thisMonth() } });
    expect(x.status).toBe(200);
    expect(x.headers.get("content-type")).toContain("spreadsheetml");
    expect(new TextDecoder().decode(x.bytes.slice(0, 2))).toBe("PK");
    expect((await call(wcExportRoute.GET, "GET", "/x", { token: mgr.token })).status).toBe(403);
  });
});

/* ───────────────────────────── alerts ───────────────────────────── */

describe("cost alerts per recipient", () => {
  it("90 % / 100 % alerts use full cost for overhead viewers and direct cost for the others", async () => {
    const pr = await newProject({ contractValue: "1000" });
    const admin = (await prisma.user.findFirstOrThrow({ where: { username: "admin" } })).id;
    const direct = await customUser(token, { projects: "VIEW", overheads: "NONE" }, { seeCost: true, seeMargin: true });
    const check = () => projects().alerts.check(pr.id);
    const inbox = (userId: string) => prisma.notification.findMany({ where: { userId, type: "PROJECT_COST_ALERT" }, orderBy: { createdAt: "asc" } });

    await addCost(pr.id, { category: "LABOUR", amount: "700" }); // direct 70 %
    await addCost(pr.id, { category: "HOLDING", amount: "250" }); // full 95 %
    expect(await check()).toEqual({ level: 90, alerted: 90 });
    expect((await inbox(admin)).map((n) => n.title)).toEqual([`${pr.code} has used 90% of its contract value`]);
    expect((await inbox(admin))[0]!.body).toContain("full cost (incl. overheads)");
    expect(await inbox(direct.id)).toHaveLength(0);

    await addCost(pr.id, { category: "LABOUR", amount: "200" }); // direct 90 %, full 115 %
    expect(await check()).toEqual({ level: 100, alerted: 100 });
    expect((await inbox(admin)).map((n) => n.title)).toEqual([`${pr.code} has used 90% of its contract value`, `${pr.code} has used its whole contract value`]);
    const d = await inbox(direct.id);
    expect(d.map((n) => n.title)).toEqual([`${pr.code} has used 90% of its contract value`]);
    expect(d[0]!.body).not.toContain("overheads");
    expect(d[0]!.body).toContain("900.00");
  });
});
