import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/app-error";
import { hasLevel } from "@/shared/rbac/levels";
import { d, money, sum } from "../domain/decimal";
import { InventoryErrors } from "../domain/errors";
import { todayInDhaka } from "../domain/numbering";
import { normalizeSerial } from "../domain/rules";
import type { Condition } from "../domain/types";
import { entrySnapshot } from "./entry.service";
import { draftRef, type StockPostingService } from "./posting.service";
import { noEvents, type FileStore, type InventoryActor, type InventoryEvents, type InventoryStore, type InventoryUnitOfWork } from "./ports";

/* ───────────────────────────── types ───────────────────────────── */

export type OpeningImportStatus = "QUEUED" | "VALIDATING" | "VALID" | "INVALID" | "COMMITTED" | "FAILED";

export interface RowIssue {
  row: number;
  field: string;
  message: string;
}

export interface OpeningRow {
  /** Spreadsheet row numbers merged into this line. */
  rows: number[];
  warehouseId: string;
  warehouseCode: string;
  productId: string;
  productCode: string;
  condition: Condition;
  qty: string;
  unitCost: string;
  serials: string[];
  note: string | null;
}

export interface WarehouseSummary {
  warehouseId: string;
  warehouseCode: string;
  lines: number;
  totalQty: string;
  totalValue: string;
}

export interface OpeningImportRecord {
  id: string;
  fileKey: string;
  fileName: string;
  status: OpeningImportStatus;
  totalRows: number;
  rows: OpeningRow[] | null;
  errors: RowIssue[];
  warnings: RowIssue[];
  summary: WarehouseSummary[];
  entryIds: string[];
  failedReason: string | null;
  createdBy: { id: string; name: string };
  committedAt: Date | null;
  createdAt: Date;
}

export interface OpeningWarehouse {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  openingLockedAt: Date | null;
  openingLockedBy: { id: string; name: string } | null;
}

export interface OpeningProduct {
  id: string;
  code: string;
  name: string;
  status: "ACTIVE" | "DISCONTINUED";
  trackSerial: boolean;
  unitCode: string;
}

export interface SheetRow {
  rowNumber: number;
  values: Record<string, string | number | boolean | null>;
}

export interface OpeningStore {
  create(data: { fileKey: string; fileName: string; createdById: string }): Promise<string>;
  get(id: string): Promise<OpeningImportRecord | null>;
  lock(id: string): Promise<OpeningImportRecord | null>;
  update(id: string, data: Partial<{ status: OpeningImportStatus; totalRows: number; rows: OpeningRow[]; errors: RowIssue[]; warnings: RowIssue[]; summary: WarehouseSummary[]; entryIds: string[]; failedReason: string | null; committedAt: Date }>): Promise<void>;
  recent(limit: number): Promise<OpeningImportRecord[]>;
  warehouses(): Promise<OpeningWarehouse[]>;
  productsByCode(codes: string[]): Promise<OpeningProduct[]>;
  activeProducts(): Promise<OpeningProduct[]>;
  /** "productId|serial" pairs that already exist (any status). */
  existingSerials(pairs: { productId: string; serial: string }[]): Promise<Set<string>>;
  setOpeningLock(warehouseId: string, lockedById: string | null): Promise<void>;
}

export interface OpeningSheets {
  template(warehouses: OpeningWarehouse[], products: OpeningProduct[]): Promise<Uint8Array>;
  readRows(bytes: Uint8Array): Promise<SheetRow[]>;
}

export interface OpeningImportQueue {
  enqueue(job: OpeningImportJob): Promise<void>;
}

export interface OpeningImportJob {
  importId: string;
  /** Warehouses the uploader may use. */
  warehouseIds: string[];
}

export const OPENING_COLUMNS = [
  { key: "warehousecode", header: "Warehouse code", required: true, width: 16 },
  { key: "productcode", header: "Product code", required: true, width: 22 },
  { key: "condition", header: "Condition", required: false, width: 14 },
  { key: "quantity", header: "Quantity", required: true, width: 12 },
  { key: "unitcostbdt", header: "Unit cost (BDT)", required: true, width: 16 },
  { key: "serialnumbers", header: "Serial numbers", required: false, width: 40 },
  { key: "note", header: "Note", required: false, width: 30 },
] as const;

export const MAX_OPENING_ROWS = 5000;
export const MAX_OPENING_BYTES = 10 * 1024 * 1024;
export const headerKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

const openingErrors = {
  notValid: (status: string) => new BusinessRuleError(`Only a validated import without errors can be committed (this one is ${status.toLowerCase()}).`, "IMPORT_NOT_VALID"),
  changed: (issues: RowIssue[]) =>
    new ValidationError(
      "The data changed since validation, so nothing was imported. Fix the rows and upload the file again.",
      issues.slice(0, 50).map((i) => ({ path: `row ${i.row}: ${i.field}`, message: i.message, code: "IMPORT_INVALID" })),
    ),
  adminOnly: () => new ForbiddenError("Only an Admin can lock or unlock opening stock."),
};

function cellText(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Excel numbers come through as JS numbers; read them as exact decimal text with at most `dp` places. */
function decimalText(v: string | number | boolean | null | undefined, dp: number): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return null;
  const t = (typeof v === "number" ? (Number.isFinite(v) ? v.toString() : "") : v.trim().replace(/,/g, "")).trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [, f = ""] = t.split(".");
  if (f.length > dp) return null;
  return t;
}

/* ───────────────────────────── service ───────────────────────────── */

export class OpeningImportService {
  constructor(private readonly d: { uow: InventoryUnitOfWork; posting: StockPostingService; files: FileStore; sheets: OpeningSheets; queue: OpeningImportQueue; events?: InventoryEvents }) {}

  private get store() {
    return this.d.uow.store;
  }

  private assertFull(actor: InventoryActor) {
    if (!hasLevel(actor.level, "FULL")) throw InventoryErrors.fullOnly("Opening stock import");
  }

  async template(actor: InventoryActor): Promise<Uint8Array> {
    this.assertFull(actor);
    const [warehouses, products] = await Promise.all([this.store.openings.warehouses(), this.store.openings.activeProducts()]);
    return this.d.sheets.template(
      warehouses.filter((w) => w.isActive && actor.warehouseIds.includes(w.id)),
      products,
    );
  }

  async upload(actor: InventoryActor, file: { name: string; bytes: Uint8Array }): Promise<OpeningImportRecord> {
    this.assertFull(actor);
    if (file.bytes.byteLength === 0) throw new ValidationError("The file is empty.", [{ path: "file", message: "The file is empty." }]);
    if (file.bytes.byteLength > MAX_OPENING_BYTES) throw new ValidationError("The file is larger than 10 MB.", [{ path: "file", message: "Import files must be 10 MB or smaller.", code: "FILE_TOO_LARGE" }]);
    const b = file.bytes;
    if (!(b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04)) {
      throw new ValidationError("Upload an Excel .xlsx file.", [{ path: "file", message: "Only .xlsx files made from the template are accepted.", code: "INVALID_FILE_TYPE" }]);
    }
    const fileKey = `opening-imports/${crypto.randomUUID()}.xlsx`;
    await this.d.files.put(fileKey, file.bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const id = await this.d.uow.transaction(async (store) => {
      const id = await store.openings.create({ fileKey, fileName: file.name.slice(0, 200) || "opening-stock.xlsx", createdById: actor.actorId });
      await store.audit.record(actor, { action: "opening_import.upload", entityType: "OpeningImport", entityId: id, after: { fileName: file.name, size: file.bytes.byteLength } });
      return id;
    });
    await this.d.queue.enqueue({ importId: id, warehouseIds: actor.warehouseIds });
    return (await this.store.openings.get(id))!;
  }

  async get(actor: InventoryActor, id: string): Promise<OpeningImportRecord> {
    this.assertFull(actor);
    const r = await this.store.openings.get(id);
    if (!r) throw new NotFoundError("Opening import");
    return r;
  }

  async recent(actor: InventoryActor) {
    this.assertFull(actor);
    return this.store.openings.recent(10);
  }

  /** Worker: parse and validate the uploaded file; nothing is posted. */
  async runValidation(job: OpeningImportJob): Promise<OpeningImportRecord> {
    const store = this.store.openings;
    const imp = await store.get(job.importId);
    if (!imp) throw new Error("Opening import not found.");
    if (imp.status === "COMMITTED") return imp;
    await store.update(imp.id, { status: "VALIDATING" });
    try {
      const bytes = (await this.d.files.get(imp.fileKey))?.body;
      if (!bytes) throw new Error("The uploaded file is no longer available. Upload it again.");
      let raw: SheetRow[];
      try {
        raw = await this.d.sheets.readRows(bytes);
      } catch {
        await store.update(imp.id, { status: "INVALID", totalRows: 0, errors: [{ row: 0, field: "file", message: "The file could not be read. Upload an .xlsx file made from the template." }], warnings: [], summary: [] });
        return (await store.get(imp.id))!;
      }
      const result = await this.validate(this.store, raw, job.warehouseIds);
      await store.update(imp.id, { status: result.errors.length ? "INVALID" : "VALID", totalRows: raw.length, rows: result.rows, errors: result.errors, warnings: result.warnings, summary: result.summary, failedReason: null });
    } catch (err) {
      await store.update(imp.id, { status: "FAILED", failedReason: err instanceof Error ? err.message : "Validation failed." });
      throw err;
    }
    return (await store.get(imp.id))!;
  }

  /** Every rule of the go-live import. Duplicate product + warehouse + condition rows are merged (with a warning) when their cost matches. */
  async validate(store: InventoryStore, raw: SheetRow[], warehouseIds: string[]) {
    const errors: RowIssue[] = [];
    const warnings: RowIssue[] = [];
    if (raw.length > MAX_OPENING_ROWS) return { rows: [] as OpeningRow[], errors: [{ row: 0, field: "file", message: `At most ${MAX_OPENING_ROWS} rows can be imported at once (file has ${raw.length}).` }], warnings, summary: [] as WarehouseSummary[] };
    if (!raw.length) return { rows: [] as OpeningRow[], errors: [{ row: 0, field: "file", message: "The file has no stock rows." }], warnings, summary: [] as WarehouseSummary[] };

    const warehouses = new Map((await store.openings.warehouses()).map((w) => [w.code.toUpperCase(), w]));
    const codes = [...new Set(raw.map((r) => cellText(r.values.productcode).toUpperCase()).filter(Boolean))];
    const products = new Map((await store.openings.productsByCode(codes)).map((p) => [p.code, p]));
    const col = (k: string) => OPENING_COLUMNS.find((c) => c.key === k)!.header;

    const parsed: OpeningRow[] = [];
    for (const { rowNumber: row, values } of raw) {
      const rowErrors: RowIssue[] = [];
      const err = (k: string, message: string) => rowErrors.push({ row, field: col(k), message });

      const whCode = cellText(values.warehousecode).toUpperCase();
      const wh = warehouses.get(whCode);
      if (!whCode) err("warehousecode", "Warehouse code is required.");
      else if (!wh) err("warehousecode", `Unknown warehouse '${whCode}'. Use a code from the Lists sheet.`);
      else if (!wh.isActive) err("warehousecode", `Warehouse ${wh.code} is inactive.`);
      else if (!warehouseIds.includes(wh.id)) err("warehousecode", `You don't have access to warehouse ${wh.code}.`);
      else if (wh.openingLockedAt) err("warehousecode", `Opening stock for warehouse ${wh.code} is locked.`);

      const code = cellText(values.productcode).toUpperCase();
      const p = products.get(code);
      if (!code) err("productcode", "Product code is required.");
      else if (!p) err("productcode", `Unknown product '${code}'.`);
      else if (p.status !== "ACTIVE") err("productcode", `Product ${code} is discontinued.`);

      const condRaw = cellText(values.condition).toUpperCase() || "GOOD";
      if (!["GOOD", "DAMAGED"].includes(condRaw)) err("condition", "Condition must be GOOD or DAMAGED.");

      const qty = decimalText(values.quantity, 3);
      if (qty === null) err("quantity", "Quantity must be a number with at most 3 decimals.");
      else if (!d(qty).gt(0)) err("quantity", "Quantity must be greater than 0.");
      else if (p?.trackSerial && !d(qty).isInteger()) err("quantity", `${code} tracks serial numbers, so the quantity must be a whole number.`);

      const costCell = values.unitcostbdt;
      const cost = decimalText(costCell, 4);
      if (costCell === null || costCell === undefined || cellText(costCell) === "") err("unitcostbdt", "Unit cost is required (0 is allowed).");
      else if (cost === null) err("unitcostbdt", "Unit cost must be 0 or more, with at most 4 decimals.");

      const serials = [...new Set(cellText(values.serialnumbers).split(/[,;\n]+/).map(normalizeSerial).filter(Boolean))];
      if (cellText(values.serialnumbers).split(/[,;\n]+/).map(normalizeSerial).filter(Boolean).length !== serials.length) err("serialnumbers", "A serial number is listed twice in this row.");
      if (p && !p.trackSerial && serials.length) err("serialnumbers", `${code} does not track serial numbers; leave this column empty.`);
      if (p?.trackSerial && qty && d(qty).gt(0) && !d(qty).eq(serials.length)) err("serialnumbers", `${code} tracks serial numbers: enter exactly ${d(qty).toFixed(0)} (got ${serials.length}).`);

      const note = cellText(values.note).slice(0, 500) || null;
      if (rowErrors.length) {
        errors.push(...rowErrors);
        continue;
      }
      parsed.push({ rows: [row], warehouseId: wh!.id, warehouseCode: wh!.code, productId: p!.id, productCode: p!.code, condition: condRaw as Condition, qty: d(qty!).toFixed(3), unitCost: d(cost!).toFixed(4), serials, note });
    }

    // Duplicate product + warehouse + condition: merge when the cost matches, else an error.
    const merged = new Map<string, OpeningRow>();
    for (const r of parsed) {
      const k = `${r.warehouseId}|${r.productId}|${r.condition}`;
      const prev = merged.get(k);
      if (!prev) {
        merged.set(k, { ...r, serials: [...r.serials] });
        continue;
      }
      if (prev.unitCost !== r.unitCost) {
        errors.push({ row: r.rows[0]!, field: col("productcode"), message: `${r.productCode} in warehouse ${r.warehouseCode} (${r.condition.toLowerCase()}) is also in row ${prev.rows[0]} with a different unit cost. Use one row per product, warehouse and condition.` });
        continue;
      }
      warnings.push({ row: r.rows[0]!, field: col("productcode"), message: `Merged with row ${prev.rows[0]} (same product, warehouse and condition): quantities added.` });
      prev.rows.push(...r.rows);
      prev.qty = d(prev.qty).plus(d(r.qty)).toFixed(3);
      prev.serials.push(...r.serials);
      prev.note = [prev.note, r.note].filter(Boolean).join("; ") || null;
    }

    // Serials: unique in the file (per product) and not already known.
    const seen = new Map<string, number>();
    for (const r of merged.values()) {
      for (const s of r.serials) {
        const k = `${r.productId}|${s}`;
        if (seen.has(k)) errors.push({ row: r.rows[0]!, field: col("serialnumbers"), message: `Serial ${s} of ${r.productCode} is also in row ${seen.get(k)}.` });
        else seen.set(k, r.rows[0]!);
      }
    }
    const pairs = [...merged.values()].flatMap((r) => r.serials.map((serial) => ({ productId: r.productId, serial })));
    const existing = await store.openings.existingSerials(pairs);
    for (const r of merged.values()) for (const s of r.serials) if (existing.has(`${r.productId}|${s}`)) errors.push({ row: r.rows[0]!, field: col("serialnumbers"), message: `Serial ${s} of ${r.productCode} already exists in StockBook.` });

    const rows = [...merged.values()];
    errors.sort((a, b) => a.row - b.row);
    warnings.sort((a, b) => a.row - b.row);
    return { rows, errors, warnings, summary: this.summarise(rows) };
  }

  private summarise(rows: OpeningRow[]): WarehouseSummary[] {
    const by = new Map<string, OpeningRow[]>();
    for (const r of rows) by.set(r.warehouseId, [...(by.get(r.warehouseId) ?? []), r]);
    return [...by.entries()]
      .map(([warehouseId, rs]) => ({
        warehouseId,
        warehouseCode: rs[0]!.warehouseCode,
        lines: rs.length,
        totalQty: sum(rs.map((r) => d(r.qty))).toFixed(3),
        totalValue: sum(rs.map((r) => money(d(r.qty).times(d(r.unitCost))))).toFixed(2),
      }))
      .sort((a, b) => a.warehouseCode.localeCompare(b.warehouseCode));
  }

  /**
   * Posts one OPENING entry per warehouse, all in ONE transaction (any failure → nothing).
   * Committing a committed import returns it unchanged.
   */
  async commit(actor: InventoryActor, id: string): Promise<{ import: OpeningImportRecord; alreadyCommitted: boolean }> {
    this.assertFull(actor);
    let productIds: string[] = [];
    const already = await this.d.uow.transaction(
      async (store) => {
        const imp = await store.openings.lock(id);
        if (!imp) throw new NotFoundError("Opening import");
        if (imp.status === "COMMITTED") return true;
        if (imp.status !== "VALID" || !imp.rows?.length || imp.errors.length) throw openingErrors.notValid(imp.status);

        const issues = await this.recheck(store, imp.rows, actor);
        if (issues.length) throw openingErrors.changed(issues);

        const entryIds: string[] = [];
        const byWarehouse = new Map<string, OpeningRow[]>();
        for (const r of imp.rows) byWarehouse.set(r.warehouseId, [...(byWarehouse.get(r.warehouseId) ?? []), r]);
        for (const [warehouseId, rows] of [...byWarehouse.entries()].sort((a, b) => a[1][0]!.warehouseCode.localeCompare(b[1][0]!.warehouseCode))) {
          const entryId = await store.createEntry({
            type: "OPENING",
            entryDate: todayInDhaka(),
            warehouseId,
            toWarehouseId: null,
            supplierId: null,
            customerId: null,
            projectId: null,
            originalEntryId: null,
            poNumberText: null,
            supplierInvoiceNo: null,
            lcNo: null,
            billOfEntryNo: null,
            challanNo: null,
            siteAddress: null,
            receivedBy: null,
            vehicle: null,
            reason: null,
            description: `Opening stock import: ${imp.fileName}`,
            customerPhone: null,
            customerAddress: null,
            notes: null,
            currency: "BDT",
            exchangeRate: "1",
            discountAmount: "0",
            vatPercent: "0",
            lines: rows.map((r) => ({ productId: r.productId, qty: r.qty, unitPrice: r.unitCost, condition: r.condition, originalLineId: null, note: r.note, serials: r.serials })),
            charges: [],
            draftRef: draftRef(),
            status: "DRAFT",
            createdById: actor.actorId,
          });
          await this.d.posting.post(store, entryId, actor);
          const e = (await store.entry(entryId))!;
          await store.audit.record(actor, { action: "stock_entry.post", entityType: "StockEntry", entityId: entryId, after: { ...entrySnapshot(e), importId: id } });
          entryIds.push(entryId);
        }
        productIds = [...new Set(imp.rows.map((r) => r.productId))];
        await store.openings.update(id, { status: "COMMITTED", entryIds, committedAt: new Date() });
        await store.audit.record(actor, { action: "opening_import.commit", entityType: "OpeningImport", entityId: id, after: { fileName: imp.fileName, entries: entryIds.length, summary: imp.summary } });
        return false;
      },
      { timeoutMs: 180_000 },
    );
    if (!already) {
      await this.d.files.delete([(await this.store.openings.get(id))!.fileKey]).catch(() => undefined);
      await (this.d.events ?? noEvents).stockChanged(productIds);
    }
    return { import: (await this.store.openings.get(id))!, alreadyCommitted: already };
  }

  /** What may have changed since validation: locks, product status, serials. */
  private async recheck(store: InventoryStore, rows: OpeningRow[], actor: InventoryActor): Promise<RowIssue[]> {
    const issues: RowIssue[] = [];
    const warehouses = new Map((await store.openings.warehouses()).map((w) => [w.id, w]));
    const products = new Map((await store.openings.productsByCode([...new Set(rows.map((r) => r.productCode))])).map((p) => [p.id, p]));
    const existing = await store.openings.existingSerials(rows.flatMap((r) => r.serials.map((serial) => ({ productId: r.productId, serial }))));
    for (const r of rows) {
      const row = r.rows[0]!;
      const w = warehouses.get(r.warehouseId);
      if (!w || !w.isActive) issues.push({ row, field: "Warehouse code", message: `Warehouse ${r.warehouseCode} is no longer active.` });
      else if (w.openingLockedAt) issues.push({ row, field: "Warehouse code", message: `Opening stock for warehouse ${r.warehouseCode} is locked.` });
      else if (!actor.warehouseIds.includes(w.id)) issues.push({ row, field: "Warehouse code", message: `You don't have access to warehouse ${r.warehouseCode}.` });
      const p = products.get(r.productId);
      if (!p || p.status !== "ACTIVE") issues.push({ row, field: "Product code", message: `Product ${r.productCode} is no longer active.` });
      for (const s of r.serials) if (existing.has(`${r.productId}|${s}`)) issues.push({ row, field: "Serial numbers", message: `Serial ${s} of ${r.productCode} now exists in StockBook.` });
    }
    return issues;
  }

  /* ── go-live lock ── */

  async warehouses(actor: InventoryActor) {
    this.assertFull(actor);
    return (await this.store.openings.warehouses()).filter((w) => actor.warehouseIds.includes(w.id));
  }

  async lock(actor: InventoryActor, warehouseId: string) {
    if (!actor.isAdmin) throw openingErrors.adminOnly();
    await this.d.uow.transaction(async (store) => {
      const w = (await store.openings.warehouses()).find((x) => x.id === warehouseId);
      if (!w) throw new NotFoundError("Warehouse");
      if (w.openingLockedAt) return;
      await store.openings.setOpeningLock(warehouseId, actor.actorId);
      await store.audit.record(actor, { action: "warehouse.lock_opening", entityType: "Warehouse", entityId: warehouseId, before: { openingLocked: false }, after: { openingLocked: true, warehouse: w.code } });
    });
    return (await this.store.openings.warehouses()).find((x) => x.id === warehouseId)!;
  }

  async unlock(actor: InventoryActor, warehouseId: string, reason: string) {
    if (!actor.isAdmin) throw openingErrors.adminOnly();
    if (!reason?.trim()) throw InventoryErrors.reasonRequired("unlock opening stock");
    await this.d.uow.transaction(async (store) => {
      const w = (await store.openings.warehouses()).find((x) => x.id === warehouseId);
      if (!w) throw new NotFoundError("Warehouse");
      if (!w.openingLockedAt) return;
      await store.openings.setOpeningLock(warehouseId, null);
      await store.audit.record(actor, { action: "warehouse.unlock_opening", entityType: "Warehouse", entityId: warehouseId, before: { openingLocked: true, lockedAt: w.openingLockedAt }, after: { openingLocked: false, warehouse: w.code, reason: reason.trim() } });
    });
    return (await this.store.openings.warehouses()).find((x) => x.id === warehouseId)!;
  }
}

