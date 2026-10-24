import { NotFoundError } from "@/shared/errors/app-error";
import type { ListQuery } from "@/shared/pagination/list-query";
import { CatalogErrors } from "../domain/errors";
import { assertActiveRef, assertCodeUnchanged, assertPurchaseUnit, isValidCode, normalizeCode } from "../domain/rules";
import type { Product, ProductFields } from "../domain/types";
import type { CreateProductInput, ProductFilters, UpdateProductInput } from "./dto";
import type { CatalogActor, CatalogRepos, CatalogUnitOfWork } from "./ports";

export const ZERO_COST = "0.00";

/** What the audit trail stores for a product. purchaseCost is stripped when shown to roles without seeCost. */
export function productSnapshot(p: Product) {
  return {
    code: p.code,
    name: p.name,
    status: p.status,
    catalog: p.catalog.name,
    model: p.model,
    category: p.category.name,
    unit: p.unit.code,
    purchaseCost: p.purchaseCost,
    sellingPrice: p.sellingPrice,
    purchaseUnit: p.purchaseUnit?.code ?? null,
    purchaseUnitFactor: p.purchaseUnitFactor,
    minStockLevel: p.minStockLevel,
    barcode: p.barcode,
    trackSerial: p.trackSerial,
    warrantyMonths: p.warrantyMonths,
    defaultSupplier: p.defaultSupplier?.name ?? null,
    defaultSupplierName: p.defaultSupplierName,
    source: p.source,
    countryOfOrigin: p.countryOfOrigin,
    hsCode: p.hsCode,
    capacity: p.capacity,
    refrigerant: p.refrigerant,
    powerSupply: p.powerSupply,
    dimensionsWeight: p.dimensionsWeight,
    specifications: p.specifications,
  };
}

/** Fields of a create request, with defaults for everything optional. */
export function fieldsFromCreate(input: CreateProductInput, purchaseCost: string): ProductFields {
  return {
    name: input.name,
    catalogId: input.catalogId,
    model: input.model ?? null,
    categoryId: input.categoryId,
    unitId: input.unitId,
    purchaseCost,
    sellingPrice: input.sellingPrice,
    purchaseUnitId: input.purchaseUnitId ?? null,
    purchaseUnitFactor: input.purchaseUnitFactor ?? null,
    minStockLevel: input.minStockLevel ?? null,
    barcode: input.barcode ?? null,
    trackSerial: input.trackSerial ?? false,
    warrantyMonths: input.warrantyMonths ?? null,
    defaultSupplierId: input.defaultSupplierId ?? null,
    // A linked supplier replaces the legacy free text.
    defaultSupplierName: input.defaultSupplierId ? null : (input.defaultSupplierName ?? null),
    source: input.source ?? null,
    countryOfOrigin: input.countryOfOrigin ?? null,
    hsCode: input.hsCode ?? null,
    capacity: input.capacity ?? null,
    refrigerant: input.refrigerant ?? null,
    powerSupply: input.powerSupply ?? null,
    dimensionsWeight: input.dimensionsWeight ?? null,
    specifications: input.specifications ?? null,
  };
}

/** Checks the catalog / category / unit / purchase unit ids that are new or changed. */
export async function assertReferences(repos: CatalogRepos, next: ProductFields, previous?: ProductFields): Promise<void> {
  const changed = (k: keyof ProductFields) => !previous || previous[k] !== next[k];
  if (changed("catalogId")) assertActiveRef(await repos.catalogs.findById(next.catalogId), "catalog");
  if (changed("categoryId")) assertActiveRef(await repos.categories.findById(next.categoryId), "category");
  if (changed("unitId")) {
    const u = await repos.units.findById(next.unitId);
    assertActiveRef(u && { isActive: u.isActive, name: u.code }, "unit");
  }
  if (next.purchaseUnitId && changed("purchaseUnitId")) {
    const u = await repos.units.findById(next.purchaseUnitId);
    assertActiveRef(u && { isActive: u.isActive, name: u.code }, "unit");
  }
  assertPurchaseUnit(next.purchaseUnitId, next.purchaseUnitFactor);
  if (next.defaultSupplierId && changed("defaultSupplierId")) {
    const s = await repos.suppliers.findById(next.defaultSupplierId);
    if (!s) throw CatalogErrors.unknownSupplier();
    if (!s.isActive) throw CatalogErrors.inactiveSupplier(s.name);
  }
}

export class ProductService {
  constructor(private readonly d: { uow: CatalogUnitOfWork }) {}

  private get repos() {
    return this.d.uow.repos;
  }

  list(query: ListQuery<ProductFilters>) {
    return this.repos.products.list(query);
  }

  async get(id: string): Promise<Product> {
    const p = await this.repos.products.findById(id);
    if (!p) throw new NotFoundError("Product");
    return p;
  }

  async getByCode(code: string): Promise<Product> {
    const p = await this.repos.products.findByCode(normalizeCode(code));
    if (!p) throw new NotFoundError("Product");
    return p;
  }

  async getByBarcode(barcode: string): Promise<Product> {
    const p = await this.repos.products.findByBarcode(barcode.trim());
    if (!p) throw new NotFoundError("Product");
    return p;
  }

  async checkCode(raw: string): Promise<{ code: string; valid: boolean; available: boolean }> {
    const code = normalizeCode(raw);
    const valid = isValidCode(code);
    return { code, valid, available: valid && !(await this.repos.products.codeExists(code)) };
  }

  /**
   * Creates a product. Roles without seeCost cannot set the purchase cost: it starts at 0 and
   * is filled in later (by an Admin, or automatically from purchases).
   */
  async create(actor: CatalogActor, input: CreateProductInput): Promise<Product> {
    let cost = ZERO_COST;
    if (actor.canSeeCost) {
      if (input.purchaseCost === undefined) throw CatalogErrors.purchaseCostRequired();
      cost = input.purchaseCost;
    }
    const fields = fieldsFromCreate(input, cost);

    if (await this.repos.products.codeExists(input.code)) throw CatalogErrors.codeTaken(input.code);
    if (fields.barcode && (await this.repos.products.barcodeExists(fields.barcode))) throw CatalogErrors.barcodeTaken(fields.barcode);
    await assertReferences(this.repos, fields);

    return this.d.uow.transaction(async (r) => {
      const p = await r.products.create({ ...fields, code: input.code, status: input.status ?? "ACTIVE", createdById: actor.actorId });
      await r.audit.record(actor, { action: "product.create", entityType: "Product", entityId: p.id, after: productSnapshot(p) });
      return p;
    });
  }

  async update(actor: CatalogActor, id: string, input: UpdateProductInput): Promise<Product> {
    const before = await this.get(id);
    assertCodeUnchanged(before.code, input.code);

    const { code: _code, purchaseCost, ...rest } = input;
    const changes: Partial<ProductFields> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    // Roles without seeCost can't see the cost, so they can't change it either.
    if (actor.canSeeCost && purchaseCost !== undefined) changes.purchaseCost = purchaseCost;
    if (changes.defaultSupplierId) changes.defaultSupplierName = null;

    const next: ProductFields = { ...before, ...changes };
    if (changes.barcode && changes.barcode !== before.barcode && (await this.repos.products.barcodeExists(changes.barcode, id))) {
      throw CatalogErrors.barcodeTaken(changes.barcode);
    }
    await assertReferences(this.repos, next, before);

    return this.d.uow.transaction(async (r) => {
      const p = await r.products.update(id, { ...changes, updatedById: actor.actorId });
      await r.audit.record(actor, { action: "product.update", entityType: "Product", entityId: id, before: productSnapshot(before), after: productSnapshot(p) });
      return p;
    });
  }

  /** Discontinued products stay in history but can't be picked in new entries. */
  async discontinue(actor: CatalogActor, id: string): Promise<Product> {
    return this.setStatus(actor, id, "DISCONTINUED");
  }

  async reactivate(actor: CatalogActor, id: string): Promise<Product> {
    return this.setStatus(actor, id, "ACTIVE");
  }

  private async setStatus(actor: CatalogActor, id: string, status: Product["status"]): Promise<Product> {
    const before = await this.get(id);
    if (before.status === status) throw status === "ACTIVE" ? CatalogErrors.alreadyActive() : CatalogErrors.alreadyDiscontinued();
    return this.d.uow.transaction(async (r) => {
      const p = await r.products.setStatus(id, status, actor.actorId);
      await r.audit.record(actor, {
        action: status === "ACTIVE" ? "product.reactivate" : "product.discontinue",
        entityType: "Product",
        entityId: id,
        before: { status: before.status },
        after: { status: p.status },
      });
      return p;
    });
  }

  /** Audit trail of one product (create, edits, status changes, photo changes). */
  async history(id: string, page: number, pageSize: number) {
    await this.get(id);
    return this.repos.audit.list({
      page,
      pageSize,
      skip: (page - 1) * pageSize,
      take: pageSize,
      sort: [{ field: "createdAt", direction: "desc" }],
      filters: { entityType: "Product", entityId: id },
    });
  }
}
