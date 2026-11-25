import { CatalogErrors } from "./errors";

export const PRODUCT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,30}$/;
export const MAX_PHOTOS_PER_PRODUCT = 10;
export const UNIT_CODE_PATTERN = /^[a-z][a-z0-9.]{0,9}$/;

/** What a product gets when the form leaves brand, category or unit empty (created by the seed). */
export const DEFAULT_CATALOG_NAME = "Other";
export const DEFAULT_CATEGORY_NAME = "Other";
export const DEFAULT_UNIT_CODE = "pcs";

/**
 * Candidate codes for a product created without one, made from its model number: upper-case,
 * anything other than A–Z / 0–9 becomes "-" ("S4 Q18/KL3AA" → "S4-Q18-KL3AA"), then "-2", "-3", …
 * for the next tries. A model too short for a code is prefixed with "ITEM-".
 */
export function codeCandidates(model: string, count = 50): string[] {
  let base = model.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (base.length < 2) base = `ITEM-${base || "X"}`.replace(/-+$/, "");
  base = base.slice(0, 31).replace(/-+$/, "");
  const out = [base];
  for (let n = 2; out.length < count; n++) {
    const suffix = `-${n}`;
    out.push(base.slice(0, 31 - suffix.length).replace(/-+$/, "") + suffix);
  }
  return out;
}

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
