import type { ActorContext, AuditService } from "@/modules/audit/application/audit.service";
import type { ListQuery, SortField } from "@/shared/pagination/list-query";
import type { PermissionLevel } from "@/shared/rbac/levels";
import type { Catalog, Category, Product, ProductFields, ProductPhoto, ProductStatus, Unit } from "../domain/types";
import type { ProductFilters } from "./dto";

/** The caller of a catalog use-case. */
export interface CatalogActor extends ActorContext {
  actorId: string;
  /** Role's `catalog` level. */
  level: PermissionLevel;
  /** Role flag seeCost: may read and write purchaseCost. */
  canSeeCost: boolean;
}

export interface CatalogRepository {
  list(): Promise<Catalog[]>;
  findById(id: string): Promise<Catalog | null>;
  nameExists(nameKey: string, exceptId?: string): Promise<boolean>;
  create(data: { name: string; nameKey: string; description: string | null; sortOrder: number }): Promise<Catalog>;
  update(id: string, data: Partial<{ name: string; nameKey: string; description: string | null; sortOrder: number; isActive: boolean }>): Promise<Catalog>;
  delete(id: string): Promise<void>;
  nextSortOrder(): Promise<number>;
}

export interface CategoryRepository {
  list(): Promise<Category[]>;
  findById(id: string): Promise<Category | null>;
  nameExists(nameKey: string, exceptId?: string): Promise<boolean>;
  create(data: { name: string; nameKey: string }): Promise<Category>;
  update(id: string, data: Partial<{ name: string; nameKey: string; isActive: boolean }>): Promise<Category>;
  delete(id: string): Promise<void>;
}

export interface UnitRepository {
  list(): Promise<Unit[]>;
  findById(id: string): Promise<Unit | null>;
  codeExists(code: string): Promise<boolean>;
  create(data: { code: string; name: string }): Promise<Unit>;
  update(id: string, data: Partial<{ name: string; isActive: boolean }>): Promise<Unit>;
}

export interface ProductRepository {
  findById(id: string): Promise<Product | null>;
  findByCode(code: string): Promise<Product | null>;
  findByBarcode(barcode: string): Promise<Product | null>;
  codeExists(code: string): Promise<boolean>;
  barcodeExists(barcode: string, exceptId?: string): Promise<boolean>;
  /** Which of `codes` / `barcodes` already exist (for imports). */
  existingCodes(codes: string[]): Promise<string[]>;
  existingBarcodes(barcodes: string[]): Promise<string[]>;
  list(query: ListQuery<ProductFilters>): Promise<{ items: Product[]; total: number }>;
  /** Unpaginated (capped) list for exports. */
  listAll(opts: { filters: ProductFilters; q?: string; sort: SortField[]; limit: number }): Promise<Product[]>;
  create(data: ProductFields & { code: string; status: ProductStatus; createdById: string }): Promise<Product>;
  update(id: string, data: Partial<ProductFields> & { updatedById: string }): Promise<Product>;
  setStatus(id: string, status: ProductStatus, actorId: string): Promise<Product>;
}

export interface PhotoRepository {
  listForProduct(productId: string): Promise<ProductPhoto[]>;
  findById(productId: string, photoId: string): Promise<ProductPhoto | null>;
  create(data: Omit<ProductPhoto, "createdAt"> & { createdById: string }): Promise<ProductPhoto>;
  delete(photoId: string): Promise<void>;
  /** Rewrites sortOrder to match `orderedIds` and marks `primaryId` as the only primary. */
  arrange(productId: string, orderedIds: string[], primaryId: string | null): Promise<void>;
}

/** Read-only lookup of supplier records (owned by purchasing) for the default-supplier link. */
export interface SupplierLookup {
  findById(id: string): Promise<{ id: string; name: string; isActive: boolean } | null>;
  /** By normalised name (trimmed, single spaces, lower-case). */
  findByNameKey(nameKey: string): Promise<{ id: string; name: string; isActive: boolean } | null>;
}

export interface CatalogRepos {
  catalogs: CatalogRepository;
  suppliers: SupplierLookup;
  categories: CategoryRepository;
  units: UnitRepository;
  products: ProductRepository;
  photos: PhotoRepository;
  audit: AuditService;
}

export interface CatalogUnitOfWork {
  repos: CatalogRepos;
  transaction<T>(fn: (repos: CatalogRepos) => Promise<T>, opts?: { timeoutMs?: number }): Promise<T>;
}

/** Private object storage (see shared/storage). */
export interface FileStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Uint8Array; contentType: string } | null>;
  delete(keys: string[]): Promise<void>;
}

export interface ImageProcessor {
  process(bytes: Uint8Array, label: string): Promise<{ original: Uint8Array; contentType: string; ext: string; width: number; height: number; thumbnail: Uint8Array }>;
}

/** A spreadsheet row: 1-based sheet row number plus cell values keyed by normalised header. */
export interface SheetRow {
  rowNumber: number;
  values: Record<string, string | number | boolean | null>;
}

export interface ReferenceLists {
  catalogs: string[];
  categories: string[];
  units: string[];
}

export interface Spreadsheet {
  readRows(bytes: Uint8Array): Promise<SheetRow[]>;
  buildTemplate(lists: ReferenceLists, includeCost: boolean): Promise<Uint8Array>;
  buildExport(products: Product[], includeCost: boolean): Promise<Uint8Array>;
}
