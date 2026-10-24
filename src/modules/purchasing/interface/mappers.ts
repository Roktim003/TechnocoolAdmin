import { hasLevel } from "@/shared/rbac/levels";
import { d } from "@/modules/inventory/domain/decimal";
import { remainingQty } from "../domain/rules";
import { AMENDABLE, CANCELLABLE, EDITABLE, PO_STATUS_LABEL, RECEIVABLE } from "../domain/types";
import type { AttachmentRecord, HistoryRecord, LinkedReceipt, PoRecord, PriceHistoryRow, PurchasingActor, RevisionRecord, SupplierRecord, SupplierStats } from "../application/ports";

const iso = (v: Date | null) => (v ? v.toISOString() : null);

/* ───────────────────────────── suppliers ───────────────────────────── */

export function toSupplierDto(s: SupplierRecord) {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    type: s.type,
    defaultCurrency: s.defaultCurrency,
    /** Module 2 name of defaultCurrency (kept for existing clients). */
    currency: s.defaultCurrency,
    contactPerson: s.contactPerson,
    phone: s.phone,
    email: s.email,
    address: s.address,
    brandsSupplied: s.brandsSupplied,
    paymentTermsNote: s.paymentTermsNote,
    notes: s.notes,
    isActive: s.isActive,
    openPoCount: s.openPoCount,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** Supplier detail: open POs, last purchase date; the value summary only with seeCost. */
export function toSupplierDetailDto(s: SupplierRecord, stats: SupplierStats, viewer: PurchasingActor) {
  return {
    ...toSupplierDto(s),
    stats: {
      openPoCount: stats.openPoCount,
      poCount: stats.poCount,
      lastPurchaseDate: stats.lastPurchaseDate,
      productCount: stats.productCount,
      ...(viewer.canSeeCost ? { totalOrderedBdt: stats.totalOrderedBdt } : {}),
    },
  };
}

/* ───────────────────────────── purchase orders ───────────────────────────── */

/** What the viewer may do with the PO (the API enforces the same rules). */
export function poActions(po: PoRecord, a: PurchasingActor) {
  const inScope = a.warehouseIds.includes(po.deliverTo.id);
  const mine = po.createdBy.id === a.actorId;
  const full = hasLevel(a.level, "FULL");
  const approver = hasLevel(a.level, "APPROVE") && inScope;
  const canApproveOwn = !mine || full;
  const nothingReceived = po.lines.every((l) => d(l.receivedQty).isZero() && d(l.pendingReceiptQty).isZero());
  return {
    edit: EDITABLE.includes(po.status) && inScope && hasLevel(a.level, "CREATE") && (mine || full),
    submit: EDITABLE.includes(po.status) && inScope && hasLevel(a.level, "CREATE") && (mine || full),
    approve: ["DRAFT", "REJECTED", "PENDING_APPROVAL"].includes(po.status) && approver && canApproveOwn,
    reject: po.status === "PENDING_APPROVAL" && approver && canApproveOwn,
    markSent: po.status === "APPROVED" && approver,
    email: ["APPROVED", "SENT", "PARTLY_RECEIVED", "FULLY_RECEIVED"].includes(po.status) && approver,
    receive: RECEIVABLE.includes(po.status) && inScope && hasLevel(a.inventoryLevel, "CREATE"),
    amend: AMENDABLE.includes(po.status) && approver,
    close: po.status === "PARTLY_RECEIVED" && approver && po.lines.every((l) => d(l.pendingReceiptQty).isZero()),
    cancel: CANCELLABLE.includes(po.status) && approver && nothingReceived,
    pdf: po.status !== "DRAFT" && inScope,
    /** Pending and created by the viewer, who can't approve it themselves. */
    waitingForOtherApprover: po.status === "PENDING_APPROVAL" && mine && !(approver && full),
  };
}

function progress(po: PoRecord) {
  const ordered = po.lines.reduce((s, l) => s.plus(d(l.qty)), d(0));
  const received = po.lines.reduce((s, l) => s.plus(d(l.receivedQty)), d(0));
  const pending = po.lines.reduce((s, l) => s.plus(d(l.pendingReceiptQty)), d(0));
  return { orderedQty: ordered.toFixed(3), receivedQty: received.toFixed(3), pendingQty: pending.toFixed(3), percent: ordered.isZero() ? 0 : Math.min(100, Math.round(received.div(ordered).times(100).toNumber())) };
}

/**
 * PO DTO. PO prices are purchase costs: unit prices, amounts and totals are only included for
 * viewers with seeCost (the exchange rate and VAT % are not prices and always show).
 */
export function toPoDto(po: PoRecord, viewer: PurchasingActor, today: string) {
  const price = viewer.canSeeCost;
  return {
    id: po.id,
    number: po.number,
    draftRef: po.draftRef,
    displayNumber: po.number ?? po.draftRef,
    type: po.type,
    status: po.status,
    statusLabel: PO_STATUS_LABEL[po.status],
    revision: po.revision,
    supplier: { id: po.supplier.id, code: po.supplier.code, name: po.supplier.name, type: po.supplier.type, email: po.supplier.email, isActive: po.supplier.isActive },
    currency: po.currency,
    exchangeRate: po.exchangeRate,
    poDate: po.poDate,
    expectedDeliveryDate: po.expectedDeliveryDate,
    overdue: !!po.expectedDeliveryDate && po.expectedDeliveryDate < today && RECEIVABLE.includes(po.status),
    deliverTo: { id: po.deliverTo.id, code: po.deliverTo.code, name: po.deliverTo.name },
    project: po.project,
    supplierQuoteRef: po.supplierQuoteRef,
    vatPercent: po.vatPercent,
    ...(price ? { discountAmount: po.discountAmount, subtotal: po.subtotal, vatAmount: po.vatAmount, total: po.total, totalBdt: po.totalBdt } : {}),
    terms: po.terms,
    notes: po.notes,
    progress: progress(po),
    lines: po.lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      product: l.product,
      qty: l.qty,
      receivedQty: l.receivedQty,
      pendingReceiptQty: l.pendingReceiptQty,
      remainingQty: po.status === "CLOSED" || po.status === "CANCELLED" ? "0.000" : remainingQty(l).toFixed(3),
      ...(price ? { unitPrice: l.unitPrice, amount: l.amount } : {}),
      note: l.note,
    })),
    attachmentCount: po.attachmentCount,
    createdBy: po.createdBy,
    approvedBy: po.approvedBy,
    rejectedBy: po.rejectedBy,
    rejectionReason: po.rejectionReason,
    closedReason: po.closedReason,
    cancelledReason: po.cancelledReason,
    submittedAt: iso(po.submittedAt),
    approvedAt: iso(po.approvedAt),
    rejectedAt: iso(po.rejectedAt),
    sentAt: iso(po.sentAt),
    closedAt: iso(po.closedAt),
    cancelledAt: iso(po.cancelledAt),
    createdAt: po.createdAt.toISOString(),
    updatedAt: po.updatedAt.toISOString(),
    actions: poActions(po, viewer),
  };
}

export type PoDto = ReturnType<typeof toPoDto>;

const HISTORY_EVENT: Record<string, string> = { create: "CREATED", submit: "SUBMITTED", approve: "APPROVED", reject: "REJECTED", mark_sent: "SENT", amend: "AMENDED", close: "CLOSED", cancel: "CANCELLED" };
/** Steps logged in the same instant (create + submit + approve in one request) keep this order. */
const EVENT_RANK = ["CREATED", "SUBMITTED", "APPROVED", "SENT"];
const rank = (e: string) => (EVENT_RANK.includes(e) ? EVENT_RANK.indexOf(e) : EVENT_RANK.length);

/** Status timeline from the PO's audit history (every reject → resubmit round) and its posted GRNs. */
function timeline(history: HistoryRecord[], receipts: LinkedReceipt[]) {
  const t: { event: string; at: string; by: string | null; note?: string | null; link?: string }[] = [];
  for (const h of history) {
    const event = HISTORY_EVENT[h.action];
    if (!event) continue;
    const reason = typeof h.after?.reason === "string" ? h.after.reason : null;
    t.push({ event: event === "AMENDED" && h.after?.revision ? `AMENDED (REV ${String(h.after.revision)})` : event, at: h.at.toISOString(), by: h.by?.name ?? null, ...(reason ? { note: reason } : {}) });
  }
  for (const g of receipts) if (g.postedAt && ["POSTED", "REVERSED"].includes(g.status)) t.push({ event: "GOODS RECEIVED", at: g.postedAt.toISOString(), by: g.createdBy.name, note: g.number, link: `/stock/${g.id}` });
  return t.sort((a, b) => a.at.localeCompare(b.at) || rank(a.event) - rank(b.event));
}

export function toPoDetailDto(x: { po: PoRecord; receipts: LinkedReceipt[]; revisions: RevisionRecord[]; attachments: AttachmentRecord[]; history: HistoryRecord[]; today: string }, viewer: PurchasingActor) {
  return {
    ...toPoDto(x.po, viewer, x.today),
    receipts: x.receipts.map((r) => ({ id: r.id, number: r.number, displayNumber: r.number ?? r.draftRef, type: r.type, status: r.status, entryDate: r.entryDate, totalQty: r.totalQty, createdBy: r.createdBy })),
    revisions: x.revisions.map((r) => ({
      id: r.id,
      revision: r.revision,
      changedBy: r.changedBy,
      reason: r.reason,
      changes: r.changes.filter((c) => viewer.canSeeCost || !c.price).map((c) => c.text),
      createdAt: r.createdAt.toISOString(),
      ...(viewer.canSeeCost ? { snapshot: r.snapshot } : {}),
    })),
    attachments: x.attachments.map(toPoAttachmentDto),
    timeline: timeline(x.history, x.receipts),
  };
}

export function toPoAttachmentDto(a: AttachmentRecord) {
  return { id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size, label: a.label, uploadedBy: a.uploadedBy, createdAt: a.createdAt.toISOString(), url: `/api/v1/purchase-orders/${a.entityId}/attachments/${a.id}` };
}

/** GRN pre-fill: remaining quantities; prices only with seeCost. */
export function toReceivableDto(x: { po: PoRecord; receivable: boolean; grnType: string; lines: { line: PoRecord["lines"][number]; remaining: string }[] }, viewer: PurchasingActor) {
  return {
    purchaseOrderId: x.po.id,
    number: x.po.number,
    status: x.po.status,
    receivable: x.receivable,
    grnType: x.grnType,
    warehouse: { id: x.po.deliverTo.id, code: x.po.deliverTo.code, name: x.po.deliverTo.name },
    supplier: { id: x.po.supplier.id, code: x.po.supplier.code, name: x.po.supplier.name, type: x.po.supplier.type },
    project: x.po.project,
    currency: x.po.currency,
    exchangeRate: x.po.exchangeRate,
    lines: x.lines.map(({ line: l, remaining }) => ({
      purchaseOrderLineId: l.id,
      product: l.product,
      orderedQty: l.qty,
      receivedQty: l.receivedQty,
      pendingReceiptQty: l.pendingReceiptQty,
      remainingQty: x.receivable ? remaining : "0.000",
      ...(viewer.canSeeCost ? { unitPrice: l.unitPrice } : {}),
    })),
  };
}

/** Receivable list (GRN form): no prices at all. */
export const toReceivableSummaryDto = (po: PoRecord) => ({
  id: po.id,
  number: po.number,
  status: po.status,
  type: po.type,
  poDate: po.poDate,
  expectedDeliveryDate: po.expectedDeliveryDate,
  supplier: { id: po.supplier.id, name: po.supplier.name },
  deliverTo: { id: po.deliverTo.id, code: po.deliverTo.code },
  remainingQty: po.lines.reduce((s, l) => s.plus(remainingQty(l)), d(0)).toFixed(3),
});

export function toPriceHistoryDto(r: PriceHistoryRow) {
  return {
    poId: r.poId,
    poNumber: r.poNumber,
    poDate: r.poDate,
    status: r.status,
    supplier: r.supplier,
    product: r.product,
    currency: r.currency,
    qty: r.qty,
    unitPrice: r.unitPrice,
    exchangeRate: r.exchangeRate,
    /** unitPrice × exchangeRate (local POs: rate 1). */
    unitPriceBdt: d(r.unitPrice).times(d(r.exchangeRate)).toDecimalPlaces(4).toFixed(4),
  };
}
