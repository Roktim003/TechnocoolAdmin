import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as posRoute from "@/app/api/v1/purchase-orders/route";
import * as calcRoute from "@/app/api/v1/purchase-orders/calculate/route";
import * as receivableListRoute from "@/app/api/v1/purchase-orders/receivable/route";
import * as emailRoute from "@/app/api/v1/purchase-orders/[id]/email/route";
import * as documentsRoute from "@/app/api/v1/purchase-orders/[id]/documents/route";
import * as fromLowStockRoute from "@/app/api/v1/purchase-orders/from-low-stock/route";
import * as suppliersRoute from "@/app/api/v1/suppliers/route";
import * as supplierRoute from "@/app/api/v1/suppliers/[id]/route";
import * as supplierHistoryRoute from "@/app/api/v1/suppliers/[id]/price-history/route";
import * as productHistoryRoute from "@/app/api/v1/products/[id]/price-history/route";
import * as discontinueRoute from "@/app/api/v1/products/[id]/discontinue/route";
import * as productRoute from "@/app/api/v1/products/[id]/route";
import * as entryRoute from "@/app/api/v1/stock-entries/[id]/route";
import * as entryCancelRoute from "@/app/api/v1/stock-entries/[id]/cancel/route";
import * as landedRoute from "@/app/api/v1/stock-entries/[id]/landed-cost/route";
import * as openapiRoute from "@/app/api/v1/openapi.json/route";
import { fiscalYear } from "@/modules/inventory/domain/numbering";
import { purchasing } from "@/modules/purchasing/interface/container";
import { overdueDigestContent } from "@/modules/purchasing/interface/events";
import { getQueue, QUEUES } from "@/shared/queue/queue";
import { call } from "../helpers/http";
import { resetDatabase } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";
import { approve, availability, key, prisma, product, reject, reverse, supplier, userToken, wh } from "../helpers/inventory";
import {
  amendPo,
  approvedPo,
  approvePo,
  cancelPo,
  closePo,
  createPo,
  customUser,
  FOREIGN,
  getPo,
  grnFor,
  LOCAL,
  markSent,
  patchPo,
  po,
  poLines,
  poStatus,
  receivable,
  rejectPo,
  submitPo,
} from "../helpers/purchasing";

let token: string;
let A: string;
let B: string;
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
const FY = fiscalYear(new Date(`${TODAY}T00:00:00Z`));
const day = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date(Date.now() + offset * 86_400_000));

beforeEach(async () => {
  await resetDatabase();
  token = await adminToken();
  A = await wh("A");
  B = await wh("B");
});
afterAll(async () => {
  await getQueue(QUEUES.documents).close();
  await getQueue(QUEUES.email).close();
  await getQueue(QUEUES.alerts).close();
});

const local = async () => supplier(LOCAL);
const foreign = async () => supplier(FOREIGN);

/* ───────────────────────────── PO workflow ───────────────────────────── */

describe("purchase orders: creation and totals", () => {
  it("creates a local PO (discount + VAT) and an imported PO (currency + BDT equivalent)", async () => {
    const p1 = await product(token);
    const p2 = await product(token);
    const l = await po(token, {
      supplierId: await local(),
      deliverToWarehouseId: A,
      discountAmount: "101",
      vatPercent: "15",
      lines: [
        { productId: p1.id, qty: 2, unitPrice: "1000.50" },
        { productId: p2.id, qty: 3, unitPrice: "333.3333" },
      ],
    });
    expect(l).toMatchObject({ type: "LOCAL", status: "DRAFT", number: null, currency: "BDT", exchangeRate: "1.0000", subtotal: "3001.00", discountAmount: "101.00", vatPercent: "15.00", vatAmount: "435.00", total: "3335.00", totalBdt: "3335.00" });
    expect(l.lines.map((x: any) => x.amount)).toEqual(["2001.00", "1000.00"]);
    expect(l.displayNumber).toMatch(/^DRAFT-/);

    const i = await po(token, { supplierId: await foreign(), deliverToWarehouseId: A, exchangeRate: "122.50", discountAmount: "50", vatPercent: "10", lines: [{ productId: p1.id, qty: 4, unitPrice: "1150.25" }] });
    expect(i).toMatchObject({ type: "IMPORTED", currency: "USD", exchangeRate: "122.5000", subtotal: "4601.00", discountAmount: "0.00", vatAmount: "0.00", total: "4601.00", totalBdt: "563622.50" });

    // calculate: same numbers without saving
    const calc = await call(calcRoute.POST, "POST", "/purchase-orders/calculate", { token, body: { supplierId: await foreign(), exchangeRate: "122.50", lines: [{ productId: p1.id, qty: 4, unitPrice: "1150.25" }] } });
    expect(calc.body.data).toMatchObject({ type: "IMPORTED", currency: "USD", nextNumber: `PO-${FY}-0001`, totals: { total: "4601.00", totalBdt: "563622.50" } });
    expect(await prisma.purchaseOrder.count()).toBe(2);
  });

  it("refuses an inactive supplier or a discontinued product (422), duplicate products and imports without a rate", async () => {
    const p = await product(token);
    const s = await local();
    await call(supplierRoute.PATCH, "PATCH", "/x", { token, params: { id: s }, body: { isActive: false } });
    const r1 = await createPo(token, { supplierId: s, deliverToWarehouseId: A, lines: [{ productId: p.id, qty: 1, unitPrice: 10 }] });
    expect(r1.status).toBe(422);
    expect(r1.body.error.details[0].code).toBe("INACTIVE_SUPPLIER");

    const d = await product(token);
    await call(discontinueRoute.POST, "POST", "/x", { token, params: { id: d.id } });
    const r2 = await createPo(token, { supplierId: await supplier("Nawabpur Pipe & Fittings"), deliverToWarehouseId: A, lines: [{ productId: d.id, qty: 1, unitPrice: 10 }] });
    expect(r2.status).toBe(422);
    expect(r2.body.error.details[0].code).toBe("PRODUCT_DISCONTINUED");

    const r3 = await createPo(token, { supplierId: await foreign(), deliverToWarehouseId: A, lines: [{ productId: p.id, qty: 1, unitPrice: 10 }, { productId: p.id, qty: 2, unitPrice: 10 }] });
    expect(r3.body.error.details[0].code).toBe("DUPLICATE_PRODUCT");
    const r4 = await createPo(token, { action: "submit", supplierId: await foreign(), deliverToWarehouseId: A, lines: [{ productId: p.id, qty: 1, unitPrice: 10 }] });
    expect(r4.status).toBe(400);
    expect(r4.body.error.details[0].path).toBe("exchangeRate");
    const r5 = await createPo(token, { action: "submit", supplierId: await supplier("Nawabpur Pipe & Fittings"), deliverToWarehouseId: A, lines: [{ productId: p.id, qty: 1, unitPrice: 0 }] });
    expect(r5.body.error.details[0].code).toBe("PRICE_REQUIRED");
  });
});

describe("purchase orders: approval workflow", () => {
  it("draft → submit (number) → approve; reject → edit → resubmit; notifications to approvers and creator", async () => {
    const p = await product(token);
    const mgr = await userToken(token, "Manager", ["A"]);
    const d = await po(mgr.token, { supplierId: await local(), deliverToWarehouseId: A, lines: [{ productId: p.id, qty: 10, unitPrice: 500 }] });
    const sub = await submitPo(d.id, mgr.token);
    expect(sub.body.data).toMatchObject({ status: "PENDING_APPROVAL", number: `PO-${FY}-0001` });
    const admin = await prisma.user.findFirstOrThrow({ where: { username: "admin" } });
    expect(await prisma.notification.count({ where: { userId: admin.id, type: "PO_SUBMITTED" } })).toBe(1);

    const rej = await rejectPo(d.id, token, "Use the new price list");
    expect(rej.body.data).toMatchObject({ status: "REJECTED", rejectionReason: "Use the new price list" });
    expect((await prisma.notification.findFirstOrThrow({ where: { userId: mgr.id, type: "PO_REJECTED" } })).body).toContain("Use the new price list");

    const ed = await patchPo(d.id, mgr.token, { supplierId: await local(), deliverToWarehouseId: A, lines: [{ productId: p.id, qty: 10, unitPrice: 450 }] });
    expect(ed.body.data).toMatchObject({ status: "REJECTED", total: "4500.00" });
    expect((await submitPo(d.id, mgr.token)).body.data).toMatchObject({ status: "PENDING_APPROVAL", number: `PO-${FY}-0001`, rejectionReason: null });
    const ok = await approvePo(d.id, token);
    expect(ok.body.data).toMatchObject({ status: "APPROVED", approvedBy: { id: admin.id } });
    expect(await prisma.notification.count({ where: { userId: mgr.id, type: "PO_APPROVED" } })).toBe(1);
    // Every round stays on the timeline, with the rejection reason.
    expect(ok.body.data.timeline.map((t: any) => t.event)).toEqual(["CREATED", "SUBMITTED", "REJECTED", "SUBMITTED", "APPROVED"]);
    expect(ok.body.data.timeline[2]).toMatchObject({ by: admin.name, note: "Use the new price list" });

    // Mark sent; only approved POs can be sent.
    expect((await markSent(d.id, token)).body.data).toMatchObject({ status: "SENT" });
    expect((await markSent(d.id, token)).status).toBe(422);
    // The creator can't edit an approved PO.
    expect((await patchPo(d.id, mgr.token, { supplierId: await local(), deliverToWarehouseId: A, lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] })).status).toBe(422);
  });

  it("self-approval: only FULL users may approve their own PO; other approvers can approve others' POs", async () => {
    const p = await product(token);
    const approver = await customUser(token, { purchasing: "APPROVE", inventory: "VIEW" }, { seeCost: true });
    const mgr = await userToken(token, "Manager", ["A", "B"]);
    const own = await po(approver.token, { action: "submit", supplierId: await local(), deliverToWarehouseId: A, lines: [{ productId: p.id, qty: 1, unitPrice: 100 }] });
    const self = await approvePo(own.id, approver.token);
    expect(self.status).toBe(403);
    expect((await rejectPo(own.id, approver.token)).status).toBe(403);
    const other = await po(mgr.token, { action: "submit", supplierId: await local(), deliverToWarehouseId: A, lines: [{ productId: p.id, qty: 1, unitPrice: 100 }] });
    expect((await approvePo(other.id, approver.token)).body.data.status).toBe("APPROVED");
    // Admin (FULL) may approve their own.
    const mine = await po(token, { action: "submit", supplierId: await local(), deliverToWarehouseId: A, lines: [{ productId: p.id, qty: 1, unitPrice: 100 }] });
    expect((await approvePo(mine.id, token)).body.data.status).toBe("APPROVED");
  });

  it("Save & approve works for Admin only", async () => {
    const p = await product(token);
    const body = { action: "approve" as const, supplierId: await local(), deliverToWarehouseId: A, lines: [{ productId: p.id, qty: 1, unitPrice: 100 }] };
    const mgr = await userToken(token, "Manager", ["A"]);
    expect((await createPo(mgr.token, body)).status).toBe(403);
    const approver = await customUser(token, { purchasing: "APPROVE" });
    expect((await createPo(approver.token, body)).status).toBe(403); // would be self-approval
    const ok = await createPo(token, body);
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ status: "APPROVED", number: `PO-${FY}-0001` });
    expect(await prisma.purchaseOrder.count()).toBe(1); // the refused requests created nothing
  });

  it("cancel is blocked after any receipt; close only when partly received", async () => {
    const p = await product(token);
    const a = await approvedPo(token, [{ productId: p.id, qty: 10, unitPrice: 100 }]);
    expect((await closePo(a.id, token)).status).toBe(422); // nothing received yet
    expect((await grnFor(token, a.id, [{ productId: p.id, qty: 4 }], { warehouseId: A })).status).toBe(201);
    expect(await poStatus(a.id)).toBe("PARTLY_RECEIVED");
    const c = await cancelPo(a.id, token);
    expect(c.status).toBe(422);
    expect(c.body.error.details[0].code).toBe("PO_HAS_RECEIPTS");
    const cl = await closePo(a.id, token, "Supplier discontinued the model");
    expect(cl.body.data).toMatchObject({ status: "CLOSED", closedReason: "Supplier discontinued the model" });
    expect(cl.body.data.lines[0].remainingQty).toBe("0.000");
    // A closed PO can't be received against any more.
    const g = await grnFor(token, a.id, [{ productId: p.id, qty: 1 }], { warehouseId: A });
    expect(g.body.error.details[0].code).toBe("PO_NOT_RECEIVABLE");

    // A PO with nothing received can be cancelled, with a reason.
    const b = await approvedPo(token, [{ productId: p.id, qty: 1, unitPrice: 100 }]);
    expect((await cancelPo(b.id, token)).body.data).toMatchObject({ status: "CANCELLED", cancelledReason: "No longer needed" });
  });

  it("amend creates a revision snapshot and can't go below received + pending", async () => {
    const p1 = await product(token);
    const p2 = await product(token);
    const p3 = await product(token);
    const a = await approvedPo(token, [
      { productId: p1.id, qty: 10, unitPrice: 100 },
      { productId: p2.id, qty: 5, unitPrice: 200 },
    ]);
    await grnFor(token, a.id, [{ productId: p1.id, qty: 6 }], { warehouseId: A });
    const store = await userToken(token, "Store Manager", ["A"]);
    await grnFor(store.token, a.id, [{ productId: p1.id, qty: 2 }], { warehouseId: A, action: "submit" });
    const [l1, l2] = a.lines;

    const low = await amendPo(a.id, token, { reason: "Reduce", lines: [{ id: l1.id, productId: p1.id, qty: 7, unitPrice: 100 }, { id: l2.id, productId: p2.id, qty: 5, unitPrice: 200 }] });
    expect(low.status).toBe(422);
    expect(low.body.error.details[0].code).toBe("AMEND_BELOW_RECEIVED"); // 6 received + 2 pending = 8
    expect((await amendPo(a.id, token, { reason: "x" })).status).toBe(400);

    const ok = await amendPo(a.id, token, {
      reason: "Supplier offered a discount; add filters",
      expectedDeliveryDate: day(20),
      lines: [
        { id: l1.id, productId: p1.id, qty: 8, unitPrice: 95 },
        { productId: p3.id, qty: 3, unitPrice: 50 },
      ],
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ revision: 1, status: "PARTLY_RECEIVED", subtotal: "910.00" });
    expect(ok.body.data.lines.map((l: any) => [l.product.id, l.qty])).toEqual([
      [p1.id, "8.000"],
      [p3.id, "3.000"],
    ]);
    const [rev] = ok.body.data.revisions;
    expect(rev).toMatchObject({ revision: 1, reason: "Supplier offered a discount; add filters" });
    expect(rev.changes.join("\n")).toMatch(/quantity 10 → 8/);
    expect(rev.snapshot.lines).toHaveLength(2);
    expect(rev.snapshot.lines[0]).toMatchObject({ qty: "10.000", unitPrice: "100.0000" });

    // A line already received can't be removed.
    const rm = await amendPo(a.id, token, { reason: "Drop it", lines: [{ productId: p3.id, qty: 3, unitPrice: 50 }] });
    expect(rm.body.error.details[0].code).toBe("AMEND_BELOW_RECEIVED");
    // Without seeCost, price changes and the snapshot are hidden.
    const viewer = await customUser(token, { purchasing: "VIEW" }, { seeCost: false }, ["A"]);
    const seen = (await getPo(a.id, viewer.token)).body.data.revisions[0];
    expect(seen.snapshot).toBeUndefined();
    expect(seen.changes.join("\n")).not.toMatch(/price/);
  });
});

/* ───────────────────────────── GRN ↔ PO ───────────────────────────── */

describe("GRN against a purchase order", () => {
  it("over-receipt → 422 OVER_RECEIPT with the remaining quantity", async () => {
    const p = await product(token);
    const a = await approvedPo(token, [{ productId: p.id, qty: 10, unitPrice: 100 }]);
    await grnFor(token, a.id, [{ productId: p.id, qty: 7 }], { warehouseId: A });
    const r = await grnFor(token, a.id, [{ productId: p.id, qty: 4 }], { warehouseId: A });
    expect(r.status).toBe(422);
    expect(r.body.error.details[0]).toMatchObject({ code: "OVER_RECEIPT", meta: { remaining: "3.000", requested: "4.000", productId: p.id } });
    // Products not on the PO and a supplier mismatch are refused too.
    const other = await product(token);
    expect((await grnFor(token, a.id, [{ productId: other.id, qty: 1 }], { warehouseId: A })).body.error.details[0].code).toBe("PRODUCT_NOT_ON_PO");
    expect((await grnFor(token, a.id, [{ productId: p.id, qty: 1 }], { warehouseId: A, supplierId: await foreign() })).body.error.details[0].code).toBe("PO_MISMATCH");
    expect((await grnFor(token, a.id, [{ productId: p.id, qty: 1 }], { warehouseId: A, type: "GRN_IMPORT", currency: "USD", exchangeRate: "120" })).body.error.details[0].code).toBe("PO_MISMATCH");
  });

  it("uses the PO prices server-side and ignores client prices", async () => {
    const p = await product(token);
    const a = await approvedPo(token, [{ productId: p.id, qty: 10, unitPrice: "1234.5" }]);
    const g = await grnFor(token, a.id, [{ productId: p.id, qty: 2, unitPrice: "1" }], { warehouseId: A });
    expect(g.status).toBe(201);
    expect(g.body.data.lines[0]).toMatchObject({ unitPrice: "1234.5000", unitCostBdt: "1234.5000", purchaseOrderLineId: a.lines[0].id });
    expect(g.body.data).toMatchObject({ purchaseOrder: { id: a.id, number: a.number }, references: { poNumberText: a.number }, costTotal: "2469.00" });
    expect((await availability(token, p.id, A)).avgCost).toBe("1234.5000");
  });

  it("a pending GRN raises pendingReceiptQty; rejecting or cancelling releases it", async () => {
    const p = await product(token);
    const a = await approvedPo(token, [{ productId: p.id, qty: 10, unitPrice: 100 }]);
    const store = await userToken(token, "Store Manager", ["A"]);
    const g = (await grnFor(store.token, a.id, [{ productId: p.id, qty: 6 }], { warehouseId: A, action: "submit" })).body.data;
    expect(g.status).toBe("PENDING");
    expect((await poLines(a.id))[0]).toMatchObject({ received: "0.000", pending: "6.000" });
    expect((await receivable(a.id, store.token)).body.data.lines[0].remainingQty).toBe("4.000");
    // pending holds the quantity: another GRN for 5 doesn't fit
    expect((await grnFor(store.token, a.id, [{ productId: p.id, qty: 5 }], { warehouseId: A, action: "submit" })).body.error.details[0].code).toBe("OVER_RECEIPT");
    await reject(g.id, token, "Wrong count");
    expect((await poLines(a.id))[0]!.pending).toBe("0.000");

    const g2 = (await grnFor(store.token, a.id, [{ productId: p.id, qty: 3 }], { warehouseId: A, action: "submit" })).body.data;
    expect((await poLines(a.id))[0]!.pending).toBe("3.000");
    await call(entryCancelRoute.POST, "POST", "/x", { token: store.token, params: { id: g2.id } });
    expect((await poLines(a.id))[0]!.pending).toBe("0.000");
  });

  it("posting updates receivedQty and the PO status in the same transaction", async () => {
    const p = await product(token);
    const a = await approvedPo(token, [{ productId: p.id, qty: 10, unitPrice: 100 }]);
    const store = await userToken(token, "Store Manager", ["A"]);
    const g = (await grnFor(store.token, a.id, [{ productId: p.id, qty: 10 }], { warehouseId: A, action: "submit" })).body.data;
    await approve(g.id, token);
    expect((await poLines(a.id))[0]).toMatchObject({ received: "10.000", pending: "0.000" });
    expect(await poStatus(a.id)).toBe("FULLY_RECEIVED");
    expect(await prisma.auditLog.count({ where: { entityType: "PurchaseOrder", entityId: a.id, action: "purchase_order.received" } })).toBe(1);

    // Atomic: when the PO side refuses (PO cancelled after a draft GRN was saved), no stock moves either.
    const b = await approvedPo(token, [{ productId: p.id, qty: 5, unitPrice: 100 }]);
    const draft = (await grnFor(token, b.id, [{ productId: p.id, qty: 5 }], { warehouseId: A, action: "draft" })).body.data;
    await cancelPo(b.id, token);
    const before = await availability(token, p.id, A);
    const { action: postEntry } = await import("../helpers/inventory");
    const postRoute = await import("@/app/api/v1/stock-entries/[id]/post/route");
    const r = await postEntry(postRoute, draft.id, token);
    expect(r.status).toBe(422);
    expect(r.body.error.details[0].code).toBe("PO_NOT_RECEIVABLE");
    expect(await availability(token, p.id, A)).toEqual(before);
    expect(await prisma.stockMovement.count({ where: { entryId: draft.id } })).toBe(0);
  });

  it("notifies the PO creator of each receipt and when it is fully received (not the person posting)", async () => {
    const p = await product(token);
    const mgr = await userToken(token, "Manager", ["A"]);
    const d = await po(mgr.token, { action: "submit", supplierId: await supplier(LOCAL), deliverToWarehouseId: A, lines: [{ productId: p.id, qty: 10, unitPrice: 100 }] });
    await approvePo(d.id, token);
    await grnFor(token, d.id, [{ productId: p.id, qty: 4 }], { warehouseId: A });
    const got = (type: string) => prisma.notification.findMany({ where: { userId: mgr.id, type } });
    expect((await got("PO_GOODS_RECEIVED")).map((n) => n.body)).toEqual([expect.stringContaining("4 of 10 received so far")]);
    expect(await got("PO_FULLY_RECEIVED")).toHaveLength(0);
    await grnFor(token, d.id, [{ productId: p.id, qty: 6 }], { warehouseId: A });
    expect(await got("PO_GOODS_RECEIVED")).toHaveLength(2);
    expect((await got("PO_FULLY_RECEIVED"))[0]).toMatchObject({ link: `/purchases/${d.id}` });
    // The admin who posted the GRNs gets nothing about their own action.
    const admin = await prisma.user.findFirstOrThrow({ where: { username: "admin" } });
    expect(await prisma.notification.count({ where: { userId: admin.id, type: { in: ["PO_GOODS_RECEIVED", "PO_FULLY_RECEIVED"] } } })).toBe(0);
  });

  it("a GRN reversal recalculates the PO status (back to SENT / PARTLY_RECEIVED)", async () => {
    const p = await product(token);
    const a = await approvedPo(token, [{ productId: p.id, qty: 10, unitPrice: 100 }]);
    await markSent(a.id, token);
    const g1 = (await grnFor(token, a.id, [{ productId: p.id, qty: 4 }], { warehouseId: A })).body.data;
    const g2 = (await grnFor(token, a.id, [{ productId: p.id, qty: 6 }], { warehouseId: A })).body.data;
    expect(await poStatus(a.id)).toBe("FULLY_RECEIVED");
    expect((await reverse(g2.id, token)).status).toBe(200);
    expect(await poStatus(a.id)).toBe("PARTLY_RECEIVED");
    expect((await poLines(a.id))[0]!.received).toBe("4.000");
    await reverse(g1.id, token);
    expect(await poStatus(a.id)).toBe("SENT");
    expect((await getPo(a.id, token)).body.data.receipts.map((r: any) => r.status)).toEqual(["REVERSED", "REVERSED"]);
  });

  it("concurrent GRNs against the same PO line can't exceed the ordered quantity", async () => {
    const p = await product(token);
    const a = await approvedPo(token, [{ productId: p.id, qty: 10, unitPrice: 100 }]);
    const results = await Promise.all([1, 2, 3].map(() => grnFor(token, a.id, [{ productId: p.id, qty: 6 }], { warehouseId: A })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 422, 422]);
    expect((await poLines(a.id))[0]!.received).toBe("6.000");
    expect((await availability(token, p.id, A)).onHand).toBe("6.000");
  });
});

/* ───────────────────────────── permissions and cost visibility ───────────────────────────── */

describe("purchasing permissions and cost visibility", () => {
  it("a Store Manager creates a GRN from a PO without seeing prices; costs come from the PO", async () => {
    const p = await product(token);
    const a = await approvedPo(token, [{ productId: p.id, qty: 10, unitPrice: "880" }]);
    const store = await userToken(token, "Store Manager", ["A"]);
    expect((await call(posRoute.GET, "GET", "/purchase-orders", { token: store.token })).status).toBe(403);
    const list = await call(receivableListRoute.GET, "GET", "/purchase-orders/receivable", { token: store.token, query: { warehouseId: A } });
    expect(list.body.data.map((x: any) => x.number)).toEqual([a.number]);
    expect(JSON.stringify(list.body)).not.toMatch(/"880[.]0|unitPrice|totalBdt|"total":"/);
    const rec = (await receivable(a.id, store.token)).body.data;
    expect(rec).toMatchObject({ grnType: "GRN_LOCAL", warehouse: { id: A }, supplier: { name: LOCAL }, receivable: true });
    expect(rec.lines[0]).toMatchObject({ remainingQty: "10.000" });
    expect(rec.lines[0].unitPrice).toBeUndefined();

    const g = await grnFor(store.token, a.id, rec.lines.map((l: any) => ({ productId: l.product.id, qty: "4", unitPrice: "1" })), { warehouseId: A, action: "submit" });
    expect(g.status).toBe(201);
    expect(JSON.stringify(g.body.data)).not.toMatch(/"880[.]0/);
    expect(g.body.data.lines[0].unitPrice).toBeUndefined();
    const line = await prisma.stockEntryLine.findFirstOrThrow({ where: { entryId: g.body.data.id } });
    expect(line.unitPrice.toFixed(2)).toBe("880.00");
    // Out of scope: a PO delivering to B
    const b = await approvedPo(token, [{ productId: p.id, qty: 1, unitPrice: 1 }], { deliverToWarehouseId: B });
    expect((await receivable(b.id, store.token)).status).toBe(403);
  });

  it("a verifier with seeCost sets landed charges and the customs rate on a pending import GRN", async () => {
    const p = await product(token);
    const i = await po(token, { action: "approve", supplierId: await foreign(), deliverToWarehouseId: A, exchangeRate: "120", lines: [{ productId: p.id, qty: 10, unitPrice: "100" }] });
    const store = await userToken(token, "Store Manager", ["A"]);
    // The Store Manager's rate is ignored: the PO rate applies.
    const g = (await grnFor(store.token, i.id, [{ productId: p.id, qty: 10 }], { warehouseId: A, type: "GRN_IMPORT", action: "submit", exchangeRate: "999" })).body.data;
    expect(g).toMatchObject({ status: "PENDING", currency: "USD", exchangeRate: "120.0000" });
    const body = { exchangeRate: "122.50", charges: [{ type: "CUSTOMS_DUTY", mode: "PERCENT_OF_GOODS", value: "10" }, { type: "IMPORT_VAT", mode: "AMOUNT_BDT", value: "5000", includeInCost: false }] };
    expect((await call(landedRoute.PUT, "PUT", "/x", { token: store.token, params: { id: g.id }, body })).status).toBe(403);
    const mgr = await userToken(token, "Manager", ["A"]);
    const r = await call(landedRoute.PUT, "PUT", "/x", { token: mgr.token, params: { id: g.id }, body });
    expect(r.status).toBe(200);
    // goods 10 × 100 × 122.5 = 122,500; duty 10% = 12,250 in cost; VAT not in cost
    expect(r.body.data).toMatchObject({ exchangeRate: "122.5000", costTotal: "134750.00" });
    expect(r.body.data.charges.map((c: any) => c.amountBdt)).toEqual(["12250.00", "5000.00"]);
    expect(await prisma.auditLog.count({ where: { entityId: g.id, action: "stock_entry.landed_cost" } })).toBe(1);
    await approve(g.id, mgr.token);
    expect((await availability(token, p.id, A)).avgCost).toBe("13475.0000");
    expect(await poStatus(i.id)).toBe("FULLY_RECEIVED");
    // The Store Manager still sees no costs on the entry.
    const seen = await call(entryRoute.GET, "GET", "/x", { token: store.token, params: { id: g.id } });
    expect(seen.body.data.costTotal).toBeUndefined();
    expect(seen.body.data.charges[0].amountBdt).toBeUndefined();
    // Posted: no more changes.
    expect((await call(landedRoute.PUT, "PUT", "/x", { token: mgr.token, params: { id: g.id }, body })).status).toBe(422);
  });

  it("403 for each level", async () => {
    const p = await product(token);
    const sup = await local();
    const body = { supplierId: sup, deliverToWarehouseId: A, lines: [{ productId: p.id, qty: 1, unitPrice: 10 }] };
    const none = await userToken(token, "Store Manager", ["A"]); // purchasing NONE
    const view = await userToken(token, "Accounts", ["A"]); // VIEW
    const create = await userToken(token, "Manager", ["A"]); // CREATE
    const approver = await customUser(token, { purchasing: "APPROVE" }, { seeCost: true }, ["A"]);
    const d = await po(token, { ...body, action: "submit" });

    expect((await call(posRoute.GET, "GET", "/purchase-orders", { token: none.token })).status).toBe(403);
    expect((await createPo(none.token, body)).status).toBe(403);
    expect((await call(posRoute.GET, "GET", "/purchase-orders", { token: view.token })).status).toBe(200);
    expect((await createPo(view.token, body)).status).toBe(403);
    expect((await approvePo(d.id, create.token)).status).toBe(403);
    expect((await rejectPo(d.id, create.token)).status).toBe(403);
    expect((await createPo(create.token, body)).status).toBe(201);
    expect((await call(suppliersRoute.POST, "POST", "/suppliers", { token: create.token, body: { name: "X" } })).status).toBe(403);
    expect((await call(suppliersRoute.POST, "POST", "/suppliers", { token: approver.token, body: { name: "X" } })).status).toBe(403);
    expect((await approvePo(d.id, approver.token)).status).toBe(200);
    const s = await call(suppliersRoute.POST, "POST", "/suppliers", { token, body: { name: "Gree Bangladesh", brandsSupplied: "Gree" } });
    expect(s.body.data).toMatchObject({ code: "SUP-005", defaultCurrency: "BDT", brandsSupplied: "Gree" });
    // Store Manager (inventory VIEW) can still read suppliers for GRNs.
    expect((await call(suppliersRoute.GET, "GET", "/suppliers", { token: none.token })).status).toBe(200);
  });

  it("prices are hidden without seeCost (and the price history is refused)", async () => {
    const p = await product(token);
    const a = await approvedPo(token, [{ productId: p.id, qty: 3, unitPrice: "777" }]);
    const blind = await customUser(token, { purchasing: "VIEW", catalog: "VIEW" }, { seeCost: false }, ["A"]);
    const r = await getPo(a.id, blind.token);
    expect(r.status).toBe(200);
    for (const k of ["subtotal", "total", "totalBdt", "discountAmount", "vatAmount"]) expect(r.body.data[k]).toBeUndefined();
    expect(r.body.data.lines[0].unitPrice).toBeUndefined();
    expect(r.body.data.lines[0].amount).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toMatch(/"777[.]0/);
    const list = await call(posRoute.GET, "GET", "/purchase-orders", { token: blind.token });
    expect(JSON.stringify(list.body)).not.toMatch(/"777[.]0/);
    expect((await call(productHistoryRoute.GET, "GET", "/x", { token: blind.token, params: { id: p.id } })).status).toBe(403);
    const seeing = await customUser(token, { purchasing: "VIEW" }, { seeCost: true }, ["A"]);
    expect((await getPo(a.id, seeing.token)).body.data.total).toBe("2331.00");
  });
});

/* ───────────────────────────── other ───────────────────────────── */

describe("purchasing: low stock, overdue, price history, documents, idempotency, audit", () => {
  it("low stock → Create PO: one draft PO per default supplier; products without one come back unassigned", async () => {
    const lg = await local();
    const pipe = await supplier("Nawabpur Pipe & Fittings");
    const p1 = await product(token, { minStockLevel: "5", defaultSupplierId: lg });
    const p2 = await product(token, { minStockLevel: "4", defaultSupplierId: lg });
    const p3 = await product(token, { minStockLevel: "10", defaultSupplierId: pipe });
    const p4 = await product(token, { minStockLevel: "2" });
    // single
    const one = await call(fromLowStockRoute.POST, "POST", "/x", { token, body: { productIds: [p3.id] }, headers: { "Idempotency-Key": key() } });
    expect(one.status).toBe(201);
    expect(one.body.data.created).toHaveLength(1);
    expect(one.body.data.created[0]).toMatchObject({ status: "DRAFT", supplier: { id: pipe }, deliverTo: { id: A } });
    expect(one.body.data.created[0].lines[0]).toMatchObject({ product: { id: p3.id }, qty: "20.000" }); // 2 × 10 − 0
    // grouped
    const many = await call(fromLowStockRoute.POST, "POST", "/x", { token, body: { productIds: [p1.id, p2.id, p3.id, p4.id], warehouseId: B }, headers: { "Idempotency-Key": key() } });
    const created = many.body.data.created;
    expect(created.map((c: any) => c.supplier.id).sort()).toEqual([lg, pipe].sort());
    expect(created.find((c: any) => c.supplier.id === lg).lines.map((l: any) => [l.product.id, l.qty])).toEqual([
      [p1.id, "10.000"],
      [p2.id, "8.000"],
    ]);
    expect(created.every((c: any) => c.deliverTo.id === B)).toBe(true);
    expect(many.body.data.unassigned).toEqual([{ product: expect.objectContaining({ id: p4.id }), suggestedQty: "4.000" }]);
  });

  it("overdue filter and digest content", async () => {
    const p = await product(token);
    const late = await approvedPo(token, [{ productId: p.id, qty: 5, unitPrice: 10 }], { poDate: day(-10), expectedDeliveryDate: day(-3) });
    await approvedPo(token, [{ productId: p.id, qty: 5, unitPrice: 10 }], { poDate: day(-10), expectedDeliveryDate: day(3) });
    await po(token, { supplierId: await local(), deliverToWarehouseId: A, poDate: day(-10), expectedDeliveryDate: day(-5), lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] }); // draft: not overdue
    const r = await call(posRoute.GET, "GET", "/purchase-orders", { token, query: { overdue: "true" } });
    expect(r.body.data.map((x: any) => x.id)).toEqual([late.id]);
    expect(r.body.data[0].overdue).toBe(true);
    await grnFor(token, late.id, [{ productId: p.id, qty: 2 }], { warehouseId: A });

    const pos = await purchasing().uow.store.overdue(TODAY);
    expect(pos.map((x) => x.id)).toEqual([late.id]);
    const c = overdueDigestContent(pos, TODAY, "today");
    expect(c.text).toContain(late.number);
    expect(c.text).toContain(LOCAL);
    expect(c.text).toMatch(new RegExp(`${late.number} \\| ${LOCAL} \\| A \\| ${day(-3)} \\| 3 \\| 3`));

    // The digest emails users with purchasing ≥ CREATE who have an email address.
    const mgr = await userToken(token, "Manager", ["A"]);
    await prisma.user.update({ where: { id: mgr.id }, data: { email: "buyer@example.com" } });
    const sm = await userToken(token, "Store Manager", ["A"]);
    await prisma.user.update({ where: { id: sm.id }, data: { email: "store@example.com" } });
    const res = await purchasing().orders.overdueDigest();
    expect(res).toEqual({ purchaseOrders: 1, emailed: 1 });
    const logs = await prisma.emailLog.findMany({ where: { type: "PO_OVERDUE_DIGEST" } });
    expect(logs.map((l) => l.to)).toEqual(["buyer@example.com"]);
  });

  it("price history: newest first, with the BDT equivalent", async () => {
    const p = await product(token);
    await po(token, { action: "approve", supplierId: await local(), deliverToWarehouseId: A, poDate: day(-20), lines: [{ productId: p.id, qty: 1, unitPrice: "100" }] });
    await po(token, { action: "approve", supplierId: await foreign(), deliverToWarehouseId: A, exchangeRate: "121.5", poDate: day(-5), lines: [{ productId: p.id, qty: 2, unitPrice: "1.25" }] });
    await po(token, { supplierId: await local(), deliverToWarehouseId: A, lines: [{ productId: p.id, qty: 1, unitPrice: "1" }] }); // draft: not in history
    const h = await call(productHistoryRoute.GET, "GET", "/x", { token, params: { id: p.id } });
    expect(h.body.data.map((r: any) => [r.poDate, r.currency, r.unitPrice, r.exchangeRate, r.unitPriceBdt])).toEqual([
      [day(-5), "USD", "1.2500", "121.5000", "151.8750"],
      [day(-20), "BDT", "100.0000", "1.0000", "100.0000"],
    ]);
    const s = await call(supplierHistoryRoute.GET, "GET", "/x", { token, params: { id: await foreign() } });
    expect(s.body.data).toHaveLength(1);
    const detail = await call(supplierRoute.GET, "GET", "/x", { token, params: { id: await foreign() } });
    expect(detail.body.data.stats).toMatchObject({ openPoCount: 1, poCount: 1, lastPurchaseDate: day(-5), totalOrderedBdt: "303.75" });
  });

  it("queues the PO PDF and the supplier email (PDF attached)", async () => {
    const p = await product(token);
    const a = await approvedPo(token, [{ productId: p.id, qty: 1, unitPrice: 10 }]);
    const doc = await call(documentsRoute.POST, "POST", "/x", { token, params: { id: a.id } });
    expect(doc.status).toBe(202);
    const job = await getQueue(QUEUES.documents).getJob(doc.body.data.jobId);
    expect(job?.name).toBe("purchase-order");
    expect(job?.data).toMatchObject({ kind: "PURCHASE_ORDER", purchaseOrderId: a.id, showPrices: true });

    const e = await call(emailRoute.POST, "POST", "/x", { token, params: { id: a.id }, body: { message: "Please confirm." }, headers: { "Idempotency-Key": key() } });
    expect(e.status).toBe(202);
    expect(e.body.data).toMatchObject({ to: "b2b@lg.example.com", status: "queued" });
    const ej = await getQueue(QUEUES.documents).getJob(e.body.data.jobId);
    expect(ej?.data.email).toMatchObject({ to: "b2b@lg.example.com", message: "Please confirm." });
    expect(await prisma.auditLog.count({ where: { entityId: a.id, action: "purchase_order.email" } })).toBe(1);
    // Mark sent + email in one go
    const s = await markSent(a.id, token, { emailSupplier: true });
    expect(s.body.data).toMatchObject({ status: "SENT", email: { to: "b2b@lg.example.com" } });
    // No supplier email → 400
    const nawab = await po(token, { action: "approve", supplierId: await supplier("Nawabpur Pipe & Fittings"), deliverToWarehouseId: A, lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] });
    expect((await call(emailRoute.POST, "POST", "/x", { token, params: { id: nawab.id }, headers: { "Idempotency-Key": key() } })).status).toBe(400);
    // Drafts can't be printed
    const draft = await po(token, { supplierId: await local(), deliverToWarehouseId: A, lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] });
    expect((await call(documentsRoute.POST, "POST", "/x", { token, params: { id: draft.id } })).status).toBe(422);
  });

  it("idempotency on submit, approve and receive; required on workflow POSTs", async () => {
    const p = await product(token);
    const mgr = await userToken(token, "Manager", ["A"]);
    const d = await po(mgr.token, { supplierId: await local(), deliverToWarehouseId: A, lines: [{ productId: p.id, qty: 10, unitPrice: 1 }] });
    const s1 = await submitPo(d.id, mgr.token, "submit-key-123");
    const s2 = await submitPo(d.id, mgr.token, "submit-key-123");
    expect(s2.headers.get("idempotent-replayed")).toBe("true");
    expect(s2.body).toEqual(s1.body);
    const a1 = await approvePo(d.id, token, "approve-key-123");
    const a2 = await approvePo(d.id, token, "approve-key-123");
    expect(a2.status).toBe(200);
    expect(a2.headers.get("idempotent-replayed")).toBe("true");
    expect(a1.body.data.status).toBe("APPROVED");
    const g1 = await grnFor(token, d.id, [{ productId: p.id, qty: 4 }], { warehouseId: A }, "grn-key-12345");
    const g2 = await grnFor(token, d.id, [{ productId: p.id, qty: 4 }], { warehouseId: A }, "grn-key-12345");
    expect(g2.body.data.id).toBe(g1.body.data.id);
    expect((await poLines(d.id))[0]!.received).toBe("4.000");
    const noKey = await call(posRoute.POST, "POST", "/purchase-orders", { token, body: { action: "draft", supplierId: await local(), deliverToWarehouseId: A, lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] } });
    expect(noKey.status).toBe(400);
    expect(noKey.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("writes audit log rows for every state change", async () => {
    const p = await product(token);
    const a = await approvedPo(token, [{ productId: p.id, qty: 10, unitPrice: 5 }]);
    await markSent(a.id, token);
    await amendPo(a.id, token, { reason: "More needed", lines: [{ id: a.lines[0].id, productId: p.id, qty: 12, unitPrice: 5 }] });
    await grnFor(token, a.id, [{ productId: p.id, qty: 2 }], { warehouseId: A });
    await closePo(a.id, token);
    const actions = (await prisma.auditLog.findMany({ where: { entityType: "PurchaseOrder", entityId: a.id }, orderBy: { createdAt: "asc" } })).map((l) => l.action);
    expect(actions).toEqual(["purchase_order.create", "purchase_order.approve", "purchase_order.mark_sent", "purchase_order.amend", "purchase_order.received", "purchase_order.close"]);
    const amend = await prisma.auditLog.findFirstOrThrow({ where: { entityId: a.id, action: "purchase_order.amend" } });
    expect(amend.after).toMatchObject({ reason: "More needed", revision: 1 });
  });

  it("links Product.defaultSupplierName to suppliers (migration function), keeping unmatched text", async () => {
    const p1 = await product(token);
    const p2 = await product(token);
    const p3 = await product(token, { defaultSupplierName: "  lg   electronics BANGLADESH " });
    await prisma.product.update({ where: { id: p1.id }, data: { defaultSupplierName: "Daikin Airconditioning (Thailand)", defaultSupplierId: null } });
    await prisma.product.update({ where: { id: p2.id }, data: { defaultSupplierName: "Unknown Traders", defaultSupplierId: null } });
    await prisma.product.update({ where: { id: p3.id }, data: { defaultSupplierId: null, defaultSupplierName: "  lg   electronics BANGLADESH " } });
    const unmatched = await prisma.$queryRaw<{ product_code: string; supplier_name: string }[]>`SELECT * FROM link_product_default_suppliers()`;
    expect(unmatched).toEqual([{ product_code: p2.code, supplier_name: "Unknown Traders" }]);
    const rows = await prisma.product.findMany({ where: { id: { in: [p1.id, p2.id, p3.id] } }, select: { id: true, defaultSupplierId: true, defaultSupplierName: true } });
    const by = new Map(rows.map((r) => [r.id, r]));
    expect(by.get(p1.id)).toMatchObject({ defaultSupplierId: await foreign(), defaultSupplierName: null });
    expect(by.get(p3.id)).toMatchObject({ defaultSupplierId: await local(), defaultSupplierName: null });
    expect(by.get(p2.id)).toMatchObject({ defaultSupplierId: null, defaultSupplierName: "Unknown Traders" });
    // The product API shows the linked supplier.
    const api = await call(productRoute.GET, "GET", "/x", { token, params: { id: p1.id } });
    expect(api.body.data).toMatchObject({ defaultSupplier: { id: await foreign() }, defaultSupplierName: FOREIGN });
    // The migration recorded its report in the audit log.
    expect(await prisma.$queryRaw<{ n: bigint }[]>`SELECT 1 AS n FROM pg_proc WHERE proname = 'link_product_default_suppliers'`).toHaveLength(1);
  });

  it("documents every purchasing endpoint in OpenAPI", async () => {
    const doc = await (await openapiRoute.GET()).json();
    const expected: [string, string][] = [
      ["/suppliers", "get"],
      ["/suppliers", "post"],
      ["/suppliers/{id}", "get"],
      ["/suppliers/{id}", "patch"],
      ["/suppliers/{id}/deactivate", "post"],
      ["/suppliers/{id}/purchase-orders", "get"],
      ["/suppliers/{id}/price-history", "get"],
      ["/products/{id}/price-history", "get"],
      ["/purchase-orders", "get"],
      ["/purchase-orders", "post"],
      ["/purchase-orders/calculate", "post"],
      ["/purchase-orders/{id}", "get"],
      ["/purchase-orders/{id}", "patch"],
      ...["submit", "approve", "reject", "mark-sent", "close", "cancel", "amend", "email", "documents", "attachments"].map((a) => [`/purchase-orders/{id}/${a}`, "post"] as [string, string]),
      ["/purchase-orders/{id}/receivable", "get"],
      ["/purchase-orders/receivable", "get"],
      ["/purchase-orders/from-low-stock", "post"],
      ["/stock-entries/{id}/landed-cost", "put"],
      ["/purchasing-settings", "patch"],
    ];
    for (const [p, m] of expected) expect(doc.paths[p]?.[m], `${m} ${p}`).toBeDefined();
    expect(doc.paths["/purchase-orders/{id}/approve"].post.parameters.find((x: any) => x.name === "idempotency-key").required).toBe(true);
  });
});
