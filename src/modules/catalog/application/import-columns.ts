/**
 * Columns of the product import template (and the export). `key` is the CreateProductSchema
 * field; reference columns hold names/codes that the importer resolves to ids.
 */
export interface ImportColumn {
  key: string;
  header: string;
  required: boolean;
  /** Only present when the user may see purchase cost. */
  costOnly?: boolean;
  width: number;
  example: string | number;
  /** Data-validation list on the Lists sheet. */
  list?: "catalogs" | "categories" | "units" | "source" | "yesno";
}

export const IMPORT_COLUMNS: ImportColumn[] = [
  { key: "code", header: "Code / SKU", required: true, width: 18, example: "LG-S18ET" },
  { key: "name", header: "Item name", required: true, width: 36, example: "LG Dual Inverter Split AC 1.5 Ton" },
  { key: "catalog", header: "Brand (catalog)", required: true, width: 16, example: "LG", list: "catalogs" },
  { key: "model", header: "Model number", required: false, width: 18, example: "S4-Q18KL3AA" },
  { key: "category", header: "Category", required: true, width: 18, example: "Split AC", list: "categories" },
  { key: "unit", header: "Unit", required: true, width: 10, example: "set", list: "units" },
  { key: "purchaseCost", header: "Purchase cost (BDT)", required: true, costOnly: true, width: 18, example: 61000 },
  { key: "sellingPrice", header: "Selling price (BDT)", required: true, width: 18, example: 85000 },
  { key: "purchaseUnit", header: "Purchase unit", required: false, width: 14, example: "", list: "units" },
  { key: "purchaseUnitFactor", header: "Purchase unit factor", required: false, width: 18, example: "" },
  { key: "minStockLevel", header: "Min stock level", required: false, width: 14, example: 5 },
  { key: "barcode", header: "Barcode", required: false, width: 18, example: "" },
  { key: "trackSerial", header: "Track serial numbers", required: false, width: 18, example: "Yes", list: "yesno" },
  { key: "warrantyMonths", header: "Warranty (months)", required: false, width: 16, example: 24 },
  { key: "defaultSupplierName", header: "Default supplier", required: false, width: 22, example: "LG Electronics Bangladesh" },
  { key: "source", header: "Source", required: false, width: 12, example: "Imported", list: "source" },
  { key: "countryOfOrigin", header: "Country of origin", required: false, width: 16, example: "Thailand" },
  { key: "hsCode", header: "HS code", required: false, width: 12, example: "8415.10" },
  { key: "capacity", header: "Capacity", required: false, width: 20, example: "1.5 Ton / 18,000 BTU" },
  { key: "refrigerant", header: "Refrigerant", required: false, width: 12, example: "R32" },
  { key: "powerSupply", header: "Power supply", required: false, width: 20, example: "220-240V / 1Ph / 50Hz" },
  { key: "dimensionsWeight", header: "Dimensions / weight", required: false, width: 24, example: "" },
  { key: "specifications", header: "Specifications / notes", required: false, width: 40, example: "" },
];

/** "Purchase cost (BDT) *" → "purchasecostbdt". Used to match headers regardless of case, "*" and spacing. */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_EXPORT_ROWS = 10_000;
