import { NotFoundError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger/logger";
import { d, type Dec } from "@/modules/inventory/domain/decimal";
import { InventoryErrors } from "@/modules/inventory/domain/errors";
import type { ReceiptEvent, ReceiptListener, ReceiptTerms } from "@/modules/inventory/application/ports";
import { PurchasingErrors } from "../domain/errors";
import { remainingQty, statusAfterReceipts } from "../domain/rules";
import { grnTypeFor, RECEIVABLE } from "../domain/types";
import { noNotifier, type PoRecord, type PurchasingNotifier, type PurchasingStore } from "./ports";

const log = logger.child({ component: "po-receipts" });

/** Quantities of a receipt per PO line. */
function perLine(r: ReceiptEvent): Map<string, { qty: Dec; code: string }> {
  const m = new Map<string, { qty: Dec; code: string }>();
  for (const l of r.lines) m.set(l.purchaseOrderLineId, { qty: (m.get(l.purchaseOrderLineId)?.qty ?? d(0)).plus(d(l.qty)), code: l.productCode });
  return m;
}

/**
 * Purchasing's side of GRNs (registered with inventory at startup). Every method except
 * `committed` runs inside the stock transaction: it builds a purchasing store on the same
 * transaction, locks the PO and its lines (FOR UPDATE), so concurrent GRNs against the same
 * line are serialised and can never receive more than was ordered.
 */
export class PurchaseReceiptListener implements ReceiptListener {
  constructor(
    private readonly d: {
      storeFor: (db: unknown) => PurchasingStore;
      /** Store outside any transaction (after-commit reads). */
      store: () => PurchasingStore;
      notifier?: PurchasingNotifier;
    },
  ) {}

  async lock(db: unknown, purchaseOrderId: string): Promise<void> {
    await this.d.storeFor(db).lockPo(purchaseOrderId);
  }

  /**
   * Locked read: a new GRN inserts lines that reference the PO lines (FK share locks), so the
   * PO must be locked before that, or two concurrent GRNs deadlock on `posted`'s FOR UPDATE.
   */
  async terms(db: unknown, purchaseOrderId: string): Promise<ReceiptTerms> {
    const po = await this.d.storeFor(db).lockPo(purchaseOrderId);
    if (!po) throw new NotFoundError("Purchase order");
    if (!RECEIVABLE.includes(po.status)) throw PurchasingErrors.notReceivable(po.number ?? po.draftRef, po.status);
    return {
      purchaseOrderId: po.id,
      number: po.number!,
      grnType: grnTypeFor(po.type),
      supplierId: po.supplier.id,
      deliverToWarehouseId: po.deliverTo.id,
      currency: po.currency,
      exchangeRate: po.exchangeRate,
      lines: po.lines.map((l) => ({ purchaseOrderLineId: l.id, productId: l.productId, unitPrice: l.unitPrice, remaining: remainingQty(l).toFixed(3) })),
    };
  }

  private async lockFor(db: unknown, r: ReceiptEvent) {
    const store = this.d.storeFor(db);
    const po = await store.lockPo(r.purchaseOrderId);
    if (!po) throw new NotFoundError("Purchase order");
    const want = perLine(r);
    for (const id of want.keys()) if (!po.lines.some((l) => l.id === id)) throw PurchasingErrors.receiptMismatch("A GRN line refers to a line of a different purchase order.");
    return { store, po, want };
  }

  /** Over-receipt check against the locked line: remaining = ordered − received − pending. */
  private assertRoom(po: PoRecord, want: Map<string, { qty: Dec; code: string }>) {
    if (!RECEIVABLE.includes(po.status)) throw PurchasingErrors.notReceivable(po.number ?? po.draftRef, po.status);
    for (const l of po.lines) {
      const w = want.get(l.id);
      if (w && w.qty.gt(remainingQty(l))) throw InventoryErrors.overReceipt(l.product.code, l.productId, remainingQty(l).toFixed(3), w.qty.toFixed(3), po.number ?? po.draftRef);
    }
  }

  async pending(db: unknown, r: ReceiptEvent): Promise<void> {
    const { store, po, want } = await this.lockFor(db, r);
    this.assertRoom(po, want);
    for (const l of po.lines) {
      const w = want.get(l.id);
      if (w) await store.updateLineQty(l.id, { pendingReceiptQty: d(l.pendingReceiptQty).plus(w.qty).toFixed(3) });
    }
  }

  async released(db: unknown, r: ReceiptEvent): Promise<void> {
    const { store, po, want } = await this.lockFor(db, r);
    for (const l of po.lines) {
      const w = want.get(l.id);
      if (!w) continue;
      const left = d(l.pendingReceiptQty).minus(w.qty);
      await store.updateLineQty(l.id, { pendingReceiptQty: (left.lt(0) ? d(0) : left).toFixed(3) });
    }
  }

  async posted(db: unknown, r: ReceiptEvent, opts: { fromPending: boolean }): Promise<void> {
    const { store, po, want } = await this.lockFor(db, r);
    // A pending GRN already holds its quantities; a direct post must still fit.
    if (!opts.fromPending) this.assertRoom(po, want);
    else if (!RECEIVABLE.includes(po.status)) throw PurchasingErrors.notReceivable(po.number ?? po.draftRef, po.status);
    const lines = po.lines.map((l) => {
      const w = want.get(l.id);
      if (!w) return l;
      const pending = opts.fromPending ? d(l.pendingReceiptQty).minus(w.qty) : d(l.pendingReceiptQty);
      if (pending.lt(0)) throw PurchasingErrors.receiptMismatch(`The pending quantity of ${l.product.code} on ${po.number} doesn't match this GRN.`);
      return { ...l, receivedQty: d(l.receivedQty).plus(w.qty).toFixed(3), pendingReceiptQty: pending.toFixed(3) };
    });
    for (const l of lines) if (want.has(l.id)) await store.updateLineQty(l.id, { receivedQty: l.receivedQty, pendingReceiptQty: l.pendingReceiptQty });
    await this.recalc(store, po, lines, r, "purchase_order.received");
  }

  async reversed(db: unknown, r: ReceiptEvent): Promise<void> {
    const { store, po, want } = await this.lockFor(db, r);
    const lines = po.lines.map((l) => {
      const w = want.get(l.id);
      if (!w) return l;
      const received = d(l.receivedQty).minus(w.qty);
      if (received.lt(0)) throw PurchasingErrors.receiptMismatch(`The received quantity of ${l.product.code} on ${po.number} is less than this GRN's.`);
      return { ...l, receivedQty: received.toFixed(3) };
    });
    for (const l of lines) if (want.has(l.id)) await store.updateLineQty(l.id, { receivedQty: l.receivedQty });
    await this.recalc(store, po, lines, r, "purchase_order.receipt_reversed");
  }

  private async recalc(store: PurchasingStore, po: PoRecord, lines: { qty: string; receivedQty: string }[], r: ReceiptEvent, action: string) {
    const status = statusAfterReceipts(po.status, po.sentAt, lines);
    if (status !== po.status) await store.updatePo(po.id, { status });
    await store.audit.record(
      { actorId: r.actorId, ip: null, requestId: null },
      { action, entityType: "PurchaseOrder", entityId: po.id, before: { status: po.status }, after: { status, grn: r.entryNumber, lines: r.lines.map((l) => ({ product: l.productCode, qty: l.qty })) } },
    );
  }

  /** After commit: tell the PO creator about the receipt (and when the PO is complete). */
  async committed(event: "posted" | "reversed", r: ReceiptEvent): Promise<void> {
    if (event !== "posted") return;
    try {
      const po = await this.d.store().po(r.purchaseOrderId);
      if (!po) return;
      const n = this.d.notifier ?? noNotifier;
      await n.po("received", po, { actorId: r.actorId, receipt: { id: r.entryId, number: r.entryNumber } });
      if (po.status === "FULLY_RECEIVED") await n.po("fully_received", po, { actorId: r.actorId, receipt: { id: r.entryId, number: r.entryNumber } });
    } catch (err) {
      log.error({ err, purchaseOrderId: r.purchaseOrderId }, "receipt notification failed");
    }
  }
}
