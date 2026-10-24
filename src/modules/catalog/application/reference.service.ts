import type { ActorContext } from "@/modules/audit/application/audit.service";
import { NotFoundError } from "@/shared/errors/app-error";
import { CatalogErrors } from "../domain/errors";
import { assertDeletable, nameKey } from "../domain/rules";
import type { Catalog, Category, Unit } from "../domain/types";
import type { CreateCatalogInput, CreateCategoryInput, CreateUnitInput, UpdateCatalogInput, UpdateCategoryInput, UpdateUnitInput } from "./dto";
import type { CatalogUnitOfWork } from "./ports";

const catalogSnapshot = (c: Catalog) => ({ id: c.id, name: c.name, description: c.description, isActive: c.isActive, sortOrder: c.sortOrder });
const categorySnapshot = (c: Category) => ({ id: c.id, name: c.name, isActive: c.isActive });
const unitSnapshot = (u: Unit) => ({ id: u.id, code: u.code, name: u.name, isActive: u.isActive });

/** Catalogs (brands), categories and units of measure. */
export class ReferenceService {
  constructor(private readonly d: { uow: CatalogUnitOfWork }) {}

  private get repos() {
    return this.d.uow.repos;
  }

  /* ── catalogs ── */

  listCatalogs() {
    return this.repos.catalogs.list();
  }

  async getCatalog(id: string) {
    const c = await this.repos.catalogs.findById(id);
    if (!c) throw new NotFoundError("Catalog");
    return c;
  }

  async createCatalog(actor: ActorContext, input: CreateCatalogInput): Promise<Catalog> {
    const key = nameKey(input.name);
    if (await this.repos.catalogs.nameExists(key)) throw CatalogErrors.catalogNameTaken(input.name);
    const sortOrder = input.sortOrder ?? (await this.repos.catalogs.nextSortOrder());
    return this.d.uow.transaction(async (r) => {
      const c = await r.catalogs.create({ name: input.name.trim(), nameKey: key, description: input.description ?? null, sortOrder });
      await r.audit.record(actor, { action: "catalog.create", entityType: "Catalog", entityId: c.id, after: catalogSnapshot(c) });
      return c;
    });
  }

  async updateCatalog(actor: ActorContext, id: string, input: UpdateCatalogInput): Promise<Catalog> {
    const before = await this.getCatalog(id);
    let key: string | undefined;
    if (input.name !== undefined) {
      key = nameKey(input.name);
      if (await this.repos.catalogs.nameExists(key, id)) throw CatalogErrors.catalogNameTaken(input.name);
    }
    return this.d.uow.transaction(async (r) => {
      const c = await r.catalogs.update(id, {
        ...(input.name !== undefined ? { name: input.name.trim(), nameKey: key } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      });
      await r.audit.record(actor, { action: "catalog.update", entityType: "Catalog", entityId: id, before: catalogSnapshot(before), after: catalogSnapshot(c) });
      return c;
    });
  }

  /** Blocked (422) while any product — active or discontinued — belongs to the catalog. */
  async deleteCatalog(actor: ActorContext, id: string): Promise<void> {
    await this.d.uow.transaction(async (r) => {
      const c = await r.catalogs.findById(id);
      if (!c) throw new NotFoundError("Catalog");
      assertDeletable(c.productCount, "catalog");
      await r.catalogs.delete(id);
      await r.audit.record(actor, { action: "catalog.delete", entityType: "Catalog", entityId: id, before: catalogSnapshot(c) });
    });
  }

  /* ── categories ── */

  listCategories() {
    return this.repos.categories.list();
  }

  async createCategory(actor: ActorContext, input: CreateCategoryInput): Promise<Category> {
    const key = nameKey(input.name);
    if (await this.repos.categories.nameExists(key)) throw CatalogErrors.categoryNameTaken(input.name);
    return this.d.uow.transaction(async (r) => {
      const c = await r.categories.create({ name: input.name.trim(), nameKey: key });
      await r.audit.record(actor, { action: "category.create", entityType: "Category", entityId: c.id, after: categorySnapshot(c) });
      return c;
    });
  }

  async updateCategory(actor: ActorContext, id: string, input: UpdateCategoryInput): Promise<Category> {
    const before = await this.repos.categories.findById(id);
    if (!before) throw new NotFoundError("Category");
    let key: string | undefined;
    if (input.name !== undefined) {
      key = nameKey(input.name);
      if (await this.repos.categories.nameExists(key, id)) throw CatalogErrors.categoryNameTaken(input.name);
    }
    return this.d.uow.transaction(async (r) => {
      const c = await r.categories.update(id, {
        ...(input.name !== undefined ? { name: input.name.trim(), nameKey: key } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      });
      await r.audit.record(actor, { action: "category.update", entityType: "Category", entityId: id, before: categorySnapshot(before), after: categorySnapshot(c) });
      return c;
    });
  }

  async deleteCategory(actor: ActorContext, id: string): Promise<void> {
    await this.d.uow.transaction(async (r) => {
      const c = await r.categories.findById(id);
      if (!c) throw new NotFoundError("Category");
      assertDeletable(c.productCount, "category");
      await r.categories.delete(id);
      await r.audit.record(actor, { action: "category.delete", entityType: "Category", entityId: id, before: categorySnapshot(c) });
    });
  }

  /* ── units ── */

  listUnits() {
    return this.repos.units.list();
  }

  async createUnit(actor: ActorContext, input: CreateUnitInput): Promise<Unit> {
    if (await this.repos.units.codeExists(input.code)) throw CatalogErrors.unitCodeTaken(input.code);
    return this.d.uow.transaction(async (r) => {
      const u = await r.units.create({ code: input.code, name: input.name.trim() });
      await r.audit.record(actor, { action: "unit.create", entityType: "Unit", entityId: u.id, after: unitSnapshot(u) });
      return u;
    });
  }

  async updateUnit(actor: ActorContext, id: string, input: UpdateUnitInput): Promise<Unit> {
    const before = await this.repos.units.findById(id);
    if (!before) throw new NotFoundError("Unit");
    return this.d.uow.transaction(async (r) => {
      const u = await r.units.update(id, { ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) });
      await r.audit.record(actor, { action: "unit.update", entityType: "Unit", entityId: id, before: unitSnapshot(before), after: unitSnapshot(u) });
      return u;
    });
  }
}
