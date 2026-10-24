import { CatalogErrors } from "./errors";

export const PRODUCT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,30}$/;
export const MAX_PHOTOS_PER_PRODUCT = 10;
export const UNIT_CODE_PATTERN = /^[a-z][a-z0-9.]{0,9}$/;

/** Codes are stored upper-case and trimmed. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export function isValidCode(code: string): boolean {
  return PRODUCT_CODE_PATTERN.test(code);
}

/** Names compare case- and whitespace-insensitively. */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** A PATCH may repeat the current code, but never change it. */
export function assertCodeUnchanged(current: string, requested: string | undefined): void {
  if (requested !== undefined && normalizeCode(requested) !== current) throw CatalogErrors.codeImmutable();
}

export function assertActiveRef(ref: { isActive: boolean; name: string } | null, kind: "catalog" | "category" | "unit"): void {
  if (!ref) {
    throw kind === "catalog" ? CatalogErrors.unknownCatalog() : kind === "category" ? CatalogErrors.unknownCategory() : CatalogErrors.unknownUnit();
  }
  if (!ref.isActive) {
    throw kind === "catalog" ? CatalogErrors.inactiveCatalog(ref.name) : kind === "category" ? CatalogErrors.inactiveCategory(ref.name) : CatalogErrors.inactiveUnit(ref.name);
  }
}

/** Purchase unit and factor come as a pair; the factor (decimal string) must be > 0. */
export function assertPurchaseUnit(unitId: string | null, factor: string | null): void {
  if ((unitId === null) !== (factor === null)) throw CatalogErrors.purchaseUnitIncomplete();
  if (factor !== null && !/[1-9]/.test(factor)) throw CatalogErrors.purchaseFactorInvalid();
}

export function assertCanAddPhotos(existing: number, adding: number): void {
  if (existing + adding > MAX_PHOTOS_PER_PRODUCT) throw CatalogErrors.photoLimit(MAX_PHOTOS_PER_PRODUCT);
}

export function assertDeletable(productCount: number, kind: "catalog" | "category"): void {
  if (productCount > 0) throw kind === "catalog" ? CatalogErrors.catalogInUse(productCount) : CatalogErrors.categoryInUse(productCount);
}
