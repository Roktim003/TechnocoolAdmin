import { beforeEach, describe, expect, it } from "vitest";
import * as entryRoute from "@/app/api/v1/stock-entries/[id]/route";
import * as submitRoute from "@/app/api/v1/stock-entries/[id]/submit/route";
import * as cancelRoute from "@/app/api/v1/stock-entries/[id]/cancel/route";
import * as settingsRoute from "@/app/api/v1/inventory-settings/route";
import * as serialsRoute from "@/app/api/v1/serials/route";
import * as serialRoute from "@/app/api/v1/serials/[id]/route";
import * as balancesRoute from "@/app/api/v1/stock/balances/route";
import * as movementsRoute from "@/app/api/v1/stock/movements/route";
import { fiscalYear } from "@/modules/inventory/domain/numbering";
import { call } from "../helpers/http";
import { resetDatabase } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";
import { action, approve, availability, balance, cost, createEntry, grn, key, post, prisma, product, project, reject, reverse, supplier, userToken, wh } from "../helpers/inventory";

let token: string;
let A: string;
let B: string;
const FY = fiscalYear(new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date())}T00:00:00Z`));

beforeEach(async () => {
  await resetDatabase();
  token = await adminToken();
  A = await wh("A");
  B = await wh("B");
});

const issue = (qty: number | string, productId: string, extra: Record<string, unknown> = {}) => ({ type: "ISSUE_TO_PROJECT", warehouseId: A, lines: [{ productId, qty, ...extra }] });
const getEntry = (t: string, id: string) => call(entryRoute.GET, "GET", `/stock-entries/${id}`, { token: t, params: { id } });

describe("approval workflow", () => {
  it("a Store Manager's entry goes PENDING, reserves stock, and posts on approval; Admin posts directly", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 5, unitPrice: "100" }]);
    const store = await userToken(token, "Store Manager", ["A"]);
    const mgr = await userToken(token, "Manager", ["A"]);

    // Store Manager can't post directly.
    expect((await createEntry(store.token, { ...issue(1, p.id), projectId: await project() })).status).toBe(403);

    const res = await createEntry(store.token, { ...issue(3, p.id), action: "submit", projectId: await project() });
    expect(res.status).toBe(201);
    const e = res.body.data;
    expect(e.status).toBe("PENDING");
    expect(e.number).toBe(`ISS-${FY}-0001`); // numbered on submit
    expect(await availability(token, p.id, A)).toMatchObject({ onHand: "5.000", reserved: "3.000", available: "2.000" });

    // Reserved stock is not available to others.
    const second = await createEntry(store.token, { ...issue(3, p.id), action: "submit", projectId: await project() });
    expect(second.status).toBe(422);
    expect(second.body.error.details[0].code).toBe("INSUFFICIENT_STOCK");

    const ok = await approve(e.id, mgr.token);
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe("POSTED");
    expect(ok.body.data.verifiedBy.id).toBe(mgr.id);
    expect(await balance(p.id, "A")).toEqual({ onHand: "2.000", reserved: "0.000" });
    expect(await prisma.stockReservation.count()).toBe(0);
  });

  it("reject (with reason) and cancel both release the reservation", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 5, unitPrice: "100" }]);
    const store = await userToken(token, "Store Manager", ["A"]);
    const mgr = await userToken(token, "Manager", ["A"]);

    const e = (await createEntry(store.token, { ...issue(4, p.id), action: "submit", projectId: await project() })).body.data;
    expect((await action(await import("@/app/api/v1/stock-entries/[id]/reject/route"), e.id, mgr.token, {})).status).toBe(400); // reason required
    const r = await reject(e.id, mgr.token, "Wrong project");
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ status: "REJECTED", rejectionReason: "Wrong project" });
    expect(await balance(p.id, "A")).toEqual({ onHand: "5.000", reserved: "0.000" });

    // The creator fixes and resubmits; the number is kept.
    const again = await action(submitRoute, e.id, store.token);
    expect(again.body.data).toMatchObject({ status: "PENDING", number: e.number });
    expect(await balance(p.id, "A")).toMatchObject({ reserved: "4.000" });

    // Only the creator (or FULL) can cancel.
    const other = await userToken(token, "Store Manager", ["A"]);
    expect((await action(cancelRoute, e.id, other.token)).status).toBe(403);
    const c = await action(cancelRoute, e.id, store.token);
    expect(c.body.data.status).toBe("CANCELLED");
    expect(await balance(p.id, "A")).toEqual({ onHand: "5.000", reserved: "0.000" });
    expect(await prisma.stockMovement.count({ where: { entryId: e.id } })).toBe(0);
  });

  it("blocks self-approval, non-approvers and approvers outside the warehouse", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 5, unitPrice: "100" }]);
    const mgr = await userToken(token, "Manager", ["A"]);
    const own = (await createEntry(mgr.token, { ...issue(1, p.id), action: "submit", projectId: await project() })).body.data;
    expect((await approve(own.id, mgr.token)).status).toBe(403);

    const store = await userToken(token, "Store Manager", ["A"]);
    const e = (await createEntry(store.token, { ...issue(1, p.id), action: "submit", projectId: await project() })).body.data;
    expect((await approve(e.id, (await userToken(token, "Store Manager", ["A"])).token)).status).toBe(403); // no APPROVE
    const mgrB = await userToken(token, "Manager", ["B"]);
    expect((await approve(e.id, mgrB.token)).status).toBe(403); // out of scope
    expect((await getEntry(mgrB.token, e.id)).status).toBe(403);
    expect((await createEntry(store.token, { ...issue(1, p.id), warehouseId: B, action: "submit", projectId: await project() })).status).toBe(403);

    expect((await approve(own.id, store.token)).status).toBe(403);
    expect((await approve(e.id, mgr.token)).body.data.status).toBe("POSTED");
    expect((await approve(e.id, token)).status).toBe(422); // already posted
  });

  it("approve is idempotent: a replay with the same key returns the same result and posts once", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 5, unitPrice: "100" }]);
    const store = await userToken(token, "Store Manager", ["A"]);
    const e = (await createEntry(store.token, { ...issue(2, p.id), action: "submit", projectId: await project() })).body.data;
    const k = key("approve");
    const first = await approve(e.id, token, undefined, k);
    const replay = await approve(e.id, token, undefined, k);
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect(await prisma.stockMovement.count({ where: { entryId: e.id } })).toBe(1);
    expect(await balance(p.id, "A")).toMatchObject({ onHand: "3.000" });
  });

  it("write-off by Admin needs approval when the setting is on", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 5, unitPrice: "100" }]);
    const patch = await call(settingsRoute.PATCH, "PATCH", "/inventory-settings", { token, body: { adminWriteOffNeedsApproval: true } });
    expect(patch.status).toBe(200);
    expect(patch.body.data.adminWriteOffNeedsApproval).toBe(true);

    const body = { type: "DAMAGE_WRITE_OFF", warehouseId: A, reason: "Broken", lines: [{ productId: p.id, qty: 1 }] };
    const direct = await createEntry(token, body);
    expect(direct.status).toBe(422);
    expect(direct.body.error.details[0].code).toBe("APPROVAL_REQUIRED");
    const pending = (await createEntry(token, { ...body, action: "submit" })).body.data;
    expect(pending.status).toBe("PENDING");
    const mgr = await userToken(token, "Manager", ["A"]);
    expect((await approve(pending.id, mgr.token)).body.data.status).toBe("POSTED");

    const store = await userToken(token, "Store Manager", ["A"]);
    expect((await call(settingsRoute.GET, "GET", "/inventory-settings", { token: store.token })).status).toBe(403);
  });
});

describe("concurrency", () => {
  it("two simultaneous issues of the last units: exactly one succeeds, stock never goes negative", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 5, unitPrice: "100" }]);
    const projectId = await project();
    const results = await Promise.all([createEntry(token, { ...issue(5, p.id), projectId }), createEntry(token, { ...issue(5, p.id), projectId }), createEntry(token, { ...issue(5, p.id), projectId })]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 422, 422]);
    expect(await balance(p.id, "A")).toEqual({ onHand: "0.000", reserved: "0.000" });
    expect(await cost(p.id)).toMatchObject({ totalQty: "0.000", totalValue: "0.00" });
  });

  it("concurrent posts get gap-free, unique numbers", async () => {
    const p = await product(token);
    const sup = await supplier();
    const n = 8;
    const results = await Promise.all(Array.from({ length: n }, () => createEntry(token, { type: "GRN_LOCAL", warehouseId: A, supplierId: sup, lines: [{ productId: p.id, qty: 1, unitPrice: "10" }] })));
    expect(results.every((r) => r.status === 201)).toBe(true);
    const numbers = results.map((r) => r.body.data.number).sort();
    expect(numbers).toEqual(Array.from({ length: n }, (_, i) => `GRN-L-${FY}-${String(i + 1).padStart(4, "0")}`));
    expect(await cost(p.id)).toEqual({ totalQty: "8.000", totalValue: "80.00", avgCost: "10.0000" });
  });
});

describe("reversal", () => {
  it("restores stock and cost exactly, and marks the original reversed", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "100" }]);
    const second = await grn(token, A, [{ productId: p.id, qty: 3, unitPrice: "133.33" }]);
    const before = await cost(p.id);
    const iss = await post(token, { ...issue(7, p.id), projectId: await project() });

    const r = await reverse(iss.id, token, "Issued by mistake");
    expect(r.status).toBe(200);
    expect(r.body.data.original.status).toBe("REVERSED");
    expect(r.body.data.reversal).toMatchObject({ type: "REVERSAL", status: "POSTED", number: `REV-${FY}-0001` });
    expect(await cost(p.id)).toEqual(before);
    expect(await balance(p.id, "A")).toMatchObject({ onHand: "13.000" });

    // Reversing the second GRN takes out exactly what it added.
    await reverse(second.id, token);
    expect(await cost(p.id)).toEqual({ totalQty: "10.000", totalValue: "1000.00", avgCost: "100.0000" });
    expect((await reverse(second.id, token)).status).toBe(422); // already reversed
  });

  it("is refused when it would make stock negative, needs FULL and a reason", async () => {
    const p = await product(token);
    const g = await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "100" }]);
    await post(token, { ...issue(6, p.id), projectId: await project() });
    const res = await reverse(g.id, token);
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].code).toBe("REVERSAL_NEGATIVE_STOCK");
    expect(await balance(p.id, "A")).toMatchObject({ onHand: "4.000" });

    const mgr = await userToken(token, "Manager", ["A"]);
    expect((await reverse(g.id, mgr.token)).status).toBe(403);
    expect((await action(await import("@/app/api/v1/stock-entries/[id]/reverse/route"), g.id, token, { reason: "" })).status).toBe(400);
  });
});

describe("serial numbers", () => {
  it("count must equal qty; serials move with the stock and keep a history", async () => {
    const p = await product(token, { trackSerial: true });
    const sup = await supplier();
    const bad = await createEntry(token, { type: "GRN_LOCAL", warehouseId: A, supplierId: sup, lines: [{ productId: p.id, qty: 2, unitPrice: "100", serials: ["S-1"] }] });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details[0].code).toBe("SERIAL_COUNT");

    await grn(token, A, [{ productId: p.id, qty: 2, unitPrice: "100", serials: ["S-1", "S-2"] }]);
    await grn(token, B, [{ productId: p.id, qty: 1, unitPrice: "100", serials: ["S-3"] }]);
    const dup = await createEntry(token, { type: "GRN_LOCAL", warehouseId: A, supplierId: sup, lines: [{ productId: p.id, qty: 1, unitPrice: "100", serials: ["s-1"] }] });
    expect(dup.body.error.details[0].code).toBe("SERIAL_EXISTS");

    // S-3 is in warehouse B, so it can't be issued from A.
    const wrong = await createEntry(token, { ...issue(1, p.id, { serials: ["S-3"] }), projectId: await project() });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.details[0].code).toBe("SERIAL_UNAVAILABLE");

    const iss = await post(token, { ...issue(1, p.id, { serials: ["S-1"] }), projectId: await project() });
    const list = await call(serialsRoute.GET, "GET", "/serials", { token, query: { productId: p.id, status: "ISSUED" } });
    expect(list.body.data.map((s: any) => s.serial)).toEqual(["S-1"]);
    const s1 = list.body.data[0];
    const detail = await call(serialRoute.GET, "GET", `/serials/${s1.id}`, { token, params: { id: s1.id } });
    expect(detail.body.data.history.map((h: any) => h.entryNumber ?? h.entry?.number)).toEqual([`GRN-L-${FY}-0001`, iss.number]);

    // Reversal puts the serial back in stock.
    await reverse(iss.id, token);
    expect((await prisma.serialNumber.findFirstOrThrow({ where: { serial: "S-1" } })).status).toBe("IN_STOCK");
  });

  it("a submitted issue reserves its serials", async () => {
    const p = await product(token, { trackSerial: true });
    await grn(token, A, [{ productId: p.id, qty: 2, unitPrice: "100", serials: ["R-1", "R-2"] }]);
    const store = await userToken(token, "Store Manager", ["A"]);
    const e = (await createEntry(store.token, { ...issue(1, p.id, { serials: ["R-1"] }), action: "submit", projectId: await project() })).body.data;
    expect((await prisma.serialNumber.findFirstOrThrow({ where: { serial: "R-1" } })).status).toBe("RESERVED");
    const clash = await createEntry(token, { ...issue(1, p.id, { serials: ["R-1"] }), projectId: await project() });
    expect(clash.body.error.details[0].code).toBe("SERIAL_UNAVAILABLE");
    await reject(e.id, token);
    expect((await prisma.serialNumber.findFirstOrThrow({ where: { serial: "R-1" } })).status).toBe("IN_STOCK");
  });
});

describe("sensitive fields", () => {
  const COST_KEYS = ["unitCost", "unitCostBdt", "landedUnitCost", "costAmount", "costTotal", "avgCost", "stockValue", "valueChange", "avgCostAfter", "profit"];
  const findKeys = (v: unknown, found = new Set<string>()): Set<string> => {
    if (Array.isArray(v)) v.forEach((x) => findKeys(x, found));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
      if (COST_KEYS.includes(k)) found.add(k);
      findKeys(x, found);
    }
    return found;
  };

  it("Store Manager sees no cost in entries, balances or the ledger; Admin does", async () => {
    const p = await product(token, { sellingPrice: "200" });
    const g = await grn(token, A, [{ productId: p.id, qty: 5, unitPrice: "100" }]);
    const store = await userToken(token, "Store Manager", ["A"]);

    const entry = (await getEntry(store.token, g.id)).body.data;
    expect([...findKeys(entry)]).toEqual([]);
    // A GRN's line price is its cost, so it's hidden too.
    expect(entry.lines[0].unitPrice).toBeUndefined();
    expect(entry.grandTotal).toBeUndefined();

    const bal = (await call(balancesRoute.GET, "GET", "/stock/balances", { token: store.token })).body.data;
    expect(bal.length).toBeGreaterThan(0);
    expect([...findKeys(bal)]).toEqual([]);
    const mov = (await call(movementsRoute.GET, "GET", "/stock/movements", { token: store.token })).body.data;
    expect(mov.length).toBeGreaterThan(0);
    expect([...findKeys(mov)]).toEqual([]);

    // A sale's selling price stays visible; its cost and profit don't.
    const sale = (await createEntry(store.token, { type: "SALE", action: "submit", warehouseId: A, customerId: (await prisma.customer.findFirstOrThrow()).id, lines: [{ productId: p.id, qty: 1 }] })).body.data;
    expect(sale.lines[0].unitPrice).toBe("200.0000");
    expect([...findKeys(sale)]).toEqual([]);

    expect(findKeys((await getEntry(token, g.id)).body.data).has("costTotal")).toBe(true);
    expect(findKeys((await call(balancesRoute.GET, "GET", "/stock/balances", { token })).body.data).has("stockValue")).toBe(true);
  });
});
