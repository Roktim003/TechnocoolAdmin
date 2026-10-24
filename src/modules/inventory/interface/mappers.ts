import { hasLevel } from "@/shared/rbac/levels";
import { d, money } from "../domain/decimal";
import { CANCELLABLE, EDITABLE } from "../domain/rules";
import { ENTRY_TYPE_META, priceIsCost } from "../domain/types";
import type { AttachmentRecord, Customer, EntryRecord, InventoryActor, MovementRecord } from "../application/ports";
import type { EntryService } from "../application/entry.service";
import { lineVariance, type CountRecord, type CountService, type CountSummary } from "../application/count.service";
import type { OpeningImportRecord, OpeningWarehouse } from "../application/opening.service";

const iso = (v: Date | null) => (v ? v.toISOString() : null);

/** What the viewer may do with an entry (the API enforces the same rules). */
export function entryActions(e: EntryRecord, a: InventoryActor) {
  const inScope = a.warehouseIds.includes(e.warehouse.id);
  const mine = e.createdBy.id === a.actorId;
  const full = hasLevel(a.level, "FULL");
  const approver = hasLevel(a.level, "APPROVE") && inScope && !mine;
  return {
    edit: EDITABLE.includes(e.status) && mine && inScope,
    submit: EDITABLE.includes(e.status) && mine && inScope,
    post: EDITABLE.includes(e.status) && full && inScope,
    approve: e.status === "PENDING" && approver,
    reject: e.status === "PENDING" && approver,
    cancel: CANCELLABLE.includes(e.status) && (mine || full),
    reverse: full && inScope && e.type !== "REVERSAL" && (e.status === "POSTED" || (e.type === "TRANSFER" && e.status === "DISPATCHED")),
    receive: e.type === "TRANSFER" && e.status === "DISPATCHED" && !!e.toWarehouse && a.warehouseIds.includes(e.toWarehouse.id) && hasLevel(a.level, "CREATE"),
    /** Pending import GRN: a verifier who can see costs may set landed-cost charges and the customs rate. */
    editLandedCost: e.type === "GRN_IMPORT" && e.status === "PENDING" && inScope && hasLevel(a.level, "APPROVE") && a.canSeeCost,
    /** Pending and created by the viewer: someone else has to verify it. */
    waitingForOtherApprover: e.status === "PENDING" && mine,
  };
}

function timeline(e: EntryRecord) {
  const t: { event: string; at: string; by: string | null; note?: string | null }[] = [{ event: "CREATED", at: e.createdAt.toISOString(), by: e.createdBy.name }];
  if (e.submittedAt) t.push({ event: "SUBMITTED", at: e.submittedAt.toISOString(), by: e.createdBy.name });
  if (e.status === "REJECTED" && e.verifiedAt) t.push({ event: "REJECTED", at: e.verifiedAt.toISOString(), by: e.verifiedBy?.name ?? null, note: e.rejectionReason });
  else if (e.verifiedAt && e.verifiedBy && e.submittedAt) t.push({ event: "APPROVED", at: e.verifiedAt.toISOString(), by: e.verifiedBy.name });
  if (e.dispatchedAt) t.push({ event: "DISPATCHED", at: e.dispatchedAt.toISOString(), by: e.verifiedBy?.name ?? e.createdBy.name });
  else if (e.postedAt) t.push({ event: "POSTED", at: e.postedAt.toISOString(), by: e.verifiedBy?.name ?? e.createdBy.name });
  if (e.receivedAt) t.push({ event: "RECEIVED", at: e.receivedAt.toISOString(), by: e.receivedByUser?.name ?? null });
  if (e.cancelledAt) t.push({ event: "CANCELLED", at: e.cancelledAt.toISOString(), by: null });
  if (e.reversedAt) t.push({ event: "REVERSED", at: e.reversedAt.toISOString(), by: null, note: e.reversalReason });
  return t.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * Entry DTO. Generic field filtering (route wrapper) removes unitCostBdt, costAmount, costTotal…
 * for roles without seeCost; here we also hide prices and totals of entries priced at cost
 * (everything except sales), which share field names with selling prices.
 */
export function toEntryDto(e: EntryRecord, viewer: InventoryActor) {
  const hideCost = priceIsCost(e.type) && !viewer.canSeeCost;
  const net = d(e.subtotal).minus(d(e.discountAmount));
  const profit = e.type === "SALE" && ["POSTED", "PENDING"].includes(e.status) ? money(net.minus(d(e.costTotal))).toFixed(2) : null;
  const totalQty = e.lines.reduce((a, l) => a.plus(d(l.qty)), d(0));
  return {
    id: e.id,
    number: e.number,
    draftRef: e.draftRef,
    displayNumber: e.number ?? e.draftRef,
    type: e.type,
    typeLabel: ENTRY_TYPE_META[e.type].label,
    direction: ENTRY_TYPE_META[e.type].direction,
    status: e.status,
    entryDate: e.entryDate,
    warehouse: { id: e.warehouse.id, code: e.warehouse.code, name: e.warehouse.name },
    toWarehouse: e.toWarehouse ? { id: e.toWarehouse.id, code: e.toWarehouse.code, name: e.toWarehouse.name } : null,
    supplier: e.supplier ? { id: e.supplier.id, name: e.supplier.name } : null,
    customer: e.customer ? { id: e.customer.id, name: e.customer.name } : null,
    project: e.project ? { id: e.project.id, code: e.project.code, name: e.project.name, status: e.project.status } : null,
    originalEntry: e.originalEntry ? { id: e.originalEntry.id, number: e.originalEntry.number, type: e.originalEntry.type } : null,
    reversalOf: e.reversalOf,
    reversedBy: e.reversedBy,
    relatedEntry: e.relatedEntry,
    relatedEntries: e.relatedFrom,
    purchaseOrder: e.purchaseOrder,
    references: {
      poNumberText: e.poNumberText,
      supplierInvoiceNo: e.supplierInvoiceNo,
      lcNo: e.lcNo,
      billOfEntryNo: e.billOfEntryNo,
      challanNo: e.challanNo,
      siteAddress: e.siteAddress,
      receivedBy: e.receivedBy,
      vehicle: e.vehicle,
      reason: e.reason,
      description: e.description,
      customerPhone: e.customerPhone,
      customerAddress: e.customerAddress,
    },
    notes: e.notes,
    currency: e.currency,
    exchangeRate: e.exchangeRate,
    discountAmount: e.discountAmount,
    vatPercent: e.vatPercent,
    vatAmount: e.vatAmount,
    ...(hideCost ? {} : { subtotal: e.subtotal, grandTotal: e.grandTotal }),
    costTotal: e.costTotal,
    ...(viewer.canSeeProfit && profit !== null ? { profit } : {}),
    belowCostConfirmed: e.belowCostConfirmed,
    itemCount: e.lines.length,
    totalQty: totalQty.toFixed(3),
    lines: e.lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      product: { id: l.product.id, code: l.product.code, name: l.product.name, unitCode: l.product.unitCode, trackSerial: l.product.trackSerial },
      qty: l.qty,
      ...(hideCost ? {} : { unitPrice: l.unitPrice, amount: l.amount }),
      unitCostBdt: l.unitCostBdt,
      landedUnitCost: l.landedUnitCost,
      costAmount: l.costAmount,
      condition: l.condition,
      originalLineId: l.originalLineId,
      receivedQty: l.receivedQty,
      adjustDirection: l.adjustDirection,
      purchaseOrderLineId: l.purchaseOrderLineId,
      note: l.note,
      serials: l.serials.map((s) => ({ serial: s.serial, received: s.received })),
    })),
    charges: e.charges.map((c) => ({ id: c.id, type: c.type, mode: c.mode, includeInCost: c.includeInCost, label: c.label, ...(hideCost ? {} : { value: c.value, amountBdt: c.amountBdt }) })),
    attachmentCount: e.attachmentCount,
    createdBy: e.createdBy,
    verifiedBy: e.verifiedBy,
    receivedByUser: e.receivedByUser,
    rejectionReason: e.rejectionReason,
    reversalReason: e.reversalReason,
    submittedAt: iso(e.submittedAt),
    verifiedAt: iso(e.verifiedAt),
    postedAt: iso(e.postedAt),
    dispatchedAt: iso(e.dispatchedAt),
    receivedAt: iso(e.receivedAt),
    cancelledAt: iso(e.cancelledAt),
    reversedAt: iso(e.reversedAt),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    timeline: timeline(e),
    actions: entryActions(e, viewer),
  };
}

export type EntryDto = ReturnType<typeof toEntryDto>;

/** Calculate response: same cost hiding as entries. */
export function toCalculationDto(c: Awaited<ReturnType<EntryService["calculate"]>>, viewer: InventoryActor) {
  const hideCost = priceIsCost(c.type) && !viewer.canSeeCost;
  const { profit, ...totals } = c.totals;
  return {
    ...c,
    lines: c.lines.map(({ unitPrice, amount, ...l }) => ({ ...l, ...(hideCost ? {} : { unitPrice, amount }) })),
    charges: c.charges.map(({ value, amountBdt, ...ch }) => ({ ...ch, ...(hideCost ? {} : { value, amountBdt }) })),
    totals: hideCost ? { ...totals, subtotal: undefined, grandTotal: undefined, chargesIncluded: undefined, chargesExcluded: undefined } : { ...totals, ...(viewer.canSeeProfit && profit !== null ? { profit } : {}) },
  };
}

export function toMovementDto(m: MovementRecord) {
  return {
    id: m.id,
    seq: m.seq,
    postedAt: m.postedAt.toISOString(),
    entry: m.entry,
    product: m.product,
    warehouse: m.warehouse,
    condition: m.condition,
    qtyChange: m.qtyChange,
    unitCost: m.unitCost,
    valueChange: m.valueChange,
    balanceAfter: m.balanceAfter,
    avgCostAfter: m.avgCostAfter,
  };
}

export const toCustomerDto = (c: Customer) => ({ ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() });

export function toAttachmentDto(a: AttachmentRecord) {
  return {
    id: a.id,
    fileName: a.fileName,
    mimeType: a.mimeType,
    size: a.size,
    label: a.label,
    uploadedBy: a.uploadedBy,
    createdAt: a.createdAt.toISOString(),
    url: `/api/v1/stock-entries/${a.entityId}/attachments/${a.id}`,
  };
}

/* ───────────────────────────── stock counts ───────────────────────────── */

export function countActions(c: CountRecord, a: InventoryActor) {
  const inScope = a.warehouseIds.includes(c.warehouse.id);
  const mine = c.createdBy.id === a.actorId;
  const full = hasLevel(a.level, "FULL");
  const creator = hasLevel(a.level, "CREATE") && inScope;
  const approver = hasLevel(a.level, "APPROVE") && inScope && c.submittedBy?.id !== a.actorId;
  return {
    edit: c.status === "DRAFT" && inScope && (mine || full),
    start: c.status === "DRAFT" && creator,
    count: c.status === "COUNTING" && creator,
    submit: c.status === "COUNTING" && creator,
    approve: c.status === "SUBMITTED" && approver,
    requestRecount: c.status === "SUBMITTED" && approver,
    cancel: ["DRAFT", "COUNTING", "SUBMITTED"].includes(c.status) && inScope && (mine || full),
    printSheet: c.status !== "CANCELLED" && inScope,
  };
}

/**
 * Count DTO. In a blind count, viewers who aren't approvers for the warehouse don't get system
 * quantities, variances, or which serials were expected (found serials come back without a result).
 */
export function toCountDto(c: CountRecord, viewer: InventoryActor, systemVisible: boolean) {
  const counted = c.lines.filter((l) => l.countedQty !== null || l.notCounted).length;
  return {
    id: c.id,
    number: c.number,
    warehouse: { id: c.warehouse.id, code: c.warehouse.code, name: c.warehouse.name },
    scope: c.scope,
    scopeIds: c.scopeIds,
    blindCount: c.blindCount,
    systemVisible,
    status: c.status,
    notes: c.notes,
    createdBy: c.createdBy,
    submittedBy: c.submittedBy,
    approvedBy: c.approvedBy,
    adjustmentEntry: c.adjustmentEntry,
    startedAt: iso(c.startedAt),
    submittedAt: iso(c.submittedAt),
    approvedAt: iso(c.approvedAt),
    cancelledAt: iso(c.cancelledAt),
    recountRequestedAt: iso(c.recountRequestedAt),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    progress: { total: c.lines.length, counted, recount: c.lines.filter((l) => l.recountRequested).length },
    lines: c.lines.map((l) => {
      const v = lineVariance(l);
      return {
        id: l.id,
        product: l.product,
        condition: l.condition,
        ...(systemVisible ? { systemQty: l.systemQty, variance: v ? v.toFixed(3) : null } : {}),
        countedQty: l.countedQty,
        notCounted: l.notCounted,
        countedBy: l.countedBy,
        countedAt: iso(l.countedAt),
        recountRequested: l.recountRequested,
        note: l.note,
        serials: systemVisible ? l.serials : l.serials.filter((s) => s.result !== "MISSING").map((s) => ({ serial: s.serial })),
      };
    }),
    actions: countActions(c, viewer),
  };
}

export function toCountSummaryDto(c: CountSummary) {
  return {
    id: c.id,
    number: c.number,
    warehouse: { id: c.warehouse.id, code: c.warehouse.code, name: c.warehouse.name },
    scope: c.scope,
    blindCount: c.blindCount,
    status: c.status,
    createdBy: c.createdBy,
    startedAt: iso(c.startedAt),
    submittedAt: iso(c.submittedAt),
    approvedAt: iso(c.approvedAt),
    createdAt: c.createdAt.toISOString(),
    progress: { total: c.lineCount, counted: c.countedCount },
    adjustmentEntry: c.adjustmentEntry,
  };
}

export function toVarianceDto(v: Awaited<ReturnType<CountService["variance"]>>, viewer: InventoryActor) {
  const show = v.visible;
  return {
    countId: v.count.id,
    number: v.count.number,
    status: v.count.status,
    systemVisible: show,
    progress: v.progress,
    totals: show ? { ...v.totals, ...(viewer.canSeeCost ? {} : { gainValue: undefined, lossValue: undefined, netValue: undefined }) } : { linesWithVariance: null },
    lines: show
      ? v.lines.map((x) => ({
          lineId: x.line.id,
          product: x.line.product,
          condition: x.line.condition,
          systemQty: x.line.systemQty,
          countedQty: x.line.countedQty,
          notCounted: x.line.notCounted,
          variance: x.variance ? x.variance.toFixed(3) : null,
          ...(viewer.canSeeCost && x.varianceValue ? { varianceValue: x.varianceValue.toFixed(2) } : {}),
          missingSerials: x.missing,
          unexpectedSerials: x.unexpected,
          recountRequested: x.line.recountRequested,
          countedBy: x.line.countedBy,
        }))
      : [],
  };
}

/* ───────────────────────────── opening import ───────────────────────────── */

export function toOpeningImportDto(r: OpeningImportRecord, entries: { id: string; number: string | null; warehouse: string }[]) {
  return {
    id: r.id,
    fileName: r.fileName,
    status: r.status,
    totalRows: r.totalRows,
    validLines: r.rows?.length ?? 0,
    errors: r.errors,
    warnings: r.warnings,
    summary: r.summary,
    entries,
    failedReason: r.failedReason,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    committedAt: iso(r.committedAt),
  };
}

export const toOpeningWarehouseDto = (w: OpeningWarehouse) => ({ id: w.id, code: w.code, name: w.name, isActive: w.isActive, openingLocked: !!w.openingLockedAt, openingLockedAt: iso(w.openingLockedAt), openingLockedBy: w.openingLockedBy });
