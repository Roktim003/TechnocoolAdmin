import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as projectsRoute from "@/app/api/v1/projects/route";
import * as projectRoute from "@/app/api/v1/projects/[id]/route";
import * as statusRoute from "@/app/api/v1/projects/[id]/status/route";
import * as historyRoute from "@/app/api/v1/projects/[id]/status-history/route";
import * as activityRoute from "@/app/api/v1/projects/[id]/activity/route";
import * as materialRoute from "@/app/api/v1/projects/[id]/material/route";
import * as movementsRoute from "@/app/api/v1/projects/[id]/movements/route";
import * as costsRoute from "@/app/api/v1/projects/[id]/costs/route";
import * as voidRoute from "@/app/api/v1/projects/[id]/costs/[costId]/void/route";
import * as costFilesRoute from "@/app/api/v1/projects/[id]/costs/[costId]/attachments/route";
import * as filesRoute from "@/app/api/v1/projects/[id]/attachments/route";
import * as optionsRoute from "@/app/api/v1/projects/options/route";
import * as documentsRoute from "@/app/api/v1/projects/[id]/documents/route";
import { projects } from "@/modules/projects/interface/container";
import { costStatementHtml } from "@/modules/projects/interface/documents";
import { getQueue, QUEUES } from "@/shared/queue/queue";
import { call } from "../helpers/http";
import { resetDatabase } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";
import { approve, createEntry, grn, key, post, prisma, product, reverse, userToken, wh } from "../helpers/inventory";
import { customUser } from "../helpers/purchasing";

let token: string;
let A: string;

beforeEach(async () => {
  await resetDatabase();
  token = await adminToken();
  A = await wh("A");
});

afterAll(async () => {
  await prisma.$disconnect();
});

/* ── helpers ── */

const create = (t: string, body: Record<string, unknown>) => call(projectsRoute.POST, "POST", "/projects", { token: t, body: { clientName: "Test Client Ltd.", ...body } });
async function newProject(body: Record<string, unknown> = {}, t = token) {
  const r = await create(t, { name: `Project ${Date.now().toString(36)}`, status: "RUNNING", defaultWarehouseId: A, ...body });
  if (r.status !== 201) throw new Error(`create project ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data as { id: string; code: string; [k: string]: unknown };
}
const get = (id: string, t = token) => call(projectRoute.GET, "GET", "/x", { token: t, params: { id } });
const patch = (id: string, body: unknown, t = token) => call(projectRoute.PATCH, "PATCH", "/x", { token: t, params: { id }, body });
const status = (id: string, toStatus: string, reason?: string, t = token, k = key("st")) => call(statusRoute.POST, "POST", "/x", { token: t, params: { id }, body: { toStatus, ...(reason ? { reason } : {}) }, headers: { "Idempotency-Key": k } });
const material = async (id: string, t = token) => (await call(materialRoute.GET, "GET", "/x", { token: t, params: { id } })).body.data;
const addCost = (id: string, body: Record<string, unknown>, t = token, k = key("cost")) => call(costsRoute.POST, "POST", "/x", { token: t, params: { id }, body: { category: "LABOUR", description: "Installers", amount: "1000", ...body }, headers: { "Idempotency-Key": k } });
const costs = (id: string, query: Record<string, string> = {}, t = token) => call(costsRoute.GET, "GET", "/x", { token: t, params: { id }, query });
const voidCost = (id: string, costId: string, reason = "Entered twice", t = token) => call(voidRoute.POST, "POST", "/x", { token: t, params: { id, costId }, body: { reason }, headers: { "Idempotency-Key": key("void") } });
const options = (query: Record<string, string>, t = token) => call(optionsRoute.GET, "GET", "/x", { token: t, query });
const issue = (projectId: string, lines: Record<string, unknown>[], extra: Record<string, unknown> = {}, t = token) => createEntry(t, { type: "ISSUE_TO_PROJECT", warehouseId: A, projectId, lines, ...extra });
const ret = (projectId: string, lines: Record<string, unknown>[], extra: Record<string, unknown> = {}, t = token) => createEntry(t, { type: "RETURN_FROM_SITE", warehouseId: A, projectId, lines, ...extra });
const inbox = (userId: string, type: string) => prisma.notification.findMany({ where: { userId, type } });
const adminId = async () => (await prisma.user.findFirstOrThrow({ where: { username: "admin" } })).id;

/* ── material ── */

describe("material calculations (from posted entries, at ledger cost)", () => {
  it("issued / returned / net quantities and costs; DAMAGED returns count as returned; pending excluded; reversals net out", async () => {
    const pr = await newProject();
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "100" }]);
    await post(token, { type: "ISSUE_TO_PROJECT", warehouseId: A, projectId: pr.id, lines: [{ productId: p.id, qty: 5 }] }); // 5 × 100
    await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "130" }]); // avg (500 + 1300) / 15 = 120
    await post(token, { type: "ISSUE_TO_PROJECT", warehouseId: A, projectId: pr.id, lines: [{ productId: p.id, qty: 3 }] }); // 3 × 120
    await post(token, { type: "RETURN_FROM_SITE", warehouseId: A, projectId: pr.id, lines: [{ productId: p.id, qty: 1 }, { productId: p.id, qty: 1, condition: "DAMAGED" }] });

    // Pending (submitted by a Store Manager) doesn't count.
    const store = await userToken(token, "Store Manager", ["A"]);
    const pending = await issue(pr.id, [{ productId: p.id, qty: 2 }], { action: "submit" }, store.token);
    expect(pending.body.data.status).toBe("PENDING");

    const m = await material(pr.id);
    expect(m.lines).toHaveLength(1);
    expect(m.lines[0]).toMatchObject({ issuedQty: "8.000", returnedQty: "2.000", returnedDamagedQty: "1.000", netQty: "6.000", issuedCost: "860.00" });
    expect(Number(m.lines[0].returnedCost)).toBeCloseTo(240, 2); // 2 back at the average cost (120)
    expect(m.totals.netMaterialCost).toBe(m.lines[0].netCost);

    // A reversed issue nets out through its REVERSAL entry.
    const third = await post(token, { type: "ISSUE_TO_PROJECT", warehouseId: A, projectId: pr.id, lines: [{ productId: p.id, qty: 4 }] });
    expect((await material(pr.id)).lines[0].issuedQty).toBe("12.000");
    expect((await reverse(third.id, token)).status).toBe(200);
    const after = (await material(pr.id)).lines[0];
    expect(after).toMatchObject({ issuedQty: "8.000", issuedCost: "860.00", netQty: "6.000" });

    // Issue / return history lists the entries (incl. the pending one and the reversal), not drafts.
    const mv = await call(movementsRoute.GET, "GET", "/x", { token, params: { id: pr.id } });
    expect(mv.body.meta.total).toBe(6);
    expect(mv.body.data.map((e: any) => e.type)).toEqual(expect.arrayContaining(["ISSUE_TO_PROJECT", "RETURN_FROM_SITE", "REVERSAL"]));
    expect(mv.body.data.find((e: any) => e.status === "PENDING")).toBeTruthy();

    // The project's summary uses the same figures.
    expect((await get(pr.id)).body.data.summary).toMatchObject({ netMaterialCost: after.netCost, totalCost: after.netCost });
  });

  it("serial numbers at the site follow issues and returns", async () => {
    const pr = await newProject();
    const p = await product(token, { trackSerial: true });
    await grn(token, A, [{ productId: p.id, qty: 3, unitPrice: "500", serials: ["SN-A1", "SN-A2", "SN-A3"] }]);
    await post(token, { type: "ISSUE_TO_PROJECT", warehouseId: A, projectId: pr.id, lines: [{ productId: p.id, qty: 2, serials: ["SN-A1", "SN-A2"] }] });
    expect((await material(pr.id)).lines[0].serialsAtSite).toEqual(["SN-A1", "SN-A2"]);
    await post(token, { type: "RETURN_FROM_SITE", warehouseId: A, projectId: pr.id, lines: [{ productId: p.id, qty: 1, serials: ["SN-A1"] }] });
    expect((await material(pr.id)).lines[0]).toMatchObject({ netQty: "1.000", serialsAtSite: ["SN-A2"] });
  });
});

/* ── costs and margin ── */

describe("costs and margin", () => {
  it("totals and margin math; null margin without a contract value; voided costs excluded but kept", async () => {
    const pr = await newProject({ contractValue: "10000" });
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "250" }]);
    await post(token, { type: "ISSUE_TO_PROJECT", warehouseId: A, projectId: pr.id, lines: [{ productId: p.id, qty: 10 }] }); // 2500
    expect((await addCost(pr.id, { category: "LABOUR", amount: "3000" })).status).toBe(201);
    expect((await addCost(pr.id, { category: "TRANSPORT", amount: "500" })).status).toBe(201);
    const other = (await addCost(pr.id, { category: "OTHER", amount: "1000", description: "Scaffolding" })).body.data;
    expect((await get(pr.id)).body.data.summary).toEqual({
      netMaterialCost: "2500.00",
      issuedCost: "2500.00",
      returnedCost: "0.00",
      labourCost: "3000.00",
      transportCost: "500.00",
      otherCost: "1000.00",
      totalCost: "7000.00",
      contractValue: "10000.00",
      margin: "3000.00",
      marginPercent: "30.00",
      costUsedPercent: "70.00",
    });

    const v = await voidCost(pr.id, other.id, "Billed to the client");
    expect(v.body.data).toMatchObject({ voided: true, voidReason: "Billed to the client" });
    expect((await voidCost(pr.id, other.id)).body.error.details[0].code).toBe("COST_VOIDED");
    expect((await get(pr.id)).body.data.summary).toMatchObject({ otherCost: "0.00", totalCost: "6000.00", margin: "4000.00", marginPercent: "40.00" });
    expect((await costs(pr.id)).body.data.costs).toHaveLength(2);
    const all = (await costs(pr.id, { includeVoided: "true" })).body.data;
    expect(all.costs).toHaveLength(3);
    expect(all.subtotals).toEqual({ labourCost: "3000.00", transportCost: "500.00", otherCost: "0.00", costsTotal: "3500.00" });
    expect(await prisma.projectCost.count({ where: { projectId: pr.id } })).toBe(3); // never deleted

    // Over budget: negative margin.
    await addCost(pr.id, { category: "LABOUR", amount: "5000" });
    expect((await get(pr.id)).body.data.summary).toMatchObject({ totalCost: "11000.00", margin: "-1000.00", marginPercent: "-10.00", costUsedPercent: "110.00" });

    const none = await newProject();
    await addCost(none.id, { amount: "100" });
    expect((await get(none.id)).body.data.summary).toMatchObject({ totalCost: "100.00", contractValue: null, margin: null, marginPercent: null, costUsedPercent: null });
  });

  it("costs are blocked on closed projects; receipts attach to a cost", async () => {
    const pr = await newProject();
    const c = (await addCost(pr.id, { amount: "250" })).body.data;
    const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
    const fd = new FormData();
    fd.append("file", new Blob([pdf], { type: "application/pdf" }), "receipt.pdf");
    const up = await call(costFilesRoute.POST, "POST", "/x", { token, params: { id: pr.id, costId: c.id }, body: fd });
    expect(up.status).toBe(201);
    expect(up.body.data[0].url).toContain(`/projects/${pr.id}/costs/${c.id}/attachments/`);
    expect((await costs(pr.id)).body.data.costs[0].attachmentCount).toBe(1);

    await status(pr.id, "COMPLETED");
    await status(pr.id, "CLOSED", "Handed over");
    const r = await addCost(pr.id, { amount: "10" });
    expect(r.status).toBe(422);
    expect(r.body.error.details[0].code).toBe("PROJECT_CLOSED");
    expect((await voidCost(pr.id, c.id)).body.error.details[0].code).toBe("PROJECT_CLOSED");
    expect((await patch(pr.id, { notes: "x" })).body.error.details[0].code).toBe("PROJECT_CLOSED");
  });
});

/* ── status and issue rules ── */

describe("status workflow and issue rules", () => {
  it("allows every listed transition, refuses the rest, records history and actualEndDate", async () => {
    const pr = await newProject({ status: "PLANNING" });
    expect((await status(pr.id, "COMPLETED")).body.error.details[0].code).toBe("INVALID_TRANSITION");
    expect((await status(pr.id, "RUNNING")).body.data.status).toBe("RUNNING");
    expect((await status(pr.id, "ON_HOLD")).status).toBe(400); // reason required
    expect((await status(pr.id, "ON_HOLD", "Client payment pending")).body.data.status).toBe("ON_HOLD");
    expect((await status(pr.id, "COMPLETED")).status).toBe(422); // on hold → completed isn't allowed
    expect((await status(pr.id, "RUNNING", "Payment received")).body.data.status).toBe("RUNNING");
    const done = (await status(pr.id, "COMPLETED")).body.data;
    expect(done).toMatchObject({ status: "COMPLETED", actualEndDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date()) });
    expect((await status(pr.id, "RUNNING", "Snag list")).body.data).toMatchObject({ status: "RUNNING", actualEndDate: null }); // reopen
    await status(pr.id, "COMPLETED");
    const closed = (await status(pr.id, "CLOSED", "Handed over and paid")).body.data;
    expect(closed).toMatchObject({ status: "CLOSED", closeReason: "Handed over and paid", closedBy: { id: await adminId() } });
    expect((await status(pr.id, "RUNNING", "x x x")).body.error.details[0].code).toBe("INVALID_TRANSITION");
    expect((await status(pr.id, "COMPLETED", "Wrong project closed")).body.data).toMatchObject({ status: "COMPLETED", closeReason: null }); // Admin only
    const h = (await call(historyRoute.GET, "GET", "/x", { token, params: { id: pr.id } })).body.data;
    expect(h.map((x: any) => x.toStatus).reverse()).toEqual(["PLANNING", "RUNNING", "ON_HOLD", "RUNNING", "COMPLETED", "RUNNING", "COMPLETED", "CLOSED", "COMPLETED"]);
    expect(h[0]).toMatchObject({ fromStatus: "CLOSED", reason: "Wrong project closed" });
  });

  it("closing is blocked while entries are pending or a transfer is unreceived (422 with the numbers)", async () => {
    const pr = await newProject();
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "10" }]);
    const store = await userToken(token, "Store Manager", ["A"]);
    const pending = (await issue(pr.id, [{ productId: p.id, qty: 1 }], { action: "submit" }, store.token)).body.data;
    await status(pr.id, "COMPLETED");
    const r = await status(pr.id, "CLOSED", "Done");
    expect(r.status).toBe(422);
    expect(r.body.error.details[0]).toMatchObject({ code: "PROJECT_HAS_OPEN_ENTRIES", meta: { entries: pending.number } });
    expect(r.body.error.message).toContain(pending.number);
    // A completed project can't receive the pending issue either.
    expect((await approve(pending.id, token)).body.error.details[0].code).toBe("PROJECT_STATUS");

    await call((await import("@/app/api/v1/stock-entries/[id]/reject/route")).POST, "POST", "/x", { token, params: { id: pending.id }, body: { reason: "Project completed" }, headers: { "Idempotency-Key": key() } });
    // An unreceived transfer tagged with the project also blocks closing.
    const t = await post(token, { type: "TRANSFER", warehouseId: A, toWarehouseId: await wh("B"), lines: [{ productId: p.id, qty: 1 }] });
    await prisma.stockEntry.update({ where: { id: t.id }, data: { projectId: pr.id } });
    const r2 = await status(pr.id, "CLOSED", "Done");
    expect(r2.body.error.details[0]).toMatchObject({ code: "PROJECT_HAS_OPEN_ENTRIES", meta: { entries: t.number } });
    await prisma.stockEntry.update({ where: { id: t.id }, data: { projectId: null } });
    expect((await status(pr.id, "CLOSED", "Done")).body.data.status).toBe("CLOSED");
  });

  it("issues are refused to on-hold / completed / closed projects; returns only to closed ones; options per entry type", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 20, unitPrice: "10" }]);
    const planning = await newProject({ status: "PLANNING", name: "Planning one" });
    const running = await newProject({ name: "Running one" });
    const onHold = await newProject({ name: "On hold one" });
    await status(onHold.id, "ON_HOLD", "Waiting");
    const completed = await newProject({ name: "Completed one" });
    await issue(completed.id, [{ productId: p.id, qty: 3 }]);
    await status(completed.id, "COMPLETED");
    const closed = await newProject({ name: "Closed one" });
    await status(closed.id, "COMPLETED");
    await status(closed.id, "CLOSED", "Done");

    for (const pr of [onHold, completed, closed]) {
      const r = await issue(pr.id, [{ productId: p.id, qty: 1 }]);
      expect(r.status, pr.code).toBe(422);
      expect(r.body.error.details[0].code).toBe("PROJECT_STATUS");
    }
    expect((await issue(onHold.id, [{ productId: p.id, qty: 1 }])).body.error.message).toContain("on hold");
    expect((await issue(planning.id, [{ productId: p.id, qty: 1 }])).status).toBe(201);
    expect((await issue(running.id, [{ productId: p.id, qty: 1 }])).status).toBe(201);
    expect((await ret(completed.id, [{ productId: p.id, qty: 1 }])).status).toBe(201); // returns until closed
    expect((await ret(onHold.id, [{ productId: p.id, qty: 1 }])).status).toBe(201); // on hold: returns still accepted
    const rc = await ret(closed.id, [{ productId: p.id, qty: 1 }]);
    expect(rc.status).toBe(422);
    expect(rc.body.error.details[0].code).toBe("PROJECT_STATUS");

    const store = await userToken(token, "Store Manager", ["A"]);
    const codes = async (type: string) => (await options({ type }, store.token)).body.data.map((x: any) => x.id);
    const forIssue = await codes("ISSUE_TO_PROJECT");
    expect(forIssue).toEqual(expect.arrayContaining([planning.id, running.id]));
    expect(forIssue).not.toEqual(expect.arrayContaining([onHold.id]));
    expect(forIssue.some((x: string) => [onHold.id, completed.id, closed.id].includes(x))).toBe(false);
    const forReturn = await codes("RETURN_FROM_SITE");
    expect(forReturn).toEqual(expect.arrayContaining([planning.id, running.id, onHold.id, completed.id]));
    expect(forReturn).not.toContain(closed.id);
    expect(Object.keys((await options({ type: "ISSUE_TO_PROJECT" }, store.token)).body.data[0]).sort()).toEqual(["code", "defaultWarehouse", "id", "name", "status"]);
  });
});

/* ── permissions and sensitive data ── */

describe("permissions and sensitive data", () => {
  it("contract value / margin only with seeMargin; cost amounts only with seeCost", async () => {
    const pr = await newProject({ contractValue: "50000" });
    await addCost(pr.id, { amount: "1200" });
    const accounts = await userToken(token, "Accounts", ["A", "B"]); // VIEW, seeCost, no seeMargin
    const mgr = await userToken(token, "Manager", ["A", "B"]); // CREATE, seeCost, no seeMargin
    for (const u of [accounts, mgr]) {
      const d = (await get(pr.id, u.token)).body.data;
      expect(d.contractValue).toBeUndefined();
      expect(d.summary).toMatchObject({ totalCost: "1200.00", labourCost: "1200.00" });
      expect(d.summary.margin).toBeUndefined();
      expect(d.summary.marginPercent).toBeUndefined();
      expect(d.summary.costUsedPercent).toBeUndefined();
      expect(JSON.stringify((await call(projectsRoute.GET, "GET", "/projects", { token: u.token })).body)).not.toMatch(/contractValue|"margin/);
    }
    const viewer = await customUser(token, { projects: "VIEW" }); // no flags
    const d = (await get(pr.id, viewer.token)).body.data;
    expect(d.summary).toEqual({});
    expect((await costs(pr.id, {}, viewer.token)).body.data.costs[0].amount).toBeUndefined();
    expect(JSON.stringify((await costs(pr.id, {}, viewer.token)).body)).not.toMatch(/1200/);
    expect((await call(documentsRoute.POST, "POST", "/x", { token: viewer.token, params: { id: pr.id } })).status).toBe(403);
    // Admin sees everything.
    expect((await get(pr.id)).body.data).toMatchObject({ contractValue: "50000.00", summary: { margin: "48800.00", marginPercent: "97.60", costUsedPercent: "2.40" } });
  });

  it("Manager adds costs but can't set the contract value, void costs or close; Store Manager only gets options", async () => {
    const mgr = await userToken(token, "Manager", ["A"]);
    expect((await create(mgr.token, { name: "Mgr project", contractValue: "1000" })).status).toBe(403);
    const pr = await newProject({}, mgr.token);
    expect(pr.code).toMatch(/^PRJ-\d{3}$/);
    expect((await patch(pr.id, { contractValue: "1000" }, mgr.token)).status).toBe(403);
    expect((await patch(pr.id, { siteAddress: "Motijheel" }, mgr.token)).body.data.siteAddress).toBe("Motijheel");
    const c = await addCost(pr.id, { amount: "300" }, mgr.token);
    expect(c.status).toBe(201);
    expect((await voidCost(pr.id, c.body.data.id, "x x x", mgr.token)).status).toBe(403);
    expect((await status(pr.id, "COMPLETED", undefined, mgr.token)).body.data.status).toBe("COMPLETED");
    expect((await status(pr.id, "CLOSED", "Done", mgr.token)).status).toBe(403);
    expect((await status(pr.id, "RUNNING", "Reopen", mgr.token)).status).toBe(403);
    expect((await get(pr.id, mgr.token)).body.data.actions.transitions).toEqual([]);
    expect((await get(pr.id)).body.data.actions.transitions.map((t: any) => t.toStatus)).toEqual(["RUNNING", "CLOSED"]);

    const store = await userToken(token, "Store Manager", ["A"]);
    expect((await options({ type: "ISSUE_TO_PROJECT" }, store.token)).status).toBe(200);
    expect((await get(pr.id, store.token)).status).toBe(403);
    expect((await call(projectsRoute.GET, "GET", "/projects", { token: store.token })).status).toBe(403);
    expect((await addCost(pr.id, { amount: "1" }, store.token)).status).toBe(403);
    // Admin (FULL + seeMargin) sets the contract value; old and new values are audit-logged.
    await patch(pr.id, { contractValue: "2000" });
    await patch(pr.id, { contractValue: "2500.5" });
    const logs = await prisma.auditLog.findMany({ where: { entityId: pr.id, action: "project.contract_value" }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => [l.before, l.after])).toEqual([
      [{ contractValue: null }, { contractValue: "2000.00" }],
      [{ contractValue: "2000.00" }, { contractValue: "2500.50" }],
    ]);
  });
});

/* ── alerts and documents ── */

describe("alerts and documents", () => {
  it("90 % and 100 % alerts fire once each, to seeMargin users only (via the projects queue)", async () => {
    const pr = await newProject({ contractValue: "1000" });
    const mgr = await userToken(token, "Manager", ["A"]);
    const admin = await adminId();
    const check = () => projects().alerts.check(pr.id);

    await addCost(pr.id, { amount: "500" });
    const queued = await getQueue(QUEUES.projects).getJobs(["waiting"]);
    expect(queued.some((j) => j.name === "cost-alert-check" && j.data.projectId === pr.id)).toBe(true);
    expect(await check()).toEqual({ level: 0, alerted: null });

    await addCost(pr.id, { amount: "400" }); // 90 %
    expect(await check()).toEqual({ level: 90, alerted: 90 });
    await addCost(pr.id, { amount: "50" }); // 95 %
    expect(await check()).toEqual({ level: 90, alerted: null });
    await addCost(pr.id, { amount: "50" }); // 100 %
    expect(await check()).toEqual({ level: 100, alerted: 100 });
    await addCost(pr.id, { amount: "10" });
    expect((await check()).alerted).toBeNull();

    const alerts = await inbox(admin, "PROJECT_COST_ALERT");
    expect(alerts.map((n) => n.title)).toEqual([`${pr.code} has used 90% of its contract value`, `${pr.code} has used its whole contract value`]);
    expect(await inbox(mgr.id, "PROJECT_COST_ALERT")).toHaveLength(0); // no seeMargin

    // Posted issues queue the check too.
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 1, unitPrice: "10" }]);
    await (await getQueue(QUEUES.projects)).drain();
    await post(token, { type: "ISSUE_TO_PROJECT", warehouseId: A, projectId: pr.id, lines: [{ productId: p.id, qty: 1 }] });
    expect((await getQueue(QUEUES.projects).getJobs(["waiting"])).some((j) => j.data.projectId === pr.id)).toBe(true);
  });

  it("notifies the site engineer (a user) when the status changes", async () => {
    const eng = await userToken(token, "Manager", ["A"]);
    const pr = await newProject({ siteEngineerUserId: eng.id, siteEngineerName: "ignored" });
    expect((await get(pr.id)).body.data).toMatchObject({ siteEngineer: { id: eng.id }, siteEngineerName: expect.any(String) });
    await status(pr.id, "ON_HOLD", "Rain");
    const n = await inbox(eng.id, "PROJECT_STATUS_CHANGED");
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ title: `${pr.code} is now on hold`, link: `/projects/${pr.id}` });
    expect(n[0]!.body).toContain("Rain");
    // The engineer changing it themselves isn't notified.
    await status(pr.id, "RUNNING", "Dry again", eng.token);
    expect(await inbox(eng.id, "PROJECT_STATUS_CHANGED")).toHaveLength(1);
  });

  it("cost statement PDF: queued for the worker; the contract / margin section only with seeMargin", async () => {
    const pr = await newProject({ contractValue: "80000" });
    await addCost(pr.id, { amount: "1500", description: "Crane hire", category: "TRANSPORT" });
    const r = await call(documentsRoute.POST, "POST", "/x", { token, params: { id: pr.id } });
    expect(r.status).toBe(202);
    const job = await getQueue(QUEUES.documents).getJob(r.body.data.jobId);
    expect(job?.name).toBe("project-cost-statement");
    expect(job?.data).toMatchObject({ projectId: pr.id, showMargin: true });
    const mgr = await userToken(token, "Manager", ["A"]);
    const r2 = await call(documentsRoute.POST, "POST", "/x", { token: mgr.token, params: { id: pr.id } });
    expect((await getQueue(QUEUES.documents).getJob(r2.body.data.jobId))?.data.showMargin).toBe(false);

    const withMargin = (await costStatementHtml({ projectId: pr.id, userName: "Admin", showMargin: true })).html;
    const without = (await costStatementHtml({ projectId: pr.id, userName: "Manager", showMargin: false })).html;
    expect(withMargin).toContain("Contract &amp; margin");
    expect(withMargin).toContain("80,000.00");
    expect(without).not.toContain("Contract");
    expect(without).not.toContain("80,000.00");
    expect(without).toContain("Crane hire");
    expect(without).toContain("Project cost statement");
  });
});

/* ── general ── */

describe("idempotency, audit, attachments, OpenAPI", () => {
  it("cost add and status change are idempotent and need a key", async () => {
    const pr = await newProject();
    const k = key("same");
    const a = await addCost(pr.id, { amount: "700" }, token, k);
    const b = await addCost(pr.id, { amount: "700" }, token, k);
    expect(b.body.data.id).toBe(a.body.data.id);
    expect(await prisma.projectCost.count({ where: { projectId: pr.id } })).toBe(1);
    const s = key("st-same");
    await status(pr.id, "ON_HOLD", "Pause", token, s);
    expect((await status(pr.id, "ON_HOLD", "Pause", token, s)).body.data.status).toBe("ON_HOLD");
    expect(await prisma.projectStatusHistory.count({ where: { projectId: pr.id } })).toBe(2); // created + on hold
    const noKey = await call(costsRoute.POST, "POST", "/x", { token, params: { id: pr.id }, body: { category: "LABOUR", description: "x", amount: "1" } });
    expect(noKey.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("writes audit rows for every state change and shows them as activity", async () => {
    const pr = await newProject({ contractValue: "1000" });
    const c = (await addCost(pr.id, { amount: "100" })).body.data;
    await voidCost(pr.id, c.id, "Wrong project");
    await patch(pr.id, { notes: "Gate pass needed", contractValue: "1200" });
    await status(pr.id, "ON_HOLD", "Rain");
    const actions = (await prisma.auditLog.findMany({ where: { entityType: "Project", entityId: pr.id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["project.create", "project.cost_add", "project.cost_void", "project.update", "project.contract_value", "project.status"]);
    const act = (await call(activityRoute.GET, "GET", "/x", { token, params: { id: pr.id } })).body.data;
    expect(act.statusHistory.map((h: any) => h.toStatus)).toEqual(["ON_HOLD", "RUNNING"]);
    expect(act.audit.map((x: any) => x.text)).toContain("Contract value: ৳ 1,000.00 → ৳ 1,200.00");
    const mgr = await userToken(token, "Manager", ["A"]);
    const seen = (await call(activityRoute.GET, "GET", "/x", { token: mgr.token, params: { id: pr.id } })).body.data.audit.map((x: any) => x.text);
    expect(seen).toContain("Contract value changed");
    expect(seen.join(" ")).not.toContain("1,200");
  });

  it("project documents: upload, list, remove", async () => {
    const pr = await newProject();
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const fd = new FormData();
    fd.append("file", new Blob([png], { type: "image/png" }), "site.png");
    fd.append("label", "Site photo");
    const up = await call(filesRoute.POST, "POST", "/x", { token, params: { id: pr.id }, body: fd });
    expect(up.status).toBe(201);
    expect((await call(filesRoute.GET, "GET", "/x", { token, params: { id: pr.id } })).body.data.map((a: any) => a.label)).toEqual(["Site photo"]);
  });

  it("documents every projects endpoint in OpenAPI", async () => {
    const openapiRoute = await import("@/app/api/v1/openapi.json/route");
    const doc = await (await openapiRoute.GET()).json();
    const expected: [string, string][] = [
      ["/projects", "get"], ["/projects", "post"], ["/projects/options", "get"], ["/projects/{id}", "get"], ["/projects/{id}", "patch"], ["/projects/{id}/deactivate", "post"],
      ["/projects/{id}/status", "post"], ["/projects/{id}/status-history", "get"], ["/projects/{id}/activity", "get"], ["/projects/{id}/material", "get"], ["/projects/{id}/movements", "get"],
      ["/projects/{id}/costs", "get"], ["/projects/{id}/costs", "post"], ["/projects/{id}/costs/{costId}/void", "post"],
      ["/projects/{id}/attachments", "post"], ["/projects/{id}/attachments", "get"], ["/projects/{id}/attachments/{attachmentId}", "delete"],
      ["/projects/{id}/costs/{costId}/attachments", "post"], ["/projects/{id}/costs/{costId}/attachments/{attachmentId}", "delete"], ["/projects/{id}/documents", "post"],
    ];
    for (const [p, m] of expected) expect(doc.paths[p]?.[m], `${m} ${p}`).toBeDefined();
  });
});
