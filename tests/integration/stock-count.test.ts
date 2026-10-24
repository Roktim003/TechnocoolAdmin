import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Worker } from "bullmq";
import * as countsRoute from "@/app/api/v1/stock-counts/route";
import * as sheetRoute from "@/app/api/v1/stock-counts/[id]/sheet/route";
import * as documentRoute from "@/app/api/v1/documents/[jobId]/route";
import * as calculateRoute from "@/app/api/v1/stock-entries/calculate/route";
import { processDocumentJob } from "@/modules/inventory/interface/documents";
import { browserPath } from "@/modules/inventory/infrastructure/pdf";
import { getQueue, queuePrefix, QUEUES } from "@/shared/queue/queue";
import { bullConnection } from "@/shared/redis/redis";
import { logger } from "@/shared/logger/logger";
import { fiscalYear } from "@/modules/inventory/domain/numbering";
import { call } from "../helpers/http";
import { resetDatabase } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";
import { balance, cost, createEntry, grn, key, post, prisma, product, project, receive, userToken, wh } from "../helpers/inventory";
import { approveCount, cancelCount, countLine, createCount, getCount, lineOf, recount, startCount, submitCount, variance } from "../helpers/control";

let token: string;
let A: string;
let B: string;
const FY = fiscalYear(new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date())}T00:00:00Z`));

afterAll(async () => {
  await getQueue(QUEUES.documents).close();
});

beforeEach(async () => {
  await resetDatabase();
  token = await adminToken();
  A = await wh("A");
  B = await wh("B");
});

const issue = (productId: string, qty = 1, warehouseId = A) => ({ type: "ISSUE_TO_PROJECT", warehouseId, lines: [{ productId, qty }] });

async function counting(scopeIds: string[], opts: Record<string, unknown> = {}, t = token) {
  const c = await createCount(t, { warehouseId: A, scope: "SELECTED_PRODUCTS", scopeIds, ...opts });
  const s = await startCount(c.id, t);
  expect(s.status).toBe(200);
  return s.body.data;
}

describe("stock count lifecycle", () => {
  it("numbers SC-FY-0001, snapshots system qty at start, and adds damaged lines", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 5, unitPrice: "100" }]);
    const c = await createCount(token, { warehouseId: A, scope: "SELECTED_PRODUCTS", scopeIds: [p.id], notes: "Year-end" });
    expect(c).toMatchObject({ number: `SC-${FY}-0001`, status: "DRAFT" });
    expect(c.lines[0].systemQty).toBeNull();
    // Still DRAFT: stock can move, and the snapshot will include it.
    await grn(token, A, [{ productId: p.id, qty: 3, unitPrice: "100" }]);
    await post(token, { type: "RETURN_FROM_SITE", warehouseId: A, projectId: await project(), lines: [{ productId: p.id, qty: 2, condition: "DAMAGED" }] });
    const s = (await startCount(c.id, token)).body.data;
    expect(s.status).toBe("COUNTING");
    expect(s.startedAt).toBeTruthy();
    expect(lineOf(s, p.id).systemQty).toBe("8.000");
    expect(lineOf(s, p.id, "DAMAGED").systemQty).toBe("2.000");
    expect(await prisma.auditLog.count({ where: { action: "stock_count.start", entityId: c.id } })).toBe(1);
  });

  it("freezes counted products in that warehouse only, until approval or cancel", async () => {
    const p = await product(token);
    const other = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 5, unitPrice: "100" }, { productId: other.id, qty: 5, unitPrice: "100" }]);
    await grn(token, B, [{ productId: p.id, qty: 5, unitPrice: "100" }]);
    const store = await userToken(token, "Store Manager", ["A", "B"]);
    const pendingBefore = (await createEntry(store.token, { ...issue(p.id), action: "submit", projectId: await project() })).body.data;
    const transfer = await post(token, { type: "TRANSFER", warehouseId: B, toWarehouseId: A, lines: [{ productId: p.id, qty: 1 }] });

    const c = await counting([p.id]);
    const blocked = await createEntry(token, { ...issue(p.id), projectId: await project() });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.details[0].code).toBe("COUNT_IN_PROGRESS");
    expect(blocked.body.error.message).toContain(c.number);
    // Submitting (reserving), approving and receiving into the frozen warehouse are blocked too.
    expect((await createEntry(store.token, { ...issue(p.id), action: "submit", projectId: await project() })).body.error.details[0].code).toBe("COUNT_IN_PROGRESS");
    const { approve } = await import("../helpers/inventory");
    expect((await approve(pendingBefore.id, token)).body.error.details[0].code).toBe("COUNT_IN_PROGRESS");
    expect((await receive(transfer.id, token, { lines: [{ lineId: transfer.lines[0].id, receivedQty: 1 }] })).body.error.details[0].code).toBe("COUNT_IN_PROGRESS");
    // Other products, and the same product elsewhere, still move.
    expect((await createEntry(token, { ...issue(other.id), projectId: await project() })).status).toBe(201);
    expect((await createEntry(token, { ...issue(p.id, 1, B), projectId: await project() })).status).toBe(201);
    // A second count of the same products can't start.
    const c2 = await createCount(token, { warehouseId: A, scope: "SELECTED_PRODUCTS", scopeIds: [p.id] });
    expect((await startCount(c2.id, token)).body.error.details[0].code).toBe("COUNT_IN_PROGRESS");

    // Cancel unfreezes, with no stock change.
    const before = await balance(p.id, "A");
    const x = await cancelCount(c.id, token);
    expect(x.body.data.status).toBe("CANCELLED");
    expect(await balance(p.id, "A")).toEqual(before);
    expect((await createEntry(token, { ...issue(p.id), projectId: await project() })).status).toBe(201);
  });

  it("blind count hides system qty (and expected serials) from counters, not from approvers", async () => {
    const p = await product(token, { trackSerial: true });
    await grn(token, A, [{ productId: p.id, qty: 2, unitPrice: "100", serials: ["B-1", "B-2"] }]);
    const c = await counting([p.id], { blindCount: true });
    const counter = await userToken(token, "Store Manager", ["A"]);
    const seen = (await getCount(c.id, counter.token)).body.data;
    expect(seen.systemVisible).toBe(false);
    expect(lineOf(seen, p.id)).not.toHaveProperty("systemQty");
    expect(lineOf(seen, p.id)).not.toHaveProperty("variance");
    const after = (await countLine(c.id, lineOf(seen, p.id).id, counter.token, { serials: ["B-1"] })).body.data;
    expect(lineOf(after, p.id).serials).toEqual([{ serial: "B-1" }]); // no FOUND / MISSING hints
    expect((await variance(c.id, counter.token)).body.data.lines).toEqual([]);

    const mgr = await userToken(token, "Manager", ["A"]);
    const full = (await getCount(c.id, mgr.token)).body.data;
    expect(lineOf(full, p.id)).toMatchObject({ systemQty: "2.000", variance: "-1.000" });
    expect(lineOf(full, p.id).serials).toEqual([
      { serial: "B-1", result: "FOUND" },
      { serial: "B-2", result: "MISSING" },
    ]);
  });

  it("several counters work at the same time; each line records who counted it", async () => {
    const ps = [await product(token), await product(token), await product(token)];
    await grn(token, A, ps.map((p) => ({ productId: p.id, qty: 4, unitPrice: "10" })));
    const c = await counting(ps.map((p) => p.id));
    const u1 = await userToken(token, "Store Manager", ["A"]);
    const u2 = await userToken(token, "Store Manager", ["A"]);
    const results = await Promise.all([
      countLine(c.id, lineOf(c, ps[0]!.id).id, u1.token, { countedQty: "4" }),
      countLine(c.id, lineOf(c, ps[1]!.id).id, u2.token, { countedQty: "3.5" }),
      countLine(c.id, lineOf(c, ps[2]!.id).id, u1.token, { countedQty: "5", note: "Found behind rack" }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const now = (await getCount(c.id, token)).body.data;
    expect(now.progress).toEqual({ total: 3, counted: 3, recount: 0 });
    expect(lineOf(now, ps[0]!.id).countedBy.id).toBe(u1.id);
    expect(lineOf(now, ps[1]!.id)).toMatchObject({ countedQty: "3.500", countedBy: { id: u2.id } });
    expect(lineOf(now, ps[2]!.id).note).toBe("Found behind rack");
    // Lines can be updated until submit.
    expect((await countLine(c.id, lineOf(c, ps[1]!.id).id, u1.token, { countedQty: "4" })).body.data.lines.find((l: any) => l.id === lineOf(c, ps[1]!.id).id).countedQty).toBe("4.000");
    // Outside the warehouse: 403.
    const outsider = await userToken(token, "Store Manager", ["B"]);
    expect((await countLine(c.id, lineOf(c, ps[0]!.id).id, outsider.token, { countedQty: "1" })).status).toBe(403);
  });

  it("serials: FOUND, MISSING and UNEXPECTED; counted qty = serials found; refuses serials recorded elsewhere", async () => {
    const p = await product(token, { trackSerial: true });
    await grn(token, A, [{ productId: p.id, qty: 3, unitPrice: "1000", serials: ["S-1", "S-2", "S-3"] }]);
    await grn(token, B, [{ productId: p.id, qty: 1, unitPrice: "1000", serials: ["S-B"] }]);
    const c = await counting([p.id]);
    const line = lineOf(c, p.id);
    const res = await countLine(c.id, line.id, token, { serials: ["s-1", "S-3", "S-9"] });
    expect(res.status).toBe(200);
    const l = lineOf(res.body.data, p.id);
    expect(l.countedQty).toBe("3.000");
    expect(l.serials).toEqual([
      { serial: "S-1", result: "FOUND" },
      { serial: "S-2", result: "MISSING" },
      { serial: "S-3", result: "FOUND" },
      { serial: "S-9", result: "UNEXPECTED" },
    ]);
    expect((await countLine(c.id, line.id, token, { serials: ["S-B"] })).body.error.details[0].code).toBe("SERIAL_UNAVAILABLE");
    expect((await countLine(c.id, line.id, token, { serials: ["S-1"], countedQty: "2" })).status).toBe(400);
  });

  it("submit needs every line counted (or marked 0); approve posts a STOCK_ADJUSTMENT at average cost", async () => {
    const a = await product(token);
    const b = await product(token);
    const z = await product(token);
    const t = await product(token, { trackSerial: true });
    await grn(token, A, [{ productId: a.id, qty: 10, unitPrice: "100" }, { productId: b.id, qty: 4, unitPrice: "250" }, { productId: z.id, qty: 2, unitPrice: "30" }]);
    await grn(token, A, [{ productId: a.id, qty: 10, unitPrice: "110" }]); // a: avg 105
    await grn(token, A, [{ productId: t.id, qty: 2, unitPrice: "5000", serials: ["T-1", "T-2"] }]);
    const counter = await userToken(token, "Store Manager", ["A"]);
    const c = await counting([a.id, b.id, z.id, t.id], {}, counter.token);

    await countLine(c.id, lineOf(c, a.id).id, counter.token, { countedQty: "22" }); // +2
    await countLine(c.id, lineOf(c, b.id).id, counter.token, { countedQty: "1" }); // −3
    await countLine(c.id, lineOf(c, t.id).id, counter.token, { serials: ["T-1", "T-7"] }); // T-2 missing, T-7 unexpected
    const notYet = await submitCount(c.id, counter.token);
    expect(notYet.status).toBe(422);
    expect(notYet.body.error.details[0].code).toBe("LINES_NOT_COUNTED");
    const sub = await submitCount(c.id, counter.token, { markUncountedAsZero: true }); // z → 0 (−2)
    expect(sub.body.data.status).toBe("SUBMITTED");
    expect(lineOf(sub.body.data, z.id)).toMatchObject({ countedQty: "0.000", notCounted: true });

    // The submitter can't approve; a Store Manager can't either.
    expect((await approveCount(c.id, counter.token)).status).toBe(403);
    const mgr = await userToken(token, "Manager", ["A"]);
    const v = (await variance(c.id, mgr.token)).body.data;
    expect(v.totals).toMatchObject({ linesWithVariance: 4, gainQty: "2.000", lossQty: "5.000", gainValue: "210.00", lossValue: "810.00", netValue: "-600.00" });
    expect(v.lines[0].product.id).toBe(b.id); // largest value difference first (750)

    const ok = await approveCount(c.id, mgr.token);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ status: "APPROVED", approvedBy: { id: mgr.id } });
    const entry = await prisma.stockEntry.findUniqueOrThrow({ where: { id: ok.body.data.adjustmentEntry.id }, include: { lines: { orderBy: { lineNo: "asc" } } } });
    expect(entry).toMatchObject({ type: "STOCK_ADJUSTMENT", status: "POSTED", number: `ADJ-${FY}-0001`, verifiedById: mgr.id });
    expect(entry.lines.map((l) => [l.adjustDirection, l.qty.toFixed(3), l.unitCostBdt.toFixed(4), l.costAmount.toFixed(2)])).toEqual(
      expect.arrayContaining([
        ["GAIN", "2.000", "105.0000", "210.00"],
        ["LOSS", "3.000", "250.0000", "750.00"],
        ["LOSS", "2.000", "30.0000", "60.00"],
        ["LOSS", "1.000", "5000.0000", "5000.00"],
        ["GAIN", "1.000", "5000.0000", "5000.00"],
      ]),
    );
    expect(await balance(a.id, "A")).toMatchObject({ onHand: "22.000" });
    expect(await cost(a.id)).toEqual({ totalQty: "22.000", totalValue: "2310.00", avgCost: "105.0000" });
    expect(await balance(b.id, "A")).toMatchObject({ onHand: "1.000" });
    expect(await cost(b.id)).toEqual({ totalQty: "1.000", totalValue: "250.00", avgCost: "250.0000" });
    expect(await cost(z.id)).toMatchObject({ totalQty: "0.000", totalValue: "0.00" });
    expect(await balance(t.id, "A")).toMatchObject({ onHand: "2.000" });
    const serials = Object.fromEntries((await prisma.serialNumber.findMany({ where: { productId: t.id } })).map((s) => [s.serial, s.status]));
    expect(serials).toEqual({ "T-1": "IN_STOCK", "T-2": "WRITTEN_OFF", "T-7": "IN_STOCK" });
    // Unfrozen.
    expect((await createEntry(token, { ...issue(a.id), projectId: await project() })).status).toBe(201);
    expect(await prisma.auditLog.count({ where: { action: "stock_count.approve", entityId: c.id } })).toBe(1);
  });

  it("recount sends it back to COUNTING with flagged lines that must be counted again", async () => {
    const p = await product(token);
    const q = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 5, unitPrice: "10" }, { productId: q.id, qty: 5, unitPrice: "10" }]);
    const counter = await userToken(token, "Store Manager", ["A"]);
    const c = await counting([p.id, q.id], {}, counter.token);
    await countLine(c.id, lineOf(c, p.id).id, counter.token, { countedQty: "50" });
    await countLine(c.id, lineOf(c, q.id).id, counter.token, { countedQty: "5" });
    await submitCount(c.id, counter.token);
    const mgr = await userToken(token, "Manager", ["A"]);
    const r = await recount(c.id, mgr.token, [lineOf(c, p.id).id]);
    expect(r.body.data).toMatchObject({ status: "COUNTING", progress: { recount: 1 } });
    expect(lineOf(r.body.data, p.id).recountRequested).toBe(true);
    expect((await submitCount(c.id, counter.token)).body.error.details[0].code).toBe("RECOUNT_PENDING");
    await countLine(c.id, lineOf(c, p.id).id, counter.token, { countedQty: "5" });
    expect((await submitCount(c.id, counter.token)).body.data.status).toBe("SUBMITTED");
    const done = await approveCount(c.id, mgr.token);
    // Zero variance: approved with no adjustment entry.
    expect(done.body.data).toMatchObject({ status: "APPROVED", adjustmentEntry: null });
    expect(await prisma.stockEntry.count({ where: { type: "STOCK_ADJUSTMENT" } })).toBe(0);
  });

  it("variance values are hidden without seeCost; Store Manager can't approve; idempotent start / submit / approve", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 5, unitPrice: "40" }]);
    const counter = await userToken(token, "Store Manager", ["A"]);
    const c = await createCount(counter.token, { warehouseId: A, scope: "ALL" });
    const k = key("start");
    const s1 = await startCount(c.id, counter.token, k);
    const s2 = await startCount(c.id, counter.token, k);
    expect(s2.body).toEqual(s1.body);
    await countLine(c.id, lineOf(s1.body.data, p.id).id, counter.token, { countedQty: "3" });
    const ks = key("submit");
    const sub = await submitCount(c.id, counter.token, { markUncountedAsZero: true }, ks);
    expect((await submitCount(c.id, counter.token, { markUncountedAsZero: true }, ks)).body).toEqual(sub.body);

    const v = (await variance(c.id, counter.token)).body.data;
    expect(v.lines[0]).toMatchObject({ variance: "-2.000" });
    expect(v.lines[0]).not.toHaveProperty("varianceValue");
    expect(v.totals).not.toHaveProperty("lossValue");
    expect((await variance(c.id, token)).body.data.lines[0].varianceValue).toBe("-80.00");

    const ka = key("approve");
    const a1 = await approveCount(c.id, token, ka);
    const a2 = await approveCount(c.id, token, ka);
    expect(a2.body).toEqual(a1.body);
    expect(await prisma.stockEntry.count({ where: { type: "STOCK_ADJUSTMENT" } })).toBe(1);
    expect(await balance(p.id, "A")).toMatchObject({ onHand: "3.000" });

    const list = await call(countsRoute.GET, "GET", "/stock-counts", { token: counter.token, query: { status: "APPROVED" } });
    expect(list.body.data.map((x: any) => x.number)).toEqual([c.number]);
    const outsider = await userToken(token, "Store Manager", ["B"]);
    expect((await getCount(c.id, outsider.token)).status).toBe(403);
    expect((await createCount(token, { warehouseId: B, scope: "SELECTED_PRODUCTS", scopeIds: [] }).catch((e) => e.message))).toMatch(/400/);
  });
});

describe("count sheet and warnings", () => {
  it.skipIf(!browserPath())("prints a count sheet PDF in the worker (blind counts without system qty)", async () => {
    const worker = new Worker(QUEUES.documents, (job) => processDocumentJob(job, logger), { connection: bullConnection(), prefix: queuePrefix() });
    try {
      const p = await product(token);
      await grn(token, A, [{ productId: p.id, qty: 7, unitPrice: "10" }]);
      const c = await counting([p.id], { blindCount: true });
      const counter = await userToken(token, "Store Manager", ["A"]);
      const res = await call(sheetRoute.GET, "GET", "/x", { token: counter.token, params: { id: c.id } });
      expect(res.status).toBe(202);
      const jobId = res.body.data.jobId;
      const job = await getQueue(QUEUES.documents).getJob(jobId);
      expect(job!.data).toMatchObject({ countId: c.id, showSystem: false });
      let status = "";
      for (let i = 0; i < 60 && !["completed", "failed"].includes(status); i++) {
        await new Promise((r) => setTimeout(r, 500));
        status = (await call(documentRoute.GET, "GET", "/x", { token: counter.token, params: { jobId } })).body.data.status;
      }
      expect(status).toBe("completed");
      const pdf = await call(documentRoute.GET, "GET", "/x", { token: counter.token, params: { jobId }, query: { download: "1" } });
      expect(new TextDecoder().decode(pdf.bytes.slice(0, 5))).toBe("%PDF-");
      // The approver's sheet shows system quantities.
      const mgr = await userToken(token, "Manager", ["A"]);
      const r2 = await call(sheetRoute.GET, "GET", "/x", { token: mgr.token, params: { id: c.id } });
      expect((await getQueue(QUEUES.documents).getJob(r2.body.data.jobId))!.data.showSystem).toBe(true);
    } finally {
      await worker.close();
    }
  }, 60_000);

  it("calculate warns while a count is in progress", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 3, unitPrice: "10" }]);
    await counting([p.id]);
    const calc = await call(calculateRoute.POST, "POST", "/x", { token, body: { ...issue(p.id), projectId: await project() } });
    expect(calc.body.data.warnings.map((w: any) => w.code)).toContain("COUNT_IN_PROGRESS");
  });
});
