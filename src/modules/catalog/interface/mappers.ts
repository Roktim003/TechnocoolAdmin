import type { Catalog, Category, Product, ProductPhoto, Unit } from "../domain/types";
import type { CatalogDto, CategoryDto, PhotoDto, ProductDto, ProductSummaryDto, UnitDto } from "../application/dto";

const iso = (d: Date) => d.toISOString();

export const photoUrl = (productId: string, photoId: string, variant: "original" | "thumb" = "original") =>
  `/api/v1/products/${productId}/photos/${photoId}/file${variant === "thumb" ? "?variant=thumb" : ""}`;

export function toPhotoDto(p: ProductPhoto): PhotoDto {
  return {
    id: p.id,
    isPrimary: p.isPrimary,
    sortOrder: p.sortOrder,
    contentType: p.contentType,
    sizeBytes: p.sizeBytes,
    width: p.width,
    height: p.height,
    url: photoUrl(p.productId, p.id),
    thumbnailUrl: photoUrl(p.productId, p.id, "thumb"),
    createdAt: iso(p.createdAt),
  };
}

/** purchaseCost is always mapped; the route wrapper strips it for roles without seeCost. */
export function toProductSummaryDto(p: Product): ProductSummaryDto {
  const primary = p.photos.find((ph) => ph.isPrimary) ?? p.photos[0];
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    model: p.model,
    catalog: { id: p.catalog.id, name: p.catalog.name },
    category: { id: p.category.id, name: p.category.name },
    unit: p.unit,
    sellingPrice: p.sellingPrice,
    purchaseCost: p.purchaseCost,
    status: p.status,
    source: p.source,
    trackSerial: p.trackSerial,
    barcode: p.barcode,
    thumbnailUrl: primary ? photoUrl(p.id, primary.id, "thumb") : null,
    updatedAt: iso(p.updatedAt),
  };
}

export function toProductDto(p: Product): ProductDto {
  return {
    ...toProductSummaryDto(p),
    purchaseUnit: p.purchaseUnit,
    purchaseUnitFactor: p.purchaseUnitFactor,
    minStockLevel: p.minStockLevel,
    warrantyMonths: p.warrantyMonths,
    defaultSupplierId: p.defaultSupplierId,
    defaultSupplier: p.defaultSupplier,
    defaultSupplierName: p.defaultSupplier?.name ?? p.defaultSupplierName,
    countryOfOrigin: p.countryOfOrigin,
    hsCode: p.hsCode,
    capacity: p.capacity,
    refrigerant: p.refrigerant,
    powerSupply: p.powerSupply,
    dimensionsWeight: p.dimensionsWeight,
    specifications: p.specifications,
    discontinuedAt: p.discontinuedAt ? iso(p.discontinuedAt) : null,
    photos: p.photos.map(toPhotoDto),
    createdBy: p.createdBy,
    updatedBy: p.updatedBy,
    createdAt: iso(p.createdAt),
  };
}

export function toCatalogDto(c: Catalog): CatalogDto {
  return { id: c.id, name: c.name, description: c.description, isActive: c.isActive, sortOrder: c.sortOrder, productCount: c.productCount, createdAt: iso(c.createdAt), updatedAt: iso(c.updatedAt) };
}

export function toCategoryDto(c: Category): CategoryDto {
  return { id: c.id, name: c.name, isActive: c.isActive, productCount: c.productCount, createdAt: iso(c.createdAt), updatedAt: iso(c.updatedAt) };
}

export function toUnitDto(u: Unit): UnitDto {
  return { id: u.id, code: u.code, name: u.name, isActive: u.isActive, createdAt: iso(u.createdAt), updatedAt: iso(u.updatedAt) };
}
