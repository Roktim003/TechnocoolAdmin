import { z, emptyToUndefined } from "@/shared/validation/zod";
import { listQuerySchema } from "@/shared/pagination/list-query";
import { MoneySchema, QuantitySchema } from "@/shared/money/money";
import { normalizeCode, PRODUCT_CODE_PATTERN, UNIT_CODE_PATTERN } from "../domain/rules";

/* ───────────────────────────── field helpers ───────────────────────────── */

/** Optional text: "" and whitespace become null. */
const text = (max: number) =>
  z.preprocess((v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v), z.string().max(max, `At most ${max} characters.`).nullable().optional());

const nullableId = z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable().optional());
/** Optional value where "" means "clear it" (null). */
const nullable = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => (v === "" ? null : v), schema.nullable().optional());

const booleanLike = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const s = v.trim().toLowerCase();
  return ["true", "yes", "y", "1"].includes(s) ? true : ["false", "no", "n", "0", ""].includes(s) ? false : v;
}, z.boolean());

const upper = (v: unknown) => (typeof v === "string" ? v.trim().toUpperCase() : v);

export const ProductCodeSchema = z
  .string()
  .transform(normalizeCode)
  .pipe(z.string().regex(PRODUCT_CODE_PATTERN, "Code must be 2–31 characters: A–Z, 0–9 and '-', starting with a letter or digit."))
  .openapi({ example: "LG-S18ET", description: "Stored upper-case. Immutable after creation." });

export const ProductStatusSchema = z.preprocess(upper, z.enum(["ACTIVE", "DISCONTINUED"])).openapi({ type: "string", enum: ["ACTIVE", "DISCONTINUED"] });
export const ProductSourceSchema = z.preprocess(upper, z.enum(["IMPORTED", "LOCAL"])).openapi({ type: "string", enum: ["IMPORTED", "LOCAL"] });

/* ───────────────────────────── products ───────────────────────────── */

const productFieldShape = {
  name: z.string().trim().min(1, "Item name is required.").max(200).openapi({ example: "LG Dual Inverter Split AC 1.5 Ton" }),
  catalogId: z.string({ required_error: "Choose a brand." }).uuid("Choose a brand."),
  model: text(100).openapi({ example: "S4-Q18KL3AA" }),
  categoryId: z.string({ required_error: "Choose a category." }).uuid("Choose a category."),
  unitId: z.string({ required_error: "Choose a unit." }).uuid("Choose a unit."),
  purchaseCost: MoneySchema.optional().openapi({ description: "Sensitive: only roles with seeCost may read or set it. Required for those roles on create." }),
  sellingPrice: MoneySchema,
  purchaseUnitId: nullableId.openapi({ description: "Unit the product is bought in (e.g. roll); requires purchaseUnitFactor" }),
  purchaseUnitFactor: nullable(QuantitySchema).openapi({ description: "Base units per purchase unit (e.g. 50 when 1 roll = 50 m)" }),
  minStockLevel: nullable(QuantitySchema),
  barcode: z
    .preprocess((v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v), z.string().max(64).regex(/^[\x21-\x7E]+$/, "Barcode may only contain printable characters without spaces.").nullable().optional())
    .openapi({ description: "Unique when present" }),
  trackSerial: booleanLike.optional(),
  warrantyMonths: nullable(z.coerce.number().int("Whole months only.").min(0).max(600)),
  defaultSupplierId: nullableId.openapi({ description: "Default supplier (see /suppliers)" }),
  defaultSupplierName: text(200).openapi({ description: "Legacy free text; ignored when defaultSupplierId is set" }),
  source: nullable(ProductSourceSchema),
  countryOfOrigin: text(100),
  hsCode: text(20),
  capacity: text(100).openapi({ example: "1.5 Ton / 18,000 BTU" }),
  refrigerant: text(50).openapi({ example: "R32" }),
  powerSupply: text(100).openapi({ example: "220-240V / 1Ph / 50Hz" }),
  dimensionsWeight: text(200),
  specifications: text(5000),
};

export const CreateProductSchema = z
  .object({ code: ProductCodeSchema, ...productFieldShape, status: ProductStatusSchema.optional() })
  .strict()
  .openapi("CreateProductRequest");

export const UpdateProductSchema = z
  .object({
    code: z.string().optional().openapi({ description: "May be sent but must equal the current code (422 CODE_IMMUTABLE otherwise)" }),
    name: productFieldShape.name.optional(),
    catalogId: productFieldShape.catalogId.optional(),
    model: productFieldShape.model,
    categoryId: productFieldShape.categoryId.optional(),
    unitId: productFieldShape.unitId.optional(),
    purchaseCost: productFieldShape.purchaseCost,
    sellingPrice: productFieldShape.sellingPrice.optional(),
    purchaseUnitId: productFieldShape.purchaseUnitId,
    purchaseUnitFactor: productFieldShape.purchaseUnitFactor,
    minStockLevel: productFieldShape.minStockLevel,
    barcode: productFieldShape.barcode,
    trackSerial: productFieldShape.trackSerial,
    warrantyMonths: productFieldShape.warrantyMonths,
    defaultSupplierId: productFieldShape.defaultSupplierId,
    defaultSupplierName: productFieldShape.defaultSupplierName,
    source: productFieldShape.source,
    countryOfOrigin: productFieldShape.countryOfOrigin,
    hsCode: productFieldShape.hsCode,
    capacity: productFieldShape.capacity,
    refrigerant: productFieldShape.refrigerant,
    powerSupply: productFieldShape.powerSupply,
    dimensionsWeight: productFieldShape.dimensionsWeight,
    specifications: productFieldShape.specifications,
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update." })
  .openapi("UpdateProductRequest");

export const ProductFilterShape = {
  catalogId: emptyToUndefined(z.string().uuid()),
  categoryId: emptyToUndefined(z.string().uuid()),
  status: emptyToUndefined(ProductStatusSchema).openapi({ description: "ACTIVE | DISCONTINUED (case-insensitive)" }),
  source: emptyToUndefined(ProductSourceSchema).openapi({ description: "IMPORTED | LOCAL (case-insensitive)" }),
  trackSerial: emptyToUndefined(booleanLike).openapi({ type: "boolean" }),
};

export const PRODUCT_SORT_FIELDS = ["name", "code", "createdAt", "sellingPrice"] as const;

export const ProductListQuerySchema = listQuerySchema({ sortFields: PRODUCT_SORT_FIELDS, defaultSort: "name", filters: ProductFilterShape });

export type ProductFilters = {
  catalogId?: string;
  categoryId?: string;
  status?: "ACTIVE" | "DISCONTINUED";
  source?: "IMPORTED" | "LOCAL";
  trackSerial?: boolean;
};

export const CheckCodeQuerySchema = z.object({ code: z.string().max(64).default("") });

export const PhotoVariantQuerySchema = z.object({ variant: z.enum(["original", "thumb"]).default("original") });

export const UpdatePhotoSchema = z
  .object({
    isPrimary: z.literal(true).optional().openapi({ description: "Make this the primary photo" }),
    sortOrder: z.number().int().min(0).max(9).optional().openapi({ description: "New 0-based position" }),
  })
  .strict()
  .refine((v) => v.isPrimary !== undefined || v.sortOrder !== undefined, { message: "Provide isPrimary or sortOrder." })
  .openapi("UpdatePhotoRequest");

/* ───────────────────────────── catalogs / categories / units ───────────────────────────── */

const RefName = z.string().trim().min(1, "Name is required.").max(60);

export const CreateCatalogSchema = z
  .object({ name: RefName.openapi({ example: "Gree" }), description: text(200), sortOrder: z.number().int().min(0).max(9999).optional() })
  .strict()
  .openapi("CreateCatalogRequest");
export const UpdateCatalogSchema = z
  .object({ name: RefName.optional(), description: text(200), sortOrder: z.number().int().min(0).max(9999).optional(), isActive: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update." })
  .openapi("UpdateCatalogRequest");

export const CreateCategorySchema = z.object({ name: RefName.openapi({ example: "Ventilation fan" }) }).strict().openapi("CreateCategoryRequest");
export const UpdateCategorySchema = z
  .object({ name: RefName.optional(), isActive: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update." })
  .openapi("UpdateCategoryRequest");

export const CreateUnitSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toLowerCase()
      .regex(UNIT_CODE_PATTERN, "Code must be 1–10 lower-case letters/digits, starting with a letter.")
      .openapi({ example: "pair" }),
    name: RefName.openapi({ example: "Pair" }),
  })
  .strict()
  .openapi("CreateUnitRequest");
export const UpdateUnitSchema = z
  .object({ name: RefName.optional(), isActive: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update." })
  .openapi("UpdateUnitRequest");

/* ───────────────────────────── import ───────────────────────────── */

export const ImportModeSchema = z.enum(["validate", "commit"]);
export type ImportMode = z.infer<typeof ImportModeSchema>;

export interface ImportRowError {
  row: number;
  field: string;
  message: string;
}

export interface ImportResult {
  mode: ImportMode;
  totalRows: number;
  validRows: number;
  errors: ImportRowError[];
  /** True only in commit mode when every row was valid and all products were created. */
  committed: boolean;
  createdCount: number;
}

/* ───────────────────────────── response DTOs ───────────────────────────── */

const Ref = z.object({ id: z.string().uuid(), name: z.string() });
const UnitRef = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });

export const PhotoSchema = z
  .object({
    id: z.string().uuid(),
    isPrimary: z.boolean(),
    sortOrder: z.number().int(),
    contentType: z.string(),
    sizeBytes: z.number().int(),
    width: z.number().int(),
    height: z.number().int(),
    url: z.string().openapi({ description: "Authenticated URL of the original" }),
    thumbnailUrl: z.string().openapi({ description: "Authenticated URL of the 400px WebP thumbnail" }),
    createdAt: z.string().datetime(),
  })
  .openapi("ProductPhoto");

export const ProductSummarySchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    model: z.string().nullable(),
    catalog: Ref,
    category: Ref,
    unit: UnitRef,
    sellingPrice: z.string().openapi({ example: "85000.00" }),
    purchaseCost: z.string().optional().openapi({ example: "61000.00", description: "Present only for roles with seeCost" }),
    status: z.enum(["ACTIVE", "DISCONTINUED"]),
    source: z.enum(["IMPORTED", "LOCAL"]).nullable(),
    trackSerial: z.boolean(),
    barcode: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
    updatedAt: z.string().datetime(),
  })
  .openapi("ProductSummary");

export const ProductSchema = ProductSummarySchema.extend({
  purchaseUnit: UnitRef.nullable(),
  purchaseUnitFactor: z.string().nullable(),
  minStockLevel: z.string().nullable(),
  warrantyMonths: z.number().int().nullable(),
  defaultSupplierId: z.string().uuid().nullable(),
  defaultSupplier: Ref.nullable(),
  defaultSupplierName: z.string().nullable().openapi({ description: "The linked supplier's name, or the legacy text" }),
  countryOfOrigin: z.string().nullable(),
  hsCode: z.string().nullable(),
  capacity: z.string().nullable(),
  refrigerant: z.string().nullable(),
  powerSupply: z.string().nullable(),
  dimensionsWeight: z.string().nullable(),
  specifications: z.string().nullable(),
  discontinuedAt: z.string().datetime().nullable(),
  photos: z.array(PhotoSchema),
  createdBy: Ref.nullable(),
  updatedBy: Ref.nullable(),
  createdAt: z.string().datetime(),
}).openapi("Product");

export const CatalogSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    isActive: z.boolean(),
    sortOrder: z.number().int(),
    productCount: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("Catalog");

export const CategorySchema = z
  .object({ id: z.string().uuid(), name: z.string(), isActive: z.boolean(), productCount: z.number().int(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() })
  .openapi("Category");

export const UnitSchema = z
  .object({ id: z.string().uuid(), code: z.string(), name: z.string(), isActive: z.boolean(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() })
  .openapi("Unit");

export const CheckCodeResponseSchema = z
  .object({ code: z.string(), valid: z.boolean(), available: z.boolean() })
  .openapi("CheckCodeResponse");

export const ImportJobSchema = z
  .object({
    jobId: z.string(),
    mode: ImportModeSchema,
    status: z.enum(["queued", "processing", "completed", "failed"]),
    fileName: z.string().nullable(),
    result: z
      .object({
        totalRows: z.number().int(),
        validRows: z.number().int(),
        committed: z.boolean(),
        createdCount: z.number().int(),
        errors: z.array(z.object({ row: z.number().int(), field: z.string(), message: z.string() })),
      })
      .nullable(),
    failedReason: z.string().nullable(),
  })
  .openapi("ImportJob");

export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
export type CreateCatalogInput = z.infer<typeof CreateCatalogSchema>;
export type UpdateCatalogInput = z.infer<typeof UpdateCatalogSchema>;
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;
export type CreateUnitInput = z.infer<typeof CreateUnitSchema>;
export type UpdateUnitInput = z.infer<typeof UpdateUnitSchema>;
export type ProductDto = z.infer<typeof ProductSchema>;
export type ProductSummaryDto = z.infer<typeof ProductSummarySchema>;
export type PhotoDto = z.infer<typeof PhotoSchema>;
export type CatalogDto = z.infer<typeof CatalogSchema>;
export type CategoryDto = z.infer<typeof CategorySchema>;
export type UnitDto = z.infer<typeof UnitSchema>;
export type ImportJobDto = z.infer<typeof ImportJobSchema>;
