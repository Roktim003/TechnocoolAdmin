import { Prisma, type PrismaClient } from "@prisma/client";
import type { Db } from "@/shared/db/prisma";
import { toOrderBy } from "@/shared/pagination/list-query";
import { AuditService } from "@/modules/audit/application/audit.service";
import { prismaAuditRepository } from "@/modules/audit/infrastructure/prisma-audit.repository";
import type {
  CatalogRepos,
  CatalogRepository,
  CatalogUnitOfWork,
  CategoryRepository,
  PhotoRepository,
  ProductRepository,
  UnitRepository,
} from "../application/ports";
import type { ProductFilters } from "../application/dto";
import type { Product, ProductFields } from "../domain/types";

const dec = (v: string | null | undefined) => (v === null || v === undefined ? v : new Prisma.Decimal(v));
const money = (v: Prisma.Decimal) => v.toFixed(2);
const qty = (v: Prisma.Decimal | null) => (v === null ? null : v.toString());

/* ─────────────── catalogs / categories / units ─────────────── */

const withCount = { _count: { select: { products: true } } } as const;

function catalogRepository(db: Db): CatalogRepository {
  const map = ({ _count, nameKey: _k, ...c }: Prisma.CatalogGetPayload<{ include: typeof withCount }>) => ({ ...c, productCount: _count.products });
  return {
    async list() {
      return (await db.catalog.findMany({ include: withCount, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })).map(map);
    },
    async findById(id) {
      const c = await db.catalog.findUnique({ where: { id }, include: withCount });
      return c ? map(c) : null;
    },
    async nameExists(nameKey, exceptId) {
      return (await db.catalog.count({ where: { nameKey, ...(exceptId ? { id: { not: exceptId } } : {}) } })) > 0;
    },
    async create(data) {
      return map(await db.catalog.create({ data, include: withCount }));
    },
    async update(id, data) {
      return map(await db.catalog.update({ where: { id }, data, include: withCount }));
    },
    async delete(id) {
      await db.catalog.delete({ where: { id } });
    },
    async nextSortOrder() {
      const max = await db.catalog.aggregate({ _max: { sortOrder: true } });
      return (max._max.sortOrder ?? 0) + 1;
    },
  };
}

function categoryRepository(db: Db): CategoryRepository {
  const map = ({ _count, nameKey: _k, ...c }: Prisma.CategoryGetPayload<{ include: typeof withCount }>) => ({ ...c, productCount: _count.products });
  return {
    async list() {
      return (await db.category.findMany({ include: withCount, orderBy: { name: "asc" } })).map(map);
    },
    async findById(id) {
      const c = await db.category.findUnique({ where: { id }, include: withCount });
      return c ? map(c) : null;
    },
    async nameExists(nameKey, exceptId) {
      return (await db.category.count({ where: { nameKey, ...(exceptId ? { id: { not: exceptId } } : {}) } })) > 0;
    },
    async create(data) {
      return map(await db.category.create({ data, include: withCount }));
    },
    async update(id, data) {
      return map(await db.category.update({ where: { id }, data, include: withCount }));
    },
    async delete(id) {
      await db.category.delete({ where: { id } });
    },
  };
}

function unitRepository(db: Db): UnitRepository {
  return {
    list: () => db.unit.findMany({ orderBy: { code: "asc" } }),
    findById: (id) => db.unit.findUnique({ where: { id } }),
    async codeExists(code) {
      return (await db.unit.count({ where: { code } })) > 0;
    },
    create: (data) => db.unit.create({ data }),
    update: (id, data) => db.unit.update({ where: { id }, data }),
  };
}

/* ─────────────── products ─────────────── */

const productInclude = {
  catalog: { select: { id: true, name: true, isActive: true } },
  category: { select: { id: true, name: true, isActive: true } },
  unit: { select: { id: true, code: true, name: true } },
  purchaseUnit: { select: { id: true, code: true, name: true } },
  defaultSupplier: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
  photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

function toProduct(row: ProductRow): Product {
  const { createdById: _c, updatedById: _u, ...rest } = row;
  return {
    ...rest,
    purchaseCost: money(row.purchaseCost),
    sellingPrice: money(row.sellingPrice),
    purchaseUnitFactor: qty(row.purchaseUnitFactor),
    minStockLevel: qty(row.minStockLevel),
  };
}

function toData(f: Partial<ProductFields>) {
  return {
    ...f,
    ...(f.purchaseCost !== undefined ? { purchaseCost: dec(f.purchaseCost) } : {}),
    ...(f.sellingPrice !== undefined ? { sellingPrice: dec(f.sellingPrice) } : {}),
    ...(f.purchaseUnitFactor !== undefined ? { purchaseUnitFactor: dec(f.purchaseUnitFactor) } : {}),
    ...(f.minStockLevel !== undefined ? { minStockLevel: dec(f.minStockLevel) } : {}),
  } as Prisma.ProductUncheckedUpdateInput;
}

function productWhere(filters: ProductFilters, q?: string): Prisma.ProductWhereInput {
  return {
    ...(filters.catalogId ? { catalogId: filters.catalogId } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.trackSerial !== undefined ? { trackSerial: filters.trackSerial } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
            { model: { contains: q, mode: "insensitive" } },
            { barcode: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

function productRepository(db: Db): ProductRepository {
  return {
    async findById(id) {
      const r = await db.product.findUnique({ where: { id }, include: productInclude });
      return r ? toProduct(r) : null;
    },
    async findByCode(code) {
      const r = await db.product.findUnique({ where: { code }, include: productInclude });
      return r ? toProduct(r) : null;
    },
    async findByBarcode(barcode) {
      const r = await db.product.findUnique({ where: { barcode }, include: productInclude });
      return r ? toProduct(r) : null;
    },
    async codeExists(code) {
      return (await db.product.count({ where: { code } })) > 0;
    },
    async barcodeExists(barcode, exceptId) {
      return (await db.product.count({ where: { barcode, ...(exceptId ? { id: { not: exceptId } } : {}) } })) > 0;
    },
    async existingCodes(codes) {
      if (!codes.length) return [];
      return (await db.product.findMany({ where: { code: { in: codes } }, select: { code: true } })).map((p) => p.code);
    },
    async existingBarcodes(barcodes) {
      if (!barcodes.length) return [];
      return (await db.product.findMany({ where: { barcode: { in: barcodes } }, select: { barcode: true } })).map((p) => p.barcode!);
    },
    async list(query) {
      const where = productWhere(query.filters, query.q);
      const [rows, total] = await Promise.all([
        db.product.findMany({ where, include: productInclude, orderBy: [...toOrderBy(query.sort), { id: "asc" }], skip: query.skip, take: query.take }),
        db.product.count({ where }),
      ]);
      return { items: rows.map(toProduct), total };
    },
    async listAll({ filters, q, sort, limit }) {
      const rows = await db.product.findMany({ where: productWhere(filters, q), include: productInclude, orderBy: [...toOrderBy(sort), { id: "asc" }], take: limit });
      return rows.map(toProduct);
    },
    async create(data) {
      const r = await db.product.create({ data: toData(data) as Prisma.ProductUncheckedCreateInput, include: productInclude });
      return toProduct(r);
    },
    async update(id, data) {
      return toProduct(await db.product.update({ where: { id }, data: toData(data), include: productInclude }));
    },
    async setStatus(id, status, actorId) {
      return toProduct(
        await db.product.update({
          where: { id },
          data: { status, discontinuedAt: status === "DISCONTINUED" ? new Date() : null, updatedById: actorId },
          include: productInclude,
        }),
      );
    },
  };
}

/* ─────────────── photos ─────────────── */

function photoRepository(db: Db): PhotoRepository {
  return {
    listForProduct: (productId) => db.productPhoto.findMany({ where: { productId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    findById: (productId, photoId) => db.productPhoto.findFirst({ where: { id: photoId, productId } }),
    create: (data) => db.productPhoto.create({ data }),
    async delete(photoId) {
      await db.productPhoto.delete({ where: { id: photoId } });
    },
    async arrange(productId, orderedIds, primaryId) {
      for (const [i, id] of orderedIds.entries()) {
        await db.productPhoto.update({ where: { id }, data: { sortOrder: i, isPrimary: id === primaryId } });
      }
    },
  };
}

export function createCatalogRepos(db: Db): CatalogRepos {
  return {
    catalogs: catalogRepository(db),
    categories: categoryRepository(db),
    units: unitRepository(db),
    products: productRepository(db),
    photos: photoRepository(db),
    suppliers: {
      findById: (id) => db.supplier.findUnique({ where: { id }, select: { id: true, name: true, isActive: true } }),
      findByNameKey: (nameKey) => db.supplier.findUnique({ where: { nameKey }, select: { id: true, name: true, isActive: true } }),
    },
    audit: new AuditService(prismaAuditRepository(db)),
  };
}

export function prismaCatalogUnitOfWork(client: PrismaClient): CatalogUnitOfWork {
  return {
    repos: createCatalogRepos(client),
    transaction: (fn, opts) => client.$transaction((tx) => fn(createCatalogRepos(tx)), { timeout: opts?.timeoutMs ?? 10_000, maxWait: 10_000 }),
  };
}
