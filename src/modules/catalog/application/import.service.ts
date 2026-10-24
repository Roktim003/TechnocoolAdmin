import { ValidationError } from "@/shared/errors/app-error";
import type { SortField } from "@/shared/pagination/list-query";
import { assertPurchaseUnit, nameKey } from "../domain/rules";
import type { ProductFields } from "../domain/types";
import { CreateProductSchema, type CreateProductInput, type ImportMode, type ImportResult, type ImportRowError, type ProductFilters } from "./dto";
import { IMPORT_COLUMNS, MAX_EXPORT_ROWS, MAX_IMPORT_ROWS, normalizeHeader } from "./import-columns";
import { fieldsFromCreate, productSnapshot, ZERO_COST } from "./product.service";
import type { CatalogActor, CatalogUnitOfWork, FileStore, SheetRow, Spreadsheet } from "./ports";

export interface ImportJobData {
  fileKey: string;
  fileName: string;
  mode: ImportMode;
  actor: CatalogActor;
}

interface ValidRow {
  row: number;
  code: string;
  fields: ProductFields;
}

const COLUMN_BY_KEY = new Map(IMPORT_COLUMNS.map((c) => [c.key, c]));
const header = (key: string) => COLUMN_BY_KEY.get(key)?.header ?? key;

function cellText(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v).trim();
}

export class ImportService {
  constructor(private readonly d: { uow: CatalogUnitOfWork; files: FileStore; sheets: Spreadsheet }) {}

  private get repos() {
    return this.d.uow.repos;
  }

  /** Excel template: headers, one example row and a Lists sheet of valid catalogs/categories/units. */
  async template(actor: CatalogActor): Promise<Uint8Array> {
    const [catalogs, categories, units] = await Promise.all([this.repos.catalogs.list(), this.repos.categories.list(), this.repos.units.list()]);
    return this.d.sheets.buildTemplate(
      {
        catalogs: catalogs.filter((c) => c.isActive).map((c) => c.name),
        categories: categories.filter((c) => c.isActive).map((c) => c.name),
        units: units.filter((u) => u.isActive).map((u) => u.code),
      },
      actor.canSeeCost,
    );
  }

  /** Excel export of the filtered list. The cost column is omitted without seeCost. */
  async export(actor: CatalogActor, opts: { filters: ProductFilters; q?: string; sort: SortField[] }): Promise<Uint8Array> {
    const products = await this.repos.products.listAll({ ...opts, limit: MAX_EXPORT_ROWS });
    return this.d.sheets.buildExport(products, actor.canSeeCost);
  }

  /**
   * Validates every row (and, in commit mode with no errors, creates all products in one
   * transaction). Any error in commit mode means nothing is written.
   */
  async run(job: ImportJobData): Promise<ImportResult> {
    const bytes = (await this.d.files.get(job.fileKey))?.body;
    if (!bytes) throw new Error("The uploaded import file is no longer available. Upload it again.");
    try {
      let rows: SheetRow[];
      try {
        rows = await this.d.sheets.readRows(bytes);
      } catch {
        return this.result(job.mode, 0, 0, [{ row: 0, field: "file", message: "The file could not be read. Upload an .xlsx file made from the template." }]);
      }
      const { valid, errors } = await this.validate(rows, job.actor);
      if (job.mode === "validate" || errors.length > 0 || valid.length === 0) {
        if (valid.length === 0 && errors.length === 0) errors.push({ row: 0, field: "file", message: "The file has no product rows." });
        return this.result(job.mode, rows.length, valid.length, errors);
      }

      await this.d.uow.transaction(
        async (r) => {
          // Re-check inside the transaction: another user may have created a code meanwhile.
          const taken = await r.products.existingCodes(valid.map((v) => v.code));
          if (taken.length) throw new ValidationError(`Codes already exist: ${taken.join(", ")}. Nothing was imported.`);
          for (const v of valid) {
            const p = await r.products.create({ ...v.fields, code: v.code, status: "ACTIVE", createdById: job.actor.actorId });
            await r.audit.record(job.actor, { action: "product.create", entityType: "Product", entityId: p.id, after: { ...productSnapshot(p), importedFrom: job.fileName } });
          }
          await r.audit.record(job.actor, { action: "product.import", entityType: "Product", entityId: null, after: { fileName: job.fileName, created: valid.length } });
        },
        { timeoutMs: 120_000 },
      );
      return { ...this.result(job.mode, rows.length, valid.length, []), committed: true, createdCount: valid.length };
    } finally {
      await this.d.files.delete([job.fileKey]).catch(() => undefined);
    }
  }

  private result(mode: ImportMode, totalRows: number, validRows: number, errors: ImportRowError[]): ImportResult {
    return { mode, totalRows, validRows, errors, committed: false, createdCount: 0 };
  }

  private async validate(rows: SheetRow[], actor: CatalogActor): Promise<{ valid: ValidRow[]; errors: ImportRowError[] }> {
    const errors: ImportRowError[] = [];
    if (rows.length > MAX_IMPORT_ROWS) {
      return { valid: [], errors: [{ row: 0, field: "file", message: `At most ${MAX_IMPORT_ROWS} rows can be imported at once (file has ${rows.length}).` }] };
    }

    const [catalogs, categories, units] = await Promise.all([this.repos.catalogs.list(), this.repos.categories.list(), this.repos.units.list()]);
    const catalogByName = new Map(catalogs.map((c) => [nameKey(c.name), c]));
    const categoryByName = new Map(categories.map((c) => [nameKey(c.name), c]));
    const unitByCode = new Map(units.map((u) => [u.code.toLowerCase(), u]));

    const candidates: { row: number; input: CreateProductInput }[] = [];
    for (const { rowNumber, values } of rows) {
      const get = (key: string) => values[normalizeHeader(header(key))];
      const rowErrors: ImportRowError[] = [];
      const err = (key: string, message: string) => rowErrors.push({ row: rowNumber, field: header(key), message });

      const ref = <T extends { id: string; isActive: boolean }>(key: string, map: Map<string, T>, label: string, required: boolean): string | null | undefined => {
        const raw = cellText(get(key));
        if (!raw) {
          if (required) err(key, `${label} is required.`);
          return required ? undefined : null;
        }
        const found = map.get(key === "unit" || key === "purchaseUnit" ? raw.toLowerCase() : nameKey(raw));
        if (!found) err(key, `Unknown ${label.toLowerCase()} '${raw}'. Use a value from the Lists sheet.`);
        else if (!found.isActive) err(key, `${label} '${raw}' is inactive.`);
        return found?.id;
      };

      const catalogId = ref("catalog", catalogByName, "Brand (catalog)", true);
      const categoryId = ref("category", categoryByName, "Category", true);
      const unitId = ref("unit", unitByCode, "Unit", true);
      const purchaseUnitId = ref("purchaseUnit", unitByCode, "Purchase unit", false);

      const raw: Record<string, unknown> = { catalogId, categoryId, unitId, purchaseUnitId };
      for (const col of IMPORT_COLUMNS) {
        if (["catalog", "category", "unit", "purchaseUnit"].includes(col.key)) continue;
        if (col.costOnly && !actor.canSeeCost) continue;
        const v = get(col.key);
        raw[col.key] = typeof v === "number" || typeof v === "boolean" ? v : cellText(v) === "" ? undefined : cellText(v);
      }
      if (!actor.canSeeCost) delete raw.purchaseCost;
      else if (raw.purchaseCost === undefined) err("purchaseCost", "Purchase cost is required.");

      const parsed = CreateProductSchema.safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? "row");
          // Reference errors were already reported with a clearer message.
          if (["catalogId", "categoryId", "unitId", "purchaseUnitId"].includes(key)) continue;
          err(key, issue.message);
        }
      }
      if (rowErrors.length || !parsed.success) {
        errors.push(...rowErrors);
        continue;
      }
      candidates.push({ row: rowNumber, input: parsed.data });
    }

    // Duplicates inside the file, then against the database.
    const firstRowOfCode = new Map<string, number>();
    const firstRowOfBarcode = new Map<string, number>();
    const valid: ValidRow[] = [];
    const dupRows = new Set<number>();
    for (const c of candidates) {
      const prev = firstRowOfCode.get(c.input.code);
      if (prev !== undefined) {
        errors.push({ row: c.row, field: header("code"), message: `Duplicate code '${c.input.code}' (also in row ${prev}).` });
        dupRows.add(c.row);
      } else firstRowOfCode.set(c.input.code, c.row);
      if (c.input.barcode) {
        const prevB = firstRowOfBarcode.get(c.input.barcode);
        if (prevB !== undefined) {
          errors.push({ row: c.row, field: header("barcode"), message: `Duplicate barcode '${c.input.barcode}' (also in row ${prevB}).` });
          dupRows.add(c.row);
        } else firstRowOfBarcode.set(c.input.barcode, c.row);
      }
    }

    const takenCodes = new Set(await this.repos.products.existingCodes([...firstRowOfCode.keys()]));
    const takenBarcodes = new Set(await this.repos.products.existingBarcodes([...firstRowOfBarcode.keys()]));

    for (const c of candidates) {
      let ok = !dupRows.has(c.row);
      if (takenCodes.has(c.input.code)) {
        errors.push({ row: c.row, field: header("code"), message: `Code '${c.input.code}' already exists in the catalog.` });
        ok = false;
      }
      if (c.input.barcode && takenBarcodes.has(c.input.barcode)) {
        errors.push({ row: c.row, field: header("barcode"), message: `Barcode '${c.input.barcode}' is already used by another product.` });
        ok = false;
      }
      const fields = fieldsFromCreate(c.input, actor.canSeeCost ? (c.input.purchaseCost ?? ZERO_COST) : ZERO_COST);
      // "Default supplier" text: link it when it names a supplier record, keep the text otherwise.
      if (fields.defaultSupplierName) {
        const s = await this.repos.suppliers.findByNameKey(nameKey(fields.defaultSupplierName));
        if (s) Object.assign(fields, { defaultSupplierId: s.id, defaultSupplierName: null });
      }
      try {
        assertPurchaseUnit(fields.purchaseUnitId, fields.purchaseUnitFactor);
      } catch (e) {
        errors.push({ row: c.row, field: header("purchaseUnitFactor"), message: (e as Error).message });
        ok = false;
      }
      if (ok) valid.push({ row: c.row, code: c.input.code, fields });
    }

    errors.sort((a, b) => a.row - b.row);
    return { valid, errors };
  }
}
