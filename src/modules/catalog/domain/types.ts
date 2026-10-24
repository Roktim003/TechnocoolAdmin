/** Catalog domain types. Money and quantities are decimal strings (never floats). */

export type ProductStatus = "ACTIVE" | "DISCONTINUED";
export type ProductSource = "IMPORTED" | "LOCAL";

export interface Catalog {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  name: string;
  isActive: boolean;
  productCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Unit {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductPhoto {
  id: string;
  productId: string;
  storageKey: string;
  thumbnailKey: string;
  contentType: string;
  sizeBytes: number;
  width: number;
  height: number;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: Date;
}

/** Writable product fields (everything except identity, status and audit columns). */
export interface ProductFields {
  name: string;
  catalogId: string;
  model: string | null;
  categoryId: string;
  unitId: string;
  purchaseCost: string;
  sellingPrice: string;
  purchaseUnitId: string | null;
  purchaseUnitFactor: string | null;
  minStockLevel: string | null;
  barcode: string | null;
  trackSerial: boolean;
  warrantyMonths: number | null;
  /** Default supplier (purchasing): low-stock "Create PO" groups by it. */
  defaultSupplierId: string | null;
  /** Legacy free text, kept when no supplier record matches it. */
  defaultSupplierName: string | null;
  source: ProductSource | null;
  countryOfOrigin: string | null;
  hsCode: string | null;
  capacity: string | null;
  refrigerant: string | null;
  powerSupply: string | null;
  dimensionsWeight: string | null;
  specifications: string | null;
}

export interface Product extends ProductFields {
  id: string;
  code: string;
  status: ProductStatus;
  discontinuedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  catalog: { id: string; name: string; isActive: boolean };
  category: { id: string; name: string; isActive: boolean };
  unit: { id: string; code: string; name: string };
  purchaseUnit: { id: string; code: string; name: string } | null;
  defaultSupplier: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  updatedBy: { id: string; name: string } | null;
  photos: ProductPhoto[];
}
