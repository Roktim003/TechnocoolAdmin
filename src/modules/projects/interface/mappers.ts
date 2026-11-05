import { hasLevel } from "@/shared/rbac/levels";
import type { ProjectEntryRow } from "@/modules/inventory/application/ports";
import type { MaterialProduct } from "../application/costing.service";
import type { AttachmentRecord, AuditRow, CostRecord, ProjectRecord, ProjectsActor, StatusHistoryRecord } from "../application/ports";
import type { ProjectSummary } from "../domain/rules";
import { COST_CATEGORY_LABEL, ISSUE_STATUSES, isOverhead, PROJECT_STATUS_LABEL, PROJECT_TYPE_LABEL, type CostCategory, type Transition } from "../domain/types";
import { canEditOverheads } from "../application/cost.service";

const iso = (v: Date | null) => (v ? v.toISOString() : null);

/**
 * Summary figures for the viewer: cost amounts only with seeCost, contract value / margin /
 * cost-used % only with seeMargin. (The API's sensitive-field filter strips the same keys.)
 *
 * Overheads: with overhead access (overheads ≥ VIEW + seeCost) the summary adds the three
 * overheads, overheadCost and fullCost, and margin / marginPercent / costUsedPercent are on full
 * cost (directMargin / directMarginPercent alongside). Without it everything is on direct cost
 * (`totalCost` = direct cost) and no overhead figure is sent.
 */
export function summaryFor(s: ProjectSummary, viewer: ProjectsActor) {
  const oh = viewer.canSeeOverheads;
  return {
    ...(viewer.canSeeCost
      ? {
          netMaterialCost: s.netMaterialCost,
          issuedCost: s.issuedCost,
          returnedCost: s.returnedCost,
          labourCost: s.labourCost,
          transportCost: s.transportCost,
          otherCost: s.otherCost,
          totalCost: s.totalCost,
          directCost: s.directCost,
          ...(oh ? { storeChargeCost: s.storeChargeCost, holdingCost: s.holdingCost, establishmentCost: s.establishmentCost, overheadCost: s.overheadCost, fullCost: s.fullCost } : {}),
        }
      : {}),
    ...(viewer.canSeeMargin
      ? {
          contractValue: s.contractValue,
          margin: oh ? s.margin : s.directMargin,
          marginPercent: oh ? s.marginPercent : s.directMarginPercent,
          ...(oh ? { directMargin: s.directMargin, directMarginPercent: s.directMarginPercent } : {}),
          ...(viewer.canSeeCost ? { costUsedPercent: oh ? s.costUsedPercent : s.directCostUsedPercent, ...(oh ? { directCostUsedPercent: s.directCostUsedPercent } : {}) } : {}),
        }
      : {}),
  };
}

/** What the viewer may do (the API enforces the same rules). */
export function projectActions(p: ProjectRecord, a: ProjectsActor, transitions: Transition[] = []) {
  const open = p.status !== "CLOSED";
  return {
    edit: open && hasLevel(a.level, "CREATE"),
    editContractValue: open && hasLevel(a.level, "FULL") && a.canSeeMargin,
    addCost: open && hasLevel(a.level, "CREATE"),
    voidCost: open && hasLevel(a.level, "FULL"),
    /** Overheads (store charge, holding, established cost): add / edit / void at any status (a reason when closed). */
    addOverhead: canEditOverheads(a),
    editOverhead: canEditOverheads(a),
    overheadReasonRequired: p.status === "CLOSED",
    seeOverheads: a.canSeeOverheads,
    upload: hasLevel(a.level, "CREATE"),
    /** Issue material (Module 2 form) — planning / running, active, inventory ≥ CREATE. */
    issueMaterial: ISSUE_STATUSES.includes(p.status) && p.isActive && hasLevel(a.inventoryLevel, "CREATE"),
    returnMaterial: open && hasLevel(a.inventoryLevel, "CREATE"),
    costStatement: a.canSeeCost,
    transitions: transitions.map((t) => ({ toStatus: t.to, label: t.label, reasonRequired: t.reason })),
  };
}

export function toProjectDto(p: ProjectRecord, summary: ProjectSummary, viewer: ProjectsActor, transitions?: Transition[]) {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    clientName: p.clientName,
    clientContactPerson: p.clientContactPerson,
    clientPhone: p.clientPhone,
    clientEmail: p.clientEmail,
    siteAddress: p.siteAddress,
    projectType: p.projectType,
    projectTypeLabel: PROJECT_TYPE_LABEL[p.projectType],
    status: p.status,
    statusLabel: PROJECT_STATUS_LABEL[p.status],
    defaultWarehouse: p.defaultWarehouse,
    startDate: p.startDate,
    expectedEndDate: p.expectedEndDate,
    actualEndDate: p.actualEndDate,
    siteEngineer: p.siteEngineer ? { id: p.siteEngineer.id, name: p.siteEngineer.name } : null,
    siteEngineerName: p.siteEngineer?.name ?? p.siteEngineerName,
    notes: p.notes,
    closedAt: iso(p.closedAt),
    closedBy: p.closedBy,
    closeReason: p.closeReason,
    createdBy: p.createdBy,
    isActive: p.isActive,
    summary: summaryFor(summary, viewer),
    ...(viewer.canSeeMargin ? { contractValue: p.contractValue } : {}),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    actions: projectActions(p, viewer, transitions),
  };
}

export type ProjectDto = ReturnType<typeof toProjectDto>;

/** GET projects/options: what the stock form needs, nothing more. */
export const toProjectOptionDto = (p: ProjectRecord) => ({ id: p.id, code: p.code, name: p.name, status: p.status, defaultWarehouse: p.defaultWarehouse });

export function toMaterialDto(m: MaterialProduct, viewer: ProjectsActor) {
  return {
    product: { id: m.productId, code: m.product.code, name: m.product.name, unitCode: m.product.unitCode, trackSerial: m.product.trackSerial },
    issuedQty: m.issuedQty,
    returnedQty: m.returnedQty,
    returnedDamagedQty: m.returnedDamagedQty,
    netQty: m.netQty,
    ...(viewer.canSeeCost ? { issuedCost: m.issuedCost, returnedCost: m.returnedCost, netCost: m.netCost } : {}),
    serialsAtSite: m.serialsAtSite,
  };
}

export function toEntryRowDto(e: ProjectEntryRow, viewer: ProjectsActor) {
  return {
    id: e.id,
    number: e.number,
    displayNumber: e.number ?? e.draftRef,
    type: e.type,
    status: e.status,
    entryDate: e.entryDate,
    warehouse: e.warehouse,
    itemCount: e.itemCount,
    totalQty: e.totalQty,
    ...(viewer.canSeeCost ? { costTotal: e.costTotal } : {}),
    reversalOf: e.reversalOf,
    createdBy: e.createdBy,
    postedAt: iso(e.postedAt),
  };
}

export function toCostDto(c: CostRecord, viewer: ProjectsActor, project?: Pick<ProjectRecord, "status">) {
  const overhead = isOverhead(c.category);
  const open = project ? project.status !== "CLOSED" : true;
  return {
    id: c.id,
    date: c.date,
    category: c.category,
    categoryLabel: COST_CATEGORY_LABEL[c.category],
    kind: overhead ? ("OVERHEAD" as const) : ("DIRECT" as const),
    description: c.description,
    ...(viewer.canSeeCost ? { amount: c.amount } : {}),
    vendorOrPayee: c.vendorOrPayee,
    referenceNo: c.referenceNo,
    ...(overhead ? { periodFrom: c.periodFrom, periodTo: c.periodTo, basisNote: c.basisNote, updatedBy: c.updatedBy, updatedAt: c.updatedAt.toISOString() } : {}),
    actions: {
      edit: overhead && !c.voidedAt && canEditOverheads(viewer),
      void: !c.voidedAt && (overhead ? canEditOverheads(viewer) : open && hasLevel(viewer.level, "FULL")),
      history: true,
    },
    createdBy: c.createdBy,
    voided: !!c.voidedAt,
    voidedAt: iso(c.voidedAt),
    voidedBy: c.voidedBy,
    voidReason: c.voidReason,
    attachmentCount: c.attachmentCount,
    createdAt: c.createdAt.toISOString(),
  };
}

/**
 * Category subtotals of the listed, non-voided costs (seeCost only). `costsTotal` stays the
 * labour + transport + other total; overhead subtotals only with overhead access.
 */
export function costSubtotals(costs: CostRecord[], viewer: ProjectsActor) {
  if (!viewer.canSeeCost) return {};
  const sum = (cats: CostCategory[]) => costs.filter((c) => !c.voidedAt && cats.includes(c.category)).reduce((s, c) => s + Math.round(Number(c.amount) * 100), 0);
  const m = (cents: number) => (cents / 100).toFixed(2);
  const direct = { labourCost: m(sum(["LABOUR"])), transportCost: m(sum(["TRANSPORT"])), otherCost: m(sum(["OTHER"])), costsTotal: m(sum(["LABOUR", "TRANSPORT", "OTHER"])) };
  if (!viewer.canSeeOverheads) return direct;
  return {
    ...direct,
    storeChargeCost: m(sum(["STORE_CHARGE"])),
    holdingCost: m(sum(["HOLDING"])),
    establishmentCost: m(sum(["ESTABLISHMENT"])),
    overheadCost: m(sum(["STORE_CHARGE", "HOLDING", "ESTABLISHMENT"])),
  };
}

/** The audit trail of one cost line: old → new values, who, when, why. */
export function toCostHistoryDto(rows: AuditRow[], viewer: ProjectsActor) {
  const fields = ["amount", "category", "description", "date", "vendorOrPayee", "referenceNo", "periodFrom", "periodTo", "basisNote"] as const;
  return rows.map((r) => {
    const b = r.before ?? {};
    const a = r.after ?? {};
    const kind = r.action.endsWith("_add") ? "CREATED" : r.action.endsWith("_void") ? "VOIDED" : "EDITED";
    const changes =
      kind === "EDITED"
        ? fields.filter((f) => (b[f] ?? null) !== (a[f] ?? null) && (f !== "amount" || viewer.canSeeCost)).map((f) => ({ field: f, from: (b[f] as string | null) ?? null, to: (a[f] as string | null) ?? null }))
        : [];
    return {
      id: r.id,
      action: kind,
      at: r.at.toISOString(),
      by: r.by,
      ...(viewer.canSeeCost ? { amount: ((kind === "VOIDED" ? b.amount : a.amount) as string | undefined) ?? null, ...(kind === "EDITED" ? { amountBefore: (b.amount as string) ?? null } : {}) } : {}),
      changes,
      reason: (a.reason as string | undefined) ?? null,
    };
  });
}

export const toHistoryDto = (h: StatusHistoryRecord) => ({
  id: h.id,
  fromStatus: h.fromStatus,
  toStatus: h.toStatus,
  fromLabel: h.fromStatus ? PROJECT_STATUS_LABEL[h.fromStatus] : null,
  toLabel: PROJECT_STATUS_LABEL[h.toStatus],
  changedBy: h.changedBy,
  reason: h.reason,
  at: h.at.toISOString(),
});

const money = (v: unknown) => `৳ ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v ?? 0))}`;

/** Readable audit lines; amounts only with seeCost, contract values only with seeMargin. */
export function toActivityDto(r: AuditRow, viewer: ProjectsActor) {
  const a = r.after ?? {};
  const b = r.before ?? {};
  const cost = (x: Record<string, unknown>) => `${COST_CATEGORY_LABEL[x.category as CostCategory] ?? "Cost"}: ${String(x.description ?? "")}${viewer.canSeeCost && x.amount ? ` (${money(x.amount)})` : ""}`;
  const text: Record<string, () => string> = {
    "project.create": () => "Project created",
    "project.update": () => "Details edited",
    "project.deactivate": () => "Project deactivated",
    "project.status": () => `Status: ${PROJECT_STATUS_LABEL[b.status as keyof typeof PROJECT_STATUS_LABEL] ?? b.status} → ${PROJECT_STATUS_LABEL[a.status as keyof typeof PROJECT_STATUS_LABEL] ?? a.status}${a.reason ? ` — “${String(a.reason)}”` : ""}`,
    "project.contract_value": () => (viewer.canSeeMargin ? `Contract value: ${b.contractValue ? money(b.contractValue) : "none"} → ${a.contractValue ? money(a.contractValue) : "none"}` : "Contract value changed"),
    "project.cost_add": () => `Cost added — ${cost(a)}`,
    "project.cost_void": () => `Cost voided — ${cost(b)}${a.reason ? ` — “${String(a.reason)}”` : ""}`,
    "project.overhead_add": () => `Overhead added — ${cost(a)}${a.reason ? ` — “${String(a.reason)}”` : ""}`,
    "project.overhead_edit": () => `Overhead edited — ${cost(b)}${viewer.canSeeCost && b.amount !== a.amount ? ` → ${money(a.amount)}` : ""}${a.reason ? ` — “${String(a.reason)}”` : ""}`,
    "project.overhead_void": () => `Overhead voided — ${cost(b)}${a.reason ? ` — “${String(a.reason)}”` : ""}`,
    "project.attachment_add": () => `Files added: ${((a.files as { fileName: string }[]) ?? []).map((f) => f.fileName).join(", ")}`,
    "project.attachment_remove": () => `File removed: ${String(b.fileName ?? "")}`,
    "project.cost_receipt_add": () => `Receipt added: ${((a.files as { fileName: string }[]) ?? []).map((f) => f.fileName).join(", ")}`,
    "project.cost_receipt_remove": () => `Receipt removed: ${String(b.fileName ?? "")}`,
  };
  return { id: r.id, action: r.action, at: r.at.toISOString(), by: r.by?.name ?? null, text: (text[r.action] ?? (() => r.action))() };
}

export function toProjectAttachmentDto(a: AttachmentRecord, projectId: string) {
  const base = a.entityType === "ProjectCost" ? `/api/v1/projects/${projectId}/costs/${a.entityId}/attachments` : `/api/v1/projects/${projectId}/attachments`;
  return { id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size, label: a.label, uploadedBy: a.uploadedBy, createdAt: a.createdAt.toISOString(), url: `${base}/${a.id}` };
}
