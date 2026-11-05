import { randomUUID } from "node:crypto";
import { NotFoundError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger/logger";
import type { ListQuery } from "@/shared/pagination/list-query";
import { ATTACHMENT_MAX_BYTES, MAX_ATTACHMENTS, sniff } from "@/modules/inventory/application/attachment.service";
import { InventoryErrors } from "@/modules/inventory/domain/errors";
import { d } from "@/modules/inventory/domain/decimal";
import { todayInDhaka } from "@/modules/inventory/domain/numbering";
import { OverheadErrors } from "../domain/errors";
import { holdingPercent, largeAmountWarning, monthOf, monthsBetween, validateCost } from "../domain/rules";
import type { CreateWarehouseCostInput, UpdateWarehouseCostInput, WarehouseCostFilters } from "./dto";
import type { AttachmentRecord, AuditRow, FileStore, OverheadsActor, OverheadsStore, OverheadsUnitOfWork, WarehouseCostRecord, WarehouseCostWrite } from "./ports";

const ENTITY = "WarehouseCost";
const m2 = (v: ReturnType<typeof d>) => v.toDecimalPlaces(2).toFixed(2);

const snapshot = (c: WarehouseCostWrite) => ({
  scope: c.scope,
  warehouseId: c.warehouseId,
  category: c.category,
  month: c.month,
  amount: c.amount,
  description: c.description,
  vendorOrPayee: c.vendorOrPayee,
  referenceNo: c.referenceNo,
});
const writeOf = (c: WarehouseCostRecord): WarehouseCostWrite => ({ ...c, warehouseId: c.warehouse?.id ?? null });

export interface MonthlySummary {
  month: string;
  warehouses: { warehouse: { id: string; code: string; name: string }; storeChargeCost: string; holdingCost: string; warehouseTotal: string; averageStockValue: string; holdingPercent: string | null }[];
  company: { establishmentCost: string };
  total: string;
}

/**
 * The overhead register: what was actually spent per month on store charge and holding (per
 * warehouse) and on the established cost (company-wide). Manual amounts; they never touch stock
 * quantities, unit cost, average cost or stock value. Never deleted: voided with a reason.
 * Every change is audit-logged (entityType "WarehouseCost").
 */
export class WarehouseCostService {
  constructor(private readonly d: { uow: OverheadsUnitOfWork; files: FileStore }) {}

  private get store() {
    return this.d.uow.store;
  }

  private assertView(a: OverheadsActor) {
    if (!a.canSee) throw OverheadErrors.forbidden();
  }
  private assertEdit(a: OverheadsActor) {
    if (!a.canEdit) throw OverheadErrors.editForbidden();
  }
  /** Warehouse lines need the warehouse in the actor's scope; company lines are open to all with access. */
  private assertScope(a: OverheadsActor, warehouseId: string | null) {
    if (warehouseId && !a.warehouseIds.includes(warehouseId)) throw OverheadErrors.outOfScope();
  }

  list(a: OverheadsActor, q: ListQuery<WarehouseCostFilters>) {
    this.assertView(a);
    if (q.filters.warehouseId) this.assertScope(a, q.filters.warehouseId);
    return this.store.list(q, a.warehouseIds);
  }

  async get(a: OverheadsActor, id: string): Promise<WarehouseCostRecord> {
    this.assertView(a);
    const c = await this.store.get(id);
    if (!c || (c.warehouse && !a.warehouseIds.includes(c.warehouse.id))) throw new NotFoundError("Warehouse cost");
    return c;
  }

  async history(a: OverheadsActor, id: string): Promise<{ cost: WarehouseCostRecord; rows: AuditRow[] }> {
    const cost = await this.get(a, id);
    return { cost, rows: await this.store.auditRows(id) };
  }

  private async checked(store: OverheadsStore, a: OverheadsActor, w: WarehouseCostWrite) {
    validateCost(w, todayInDhaka());
    this.assertScope(a, w.warehouseId);
    if (w.warehouseId) {
      const wh = await store.warehouse(w.warehouseId);
      if (!wh || !wh.isActive) throw OverheadErrors.unknownWarehouse();
    }
  }

  async create(a: OverheadsActor, input: CreateWarehouseCostInput) {
    this.assertEdit(a);
    const w: WarehouseCostWrite = {
      scope: input.scope,
      warehouseId: input.warehouseId ?? null,
      category: input.category,
      month: input.month,
      amount: input.amount,
      description: input.description,
      vendorOrPayee: input.vendorOrPayee ?? null,
      referenceNo: input.referenceNo ?? null,
    };
    const id = await this.d.uow.transaction(async (store) => {
      await this.checked(store, a, w);
      const id = await store.create({ ...w, createdById: a.actorId });
      await store.audit.record(a, { action: "warehouse_cost.create", entityType: ENTITY, entityId: id, after: snapshot(w) });
      return id;
    });
    return { cost: (await this.store.get(id))!, warnings: largeAmountWarning(w.amount) };
  }

  async update(a: OverheadsActor, id: string, input: UpdateWarehouseCostInput) {
    this.assertEdit(a);
    const w = await this.d.uow.transaction(async (store) => {
      const c = await store.lock(id);
      if (!c || (c.warehouse && !a.warehouseIds.includes(c.warehouse.id))) throw new NotFoundError("Warehouse cost");
      if (c.voidedAt) throw OverheadErrors.alreadyVoided();
      const before = writeOf(c);
      const scope = input.scope ?? before.scope;
      const w: WarehouseCostWrite = {
        scope,
        // Switching to the company scope drops the warehouse unless one is sent (then validation refuses it).
        warehouseId: input.warehouseId !== undefined ? input.warehouseId : scope === "COMPANY" ? null : before.warehouseId,
        category: input.category ?? before.category,
        month: input.month ?? before.month,
        amount: input.amount ?? before.amount,
        description: input.description ?? before.description,
        vendorOrPayee: input.vendorOrPayee !== undefined ? input.vendorOrPayee : before.vendorOrPayee,
        referenceNo: input.referenceNo !== undefined ? input.referenceNo : before.referenceNo,
      };
      await this.checked(store, a, w);
      await store.update(id, { ...w, updatedById: a.actorId });
      await store.audit.record(a, { action: "warehouse_cost.update", entityType: ENTITY, entityId: id, before: snapshot(before), after: { ...snapshot(w), ...(input.reason ? { reason: input.reason } : {}) } });
      return w;
    });
    return { cost: (await this.store.get(id))!, warnings: largeAmountWarning(w.amount) };
  }

  async void(a: OverheadsActor, id: string, reason: string): Promise<WarehouseCostRecord> {
    this.assertEdit(a);
    await this.d.uow.transaction(async (store) => {
      const c = await store.lock(id);
      if (!c || (c.warehouse && !a.warehouseIds.includes(c.warehouse.id))) throw new NotFoundError("Warehouse cost");
      if (c.voidedAt) throw OverheadErrors.alreadyVoided();
      await store.void(id, { voidedById: a.actorId, voidReason: reason });
      await store.audit.record(a, { action: "warehouse_cost.void", entityType: ENTITY, entityId: id, before: snapshot(writeOf(c)), after: { voided: true, reason } });
    });
    return (await this.store.get(id))!;
  }

  /**
   * Per month and warehouse (in the actor's scope): store charge, holding, total, average stock
   * value (daily closing values from the ledger) and holding % of it; plus the company's
   * established cost and the month's grand total.
   */
  async summary(a: OverheadsActor, range: { monthFrom?: string; monthTo?: string }): Promise<{ monthFrom: string; monthTo: string; months: MonthlySummary[] }> {
    this.assertView(a);
    const today = todayInDhaka();
    const to = range.monthTo ?? monthOf(today)!;
    let from = range.monthFrom;
    if (!from) {
      const [y, m] = to.split("-").map(Number) as [number, number];
      from = new Date(Date.UTC(y, m - 1 - 5, 1)).toISOString().slice(0, 10);
    }
    if (from > to) throw new ValidationError("monthFrom must be on or before monthTo.", [{ path: "monthFrom", message: "Must be on or before monthTo." }]);
    const months = monthsBetween(from, to);
    if (months.length > 36) throw new ValidationError("Choose at most 36 months.", [{ path: "monthFrom", message: "At most 36 months." }]);
    const warehouses = await this.store.warehouses(a.warehouseIds);
    const ids = warehouses.map((w) => w.id);
    const [costs, stock] = await Promise.all([this.store.monthlyCosts(from, to, ids), this.store.averageStockValues(from, to, ids, today)]);
    const sum = (month: string, warehouseId: string | null, category: string) =>
      costs.filter((c) => c.month === month && c.warehouseId === warehouseId && c.category === category).reduce((s, c) => s.plus(d(c.amount)), d(0));
    return {
      monthFrom: from,
      monthTo: to,
      months: months.map((month) => {
        const rows = warehouses.map((w) => {
          const store = sum(month, w.id, "STORE_CHARGE");
          const holding = sum(month, w.id, "HOLDING");
          const avg = stock.find((s) => s.month === month && s.warehouseId === w.id)?.averageStockValue ?? "0.00";
          return { warehouse: w, storeChargeCost: m2(store), holdingCost: m2(holding), warehouseTotal: m2(store.plus(holding)), averageStockValue: avg, holdingPercent: holdingPercent(m2(holding), avg) };
        });
        const established = sum(month, null, "ESTABLISHMENT");
        const total = rows.reduce((s, r) => s.plus(d(r.warehouseTotal)), d(0)).plus(established);
        return { month, warehouses: rows, company: { establishmentCost: m2(established) }, total: m2(total) };
      }),
    };
  }

  /* ── receipts and bills (generic Attachment table; same checks as stock entries) ── */

  async attachments(a: OverheadsActor, id: string): Promise<AttachmentRecord[]> {
    await this.get(a, id);
    return this.store.attachments(id);
  }

  async upload(a: OverheadsActor, id: string, files: { name: string; bytes: Uint8Array }[], label: string | null): Promise<AttachmentRecord[]> {
    this.assertEdit(a);
    if ((await this.get(a, id)).voidedAt) throw OverheadErrors.alreadyVoided();
    if (!files.length) throw new ValidationError("Attach at least one file.", [{ path: "file", message: "Choose a file." }]);
    if ((await this.store.attachments(id)).length + files.length > MAX_ATTACHMENTS) throw InventoryErrors.attachmentLimit();
    const checked = files.map((f) => {
      if (f.bytes.byteLength > ATTACHMENT_MAX_BYTES) throw InventoryErrors.attachmentSize();
      const kind = sniff(f.bytes);
      if (!kind || f.bytes.byteLength === 0) throw InventoryErrors.attachmentType();
      return { ...f, kind, key: `attachments/${ENTITY}/${id}/${randomUUID()}.${kind.ext}` };
    });
    const stored: string[] = [];
    try {
      for (const f of checked) {
        await this.d.files.put(f.key, f.bytes, f.kind.mime);
        stored.push(f.key);
      }
      return await this.d.uow.transaction(async (store) => {
        const out: AttachmentRecord[] = [];
        for (const f of checked) {
          out.push(await store.addAttachment({ entityType: ENTITY, entityId: id, fileKey: f.key, fileName: f.name.slice(0, 200) || `file.${f.kind.ext}`, mimeType: f.kind.mime, size: f.bytes.byteLength, label, uploadedById: a.actorId }));
        }
        await store.audit.record(a, { action: "warehouse_cost.attachment_add", entityType: ENTITY, entityId: id, after: { files: out.map((x) => ({ id: x.id, fileName: x.fileName, size: x.size })) } });
        return out;
      });
    } catch (err) {
      await this.d.files.delete(stored).catch((x) => logger.warn({ err: x }, "attachment cleanup failed"));
      throw err;
    }
  }

  async file(a: OverheadsActor, id: string, attachmentId: string) {
    await this.get(a, id);
    const x = await this.store.attachment(attachmentId);
    if (!x || x.entityType !== ENTITY || x.entityId !== id) throw new NotFoundError("Attachment");
    const obj = await this.d.files.get(x.fileKey);
    if (!obj) throw new NotFoundError("Attachment file");
    return { ...obj, fileName: x.fileName, mimeType: x.mimeType };
  }

  async removeAttachment(a: OverheadsActor, id: string, attachmentId: string): Promise<void> {
    this.assertEdit(a);
    await this.get(a, id);
    const x = await this.store.attachment(attachmentId);
    if (!x || x.entityType !== ENTITY || x.entityId !== id) throw new NotFoundError("Attachment");
    await this.d.uow.transaction(async (store) => {
      await store.deleteAttachment(attachmentId);
      await store.audit.record(a, { action: "warehouse_cost.attachment_remove", entityType: ENTITY, entityId: id, before: { id: x.id, fileName: x.fileName } });
    });
    await this.d.files.delete([x.fileKey]).catch((err) => logger.warn({ err }, "attachment object delete failed"));
  }
}
