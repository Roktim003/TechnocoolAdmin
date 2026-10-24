import type { EntryRecord, ReceiptEvent, ReceiptListener } from "./ports";

/*
 * The registered ReceiptListener (purchasing registers it at startup: instrumentation, worker,
 * tests). Kept on globalThis so every bundle of the server process sees the same registration.
 */
const g = globalThis as unknown as { __stockbookReceiptListener?: ReceiptListener | null };

export function registerReceiptListener(listener: ReceiptListener | null): void {
  g.__stockbookReceiptListener = listener;
}

/** The registered listener; throws when a GRN refers to a PO but purchasing isn't wired in. */
export function receiptListener(): ReceiptListener {
  const l = g.__stockbookReceiptListener;
  if (!l) throw new Error("No ReceiptListener is registered: call wireModules() at startup before receiving against purchase orders.");
  return l;
}

/** The PO quantities of a GRN (lines linked to PO lines only). */
export function receiptEvent(e: EntryRecord, actorId: string): ReceiptEvent | null {
  if (!e.purchaseOrder) return null;
  return {
    entryId: e.id,
    entryNumber: e.number,
    purchaseOrderId: e.purchaseOrder.id,
    actorId,
    lines: e.lines.filter((l) => l.purchaseOrderLineId).map((l) => ({ purchaseOrderLineId: l.purchaseOrderLineId!, productId: l.productId, productCode: l.product.code, qty: l.qty })),
  };
}
