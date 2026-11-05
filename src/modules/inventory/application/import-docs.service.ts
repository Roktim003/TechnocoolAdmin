import { NotFoundError } from "@/shared/errors/app-error";
import { hasLevel } from "@/shared/rbac/levels";
import { d } from "../domain/decimal";
import { InventoryErrors } from "../domain/errors";
import {
  documentsChecklist,
  EMPTY_SHIPMENT,
  importWarnings,
  normalizeContainers,
  type DocChecklistItem,
  type ImportDocType,
  type ImportShipmentData,
  type ImportWarning,
} from "../domain/import-docs";
import type { Currency } from "../domain/types";
import type { ImportShipmentInput } from "./dto";
import type { AttachmentRecord, EntryRecord, InventoryActor, InventoryStore, InventoryUnitOfWork } from "./ports";

/** Entry statuses in which the creator may still change the import documents. */
const CREATOR_STATUSES = ["DRAFT", "PENDING", "REJECTED"];
/** After these, only inventory FULL may change documents (and removing a file needs a reason). */
const POSTED_STATUSES = ["POSTED", "REVERSED"];

/**
 * Who may change an entry's import document details and upload files:
 * the creator while DRAFT / PENDING / REJECTED, a verifier (APPROVE, in scope) on a PENDING
 * entry, and inventory FULL at any time (also after posting).
 */
export function canEditImportDocs(actor: InventoryActor, e: EntryRecord): boolean {
  if (e.type !== "GRN_IMPORT" || !actor.warehouseIds.includes(e.warehouse.id)) return false;
  if (hasLevel(actor.level, "FULL")) return true;
  const mine = e.createdBy.id === actor.actorId;
  if (mine && hasLevel(actor.level, "CREATE") && CREATOR_STATUSES.includes(e.status)) return true;
  return !mine && hasLevel(actor.level, "APPROVE") && e.status === "PENDING";
}

/** The uploader while the entry isn't posted; inventory FULL at any time (with a reason once posted). */
export function canRemoveImportFile(actor: InventoryActor, e: EntryRecord, a: Pick<AttachmentRecord, "uploadedBy">): { allowed: boolean; reasonRequired: boolean } {
  const posted = POSTED_STATUSES.includes(e.status);
  if (!actor.warehouseIds.includes(e.warehouse.id)) return { allowed: false, reasonRequired: false };
  if (hasLevel(actor.level, "FULL")) return { allowed: true, reasonRequired: posted };
  return { allowed: a.uploadedBy.id === actor.actorId && !posted && hasLevel(actor.level, "CREATE"), reasonRequired: false };
}

/**
 * Shipment details from an API body. Omitted fields are cleared; users without seeCost can't
 * set the CI value (the stored one is kept).
 */
export function shipmentFromInput(input: ImportShipmentInput, existing: ImportShipmentData | null, canSeeCost: boolean): ImportShipmentData {
  const v = <T>(x: T | undefined): T | null => (x === undefined ? null : x);
  return {
    ...EMPTY_SHIPMENT,
    blNo: v(input.blNo),
    blDate: v(input.blDate),
    shippingLine: v(input.shippingLine),
    vesselVoyage: v(input.vesselVoyage),
    portOfLoading: v(input.portOfLoading),
    portOfDischarge: v(input.portOfDischarge),
    containerNumbers: normalizeContainers(input.containerNumbers),
    coNo: v(input.coNo),
    coDate: v(input.coDate),
    countryOfOrigin: v(input.countryOfOrigin),
    coIssuingAuthority: v(input.coIssuingAuthority),
    plNo: v(input.plNo),
    plDate: v(input.plDate),
    packageCount: v(input.packageCount),
    grossWeightKg: v(input.grossWeightKg),
    netWeightKg: v(input.netWeightKg),
    ciNo: v(input.ciNo),
    ciDate: v(input.ciDate),
    ciCurrency: v(input.ciCurrency) as Currency | null,
    ciValue: canSeeCost ? v(input.ciValue) : (existing?.ciValue ?? null),
    incoterm: v(input.incoterm),
    boeNo: v(input.boeNo),
    boeDate: v(input.boeDate),
    customsStation: v(input.customsStation),
  };
}

/** GRN goods value in the GRN currency (Σ qty × unit price). */
export function goodsValue(lines: { qty: string; unitPrice: string }[]): string {
  return lines.reduce((a, l) => a.plus(d(l.qty).times(d(l.unitPrice))), d(0)).toFixed(2);
}

/** Audit snapshot of the documents (the audit sanitiser scrubs cost fields for viewers). */
const snapshot = (s: ImportShipmentData | null) => s ?? EMPTY_SHIPMENT;

export class ImportDocsService {
  constructor(private readonly d: { uow: InventoryUnitOfWork }) {}

  async required(store: InventoryStore = this.d.uow.store): Promise<ImportDocType[]> {
    return (await store.settings()).importDocsRequiredToPost;
  }

  checklist(e: Pick<EntryRecord, "importShipment" | "docFileCounts">, required: readonly ImportDocType[]): DocChecklistItem[] {
    return documentsChecklist(e.importShipment, e.docFileCounts, required);
  }

  /** Non-blocking warnings for a saved or previewed GRN (Imported). */
  async warnings(store: InventoryStore, shipment: ImportShipmentData | null, grn: { id: string | null; currency: Currency; lines: { qty: string; unitPrice: string }[] }): Promise<ImportWarning[]> {
    if (!shipment) return [];
    const duplicates = await store.importDuplicates({ blNo: shipment.blNo, ciNo: shipment.ciNo, boeNo: shipment.boeNo }, grn.id);
    return importWarnings(shipment, { currency: grn.currency, goodsValue: goodsValue(grn.lines) }, duplicates);
  }

  /** PATCH stock-entries/:id/import-shipment. Never touches stock quantities or costs. */
  async update(actor: InventoryActor, entryId: string, input: ImportShipmentInput): Promise<EntryRecord> {
    await this.d.uow.transaction(async (store) => {
      const e = await store.lockEntry(entryId);
      if (!e) throw new NotFoundError("Stock entry");
      if (!actor.warehouseIds.includes(e.warehouse.id)) throw InventoryErrors.outOfScope(e.warehouse.name);
      if (e.type !== "GRN_IMPORT") throw InventoryErrors.importDocsNotAllowed();
      if (!canEditImportDocs(actor, e)) {
        throw InventoryErrors.importDocsForbidden(
          POSTED_STATUSES.includes(e.status) ? "After posting, only inventory FULL can change import documents." : "You can't change the import documents of this entry.",
        );
      }
      const next = shipmentFromInput(input, e.importShipment, actor.canSeeCost);
      await store.saveImportShipment(entryId, next);
      await store.audit.record(actor, {
        action: "stock_entry.import_docs_update",
        entityType: "StockEntry",
        entityId: entryId,
        before: { status: e.status, documents: snapshot(e.importShipment) },
        after: { status: e.status, documents: next },
      });
    });
    return (await this.d.uow.store.entry(entryId))!;
  }
}
