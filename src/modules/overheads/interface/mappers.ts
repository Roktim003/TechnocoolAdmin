import type { AttachmentRecord, AuditRow, OverheadsActor, WarehouseCostRecord } from "../application/ports";
import { OVERHEAD_LABEL } from "../domain/types";

const iso = (v: Date | null) => (v ? v.toISOString() : null);

export function toWarehouseCostDto(c: WarehouseCostRecord, viewer: OverheadsActor) {
  return {
    id: c.id,
    scope: c.scope,
    warehouse: c.warehouse,
    category: c.category,
    categoryLabel: OVERHEAD_LABEL[c.category],
    month: c.month,
    amount: c.amount,
    description: c.description,
    vendorOrPayee: c.vendorOrPayee,
    referenceNo: c.referenceNo,
    createdBy: c.createdBy,
    updatedBy: c.updatedBy,
    voided: !!c.voidedAt,
    voidedAt: iso(c.voidedAt),
    voidedBy: c.voidedBy,
    voidReason: c.voidReason,
    attachmentCount: c.attachmentCount,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    actions: { edit: !c.voidedAt && viewer.canEdit, void: !c.voidedAt && viewer.canEdit, upload: !c.voidedAt && viewer.canEdit },
  };
}

const FIELDS = ["amount", "month", "category", "scope", "warehouseId", "description", "vendorOrPayee", "referenceNo"] as const;

/** One line's audit trail: what changed (old → new), who, when, why. */
export function toWarehouseCostHistoryDto(rows: AuditRow[]) {
  return rows.map((r) => {
    const b = r.before ?? {};
    const a = r.after ?? {};
    const action = r.action.replace("warehouse_cost.", "").toUpperCase();
    return {
      id: r.id,
      action,
      at: r.at.toISOString(),
      by: r.by,
      amount: (action === "VOID" ? b.amount : a.amount) ?? null,
      changes: action === "UPDATE" ? FIELDS.filter((f) => (b[f] ?? null) !== (a[f] ?? null)).map((f) => ({ field: f, from: b[f] ?? null, to: a[f] ?? null })) : [],
      files: (a.files as { fileName: string }[] | undefined)?.map((f) => f.fileName) ?? (b.fileName ? [String(b.fileName)] : []),
      reason: (a.reason as string | undefined) ?? null,
    };
  });
}

export function toCostAttachmentDto(x: AttachmentRecord, costId: string) {
  const url = `/api/v1/warehouse-costs/${costId}/attachments/${x.id}`;
  return { id: x.id, fileName: x.fileName, mimeType: x.mimeType, size: x.size, label: x.label, uploadedBy: x.uploadedBy, createdAt: x.createdAt.toISOString(), url };
}
