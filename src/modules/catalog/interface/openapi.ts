import { z } from "@/shared/validation/zod";
import { AUTHENTICATED, dataOf, errors, IdempotencyHeaders, IdParams, json, listOf, registry } from "@/shared/openapi/registry";
import { AuditLogSchema } from "@/modules/audit/application/dto";
import {
  CatalogSchema,
  CategorySchema,
  CheckCodeQuerySchema,
  CheckCodeResponseSchema,
  CreateCatalogSchema,
  CreateCategorySchema,
  CreateProductSchema,
  CreateUnitSchema,
  ImportJobSchema,
  PhotoSchema,
  PhotoVariantQuerySchema,
  ProductListQuerySchema,
  ProductSchema,
  ProductSummarySchema,
  UnitSchema,
  UpdateCatalogSchema,
  UpdateCategorySchema,
  UpdatePhotoSchema,
  UpdateProductSchema,
  UpdateUnitSchema,
} from "../application/dto";

const body = (schema: z.ZodTypeAny) => ({ body: { required: true, content: { "application/json": { schema } } } });
const multipart = (schema: z.ZodTypeAny) => ({ body: { required: true, content: { "multipart/form-data": { schema } } } });
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const xlsx = (description: string) => ({ description, content: { [XLSX]: { schema: z.string().openapi({ format: "binary" }) } } });
const binaryFile = z.string().openapi({ type: "string", format: "binary" });

const VIEW = "Requires `catalog` ≥ VIEW.";
const CREATE = "Requires `catalog` ≥ CREATE.";
const FULL = "Requires `catalog` = FULL.";
const COST = "`purchaseCost` is removed from the response unless the role has `seeCost`.";
const tags = ["Catalog"];
const PhotoParams = z.object({ id: z.string().uuid(), photoId: z.string().uuid() });

function path(method: "get" | "post" | "patch" | "delete", p: string, summary: string, description: string, extra: Record<string, unknown>) {
  registry.registerPath({ method, path: p, tags, summary, description, security: AUTHENTICATED, ...extra } as Parameters<typeof registry.registerPath>[0]);
}

/* ── Products ── */

path("get", "/products", "List products", `${VIEW} Search \`q\` matches name, code, model and barcode. ${COST}`, {
  request: { query: ProductListQuerySchema.innerType() },
  responses: { 200: json(listOf(ProductSummarySchema)), ...errors(400, 401, 403) },
});

path("post", "/products", "Create a product", `${CREATE} Code is stored upper-case and can't be changed later. Roles without seeCost can't set purchaseCost (it starts at 0). ${COST}`, {
  request: { headers: IdempotencyHeaders, ...body(CreateProductSchema) },
  responses: { 201: json(dataOf(ProductSchema), "Created"), ...errors(400, 401, 403, 409, 422) },
});

path("get", "/products/{id}", "Get a product (with photos)", `${VIEW} ${COST}`, {
  request: { params: IdParams },
  responses: { 200: json(dataOf(ProductSchema)), ...errors(401, 403, 404) },
});

path("patch", "/products/{id}", "Update a product", `${FULL} Sending a different \`code\` → 422 CODE_IMMUTABLE. ${COST}`, {
  request: { params: IdParams, ...body(UpdateProductSchema) },
  responses: { 200: json(dataOf(ProductSchema)), ...errors(400, 401, 403, 404, 409, 422) },
});

for (const [action, summary] of [
  ["discontinue", "Discontinue a product (never deleted; can't be picked in new entries)"],
  ["reactivate", "Reactivate a discontinued product"],
] as const) {
  path("post", `/products/{id}/${action}`, summary, FULL, {
    request: { params: IdParams, headers: IdempotencyHeaders },
    responses: { 200: json(dataOf(ProductSchema)), ...errors(401, 403, 404, 422) },
  });
}

path("get", "/products/{id}/history", "Audit history of a product", `${VIEW} Who changed what and when. ${COST}`, {
  request: { params: IdParams, query: z.object({ page: z.number().int().optional(), pageSize: z.number().int().max(100).optional() }) },
  responses: { 200: json(listOf(AuditLogSchema)), ...errors(401, 403, 404) },
});

path("get", "/products/by-code/{code}", "Find a product by code", `${VIEW} Case-insensitive. ${COST}`, {
  request: { params: z.object({ code: z.string().openapi({ example: "LG-S18ET" }) }) },
  responses: { 200: json(dataOf(ProductSchema)), ...errors(401, 403, 404) },
});

path("get", "/products/by-barcode/{barcode}", "Find a product by barcode", `${VIEW} ${COST}`, {
  request: { params: z.object({ barcode: z.string() }) },
  responses: { 200: json(dataOf(ProductSchema)), ...errors(401, 403, 404) },
});

path("get", "/products/check-code", "Check whether a product code is free", `${VIEW} Used by the form's live check.`, {
  request: { query: CheckCodeQuerySchema },
  responses: { 200: json(dataOf(CheckCodeResponseSchema)), ...errors(401, 403) },
});

/* ── Photos ── */

path("post", "/products/{id}/photos", "Upload photos", `${CREATE} (FULL, or CREATE on products you created). JPG / PNG / WebP checked by content, ≤ 5 MB each, ≤ 10 per product. Send one or more \`file\` parts. The first photo of a product becomes primary.`, {
  request: { params: IdParams, ...multipart(z.object({ file: z.union([binaryFile, z.array(binaryFile)]) })) },
  responses: { 201: json(dataOf(z.array(PhotoSchema)), "Uploaded"), ...errors(400, 401, 403, 404, 422) },
});

path("patch", "/products/{id}/photos/{photoId}", "Set primary photo or move it", `${CREATE} (FULL, or CREATE on products you created). Returns all photos in order.`, {
  request: { params: PhotoParams, ...body(UpdatePhotoSchema) },
  responses: { 200: json(dataOf(z.array(PhotoSchema))), ...errors(400, 401, 403, 404) },
});

path("delete", "/products/{id}/photos/{photoId}", "Delete a photo", `${CREATE} (FULL, or CREATE on products you created). If it was primary, the next photo becomes primary.`, {
  request: { params: PhotoParams },
  responses: { 204: { description: "Deleted" }, ...errors(401, 403, 404) },
});

path("get", "/products/{id}/photos/{photoId}/file", "Download a photo (authenticated proxy)", `${VIEW} The bucket is private; images are only served through this route.`, {
  request: { params: PhotoParams, query: PhotoVariantQuerySchema },
  responses: {
    200: { description: "Image", content: { "image/jpeg": { schema: binaryFile }, "image/png": { schema: binaryFile }, "image/webp": { schema: binaryFile } } },
    ...errors(401, 403, 404),
  },
});

/* ── Import / export ── */

path("get", "/products/import/template", "Download the Excel import template", `${FULL} Headers, one example row, and a Lists sheet with the valid catalogs, categories and units.`, {
  responses: { 200: xlsx("Excel template"), ...errors(401, 403) },
});

path("post", "/products/import", "Upload an .xlsx import (runs in the background)", `${FULL} \`mode\`: \`validate\` (dry run, nothing written) or \`commit\` (all-or-nothing in one transaction). Duplicate codes in the file or the database are reported per row.`, {
  request: multipart(z.object({ file: binaryFile, mode: z.enum(["validate", "commit"]).default("validate") })),
  responses: { 202: json(dataOf(z.object({ jobId: z.string().uuid(), mode: z.enum(["validate", "commit"]), status: z.literal("queued") })), "Queued"), ...errors(400, 401, 403) },
});

path("get", "/products/import/{jobId}", "Import job status and row-level results", `${FULL} Only the user who uploaded the file can see the job.`, {
  request: { params: z.object({ jobId: z.string().uuid() }) },
  responses: { 200: json(dataOf(ImportJobSchema)), ...errors(401, 403, 404) },
});

path("get", "/products/export", "Export the filtered product list to Excel", `${FULL} Same filters as GET /products. The purchase cost column is only included with seeCost.`, {
  request: { query: ProductListQuerySchema.innerType().omit({ page: true, pageSize: true }) },
  responses: { 200: xlsx("Excel file"), ...errors(400, 401, 403) },
});

/* ── Catalogs / categories / units ── */

const refs: [string, string, z.ZodTypeAny, z.ZodTypeAny, z.ZodTypeAny, boolean][] = [
  ["/catalogs", "catalog (brand)", CatalogSchema, CreateCatalogSchema, UpdateCatalogSchema, true],
  ["/categories", "category", CategorySchema, CreateCategorySchema, UpdateCategorySchema, true],
  ["/units", "unit of measure", UnitSchema, CreateUnitSchema, UpdateUnitSchema, false],
];

for (const [p, label, schema, create, update, deletable] of refs) {
  path("get", p, `List ${label === "catalog (brand)" ? "catalogs" : label === "category" ? "categories" : "units"}`, `${VIEW} Includes inactive ones (\`isActive\`).`, {
    responses: { 200: json(dataOf(z.array(schema))), ...errors(401, 403) },
  });
  path("post", p, `Create a ${label}`, FULL, {
    request: { headers: IdempotencyHeaders, ...body(create) },
    responses: { 201: json(dataOf(schema), "Created"), ...errors(400, 401, 403, 409) },
  });
  path("patch", `${p}/{id}`, `Rename / deactivate a ${label}`, FULL, {
    request: { params: IdParams, ...body(update) },
    responses: { 200: json(dataOf(schema)), ...errors(400, 401, 403, 404, 409) },
  });
  if (deletable) {
    path("delete", `${p}/{id}`, `Delete a ${label}`, `${FULL} Blocked (422) while products use it — deactivate it instead.`, {
      request: { params: IdParams },
      responses: { 204: { description: "Deleted" }, ...errors(401, 403, 404, 422) },
    });
  }
}
