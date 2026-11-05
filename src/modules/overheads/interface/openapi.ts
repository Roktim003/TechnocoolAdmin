import { z } from "@/shared/validation/zod";
import { AUTHENTICATED, dataOf, errors, IdParams, json, registry } from "@/shared/openapi/registry";
import { CategorySchema, CreateWarehouseCostSchema, ScopeSchema, SummaryQuerySchema, UpdateWarehouseCostSchema, VoidWarehouseCostSchema, WarehouseCostListQuerySchema } from "../application/dto";

const body = (schema: z.ZodTypeAny) => ({ body: { required: true, content: { "application/json": { schema } } } });
const RequiredKey = z.object({ "idempotency-key": z.string().min(8).max(128).openapi({ description: "Required. A unique key per user action." }) });
const OptionalKey = z.object({ "idempotency-key": z.string().min(8).max(128).optional().openapi({ description: "Optional: the same key + body replays the first response (24 h)." }) });
const FileParams = IdParams.extend({ attachmentId: z.string().uuid() });

const VIEW = "Requires `overheads` ≥ VIEW **and** the `seeCost` flag (403 otherwise). Warehouse lines only for warehouses in the caller's scope; company lines for everyone with access.";
const CREATE = "Requires `overheads` ≥ CREATE and `seeCost`.";
const RULES =
  "WAREHOUSE scope: STORE_CHARGE or HOLDING, `warehouseId` required. COMPANY scope: ESTABLISHMENT, no warehouse (400 SCOPE_CATEGORY / WAREHOUSE_REQUIRED / WAREHOUSE_NOT_ALLOWED). Amount > 0; month at most one month ahead (400 MONTH_TOO_FAR). Several lines per warehouse, month and category are allowed. Never changes stock value. Audit-logged with before / after.";

function path(method: "get" | "post" | "patch" | "delete", p: string, summary: string, description: string, extra: Record<string, unknown>) {
  registry.registerPath({ method, path: p, tags: ["Overheads"], summary, description, security: AUTHENTICATED, ...extra } as Parameters<typeof registry.registerPath>[0]);
}

const Ref = z.object({ id: z.string().uuid(), name: z.string() });
const Money = z.string().openapi({ example: "85000.00" });
const WarehouseRef = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });
const Warnings = z.array(z.object({ code: z.string(), message: z.string() })).openapi({ description: "Non-blocking: OVERHEAD_LARGE_AMOUNT (> BDT 10,00,000)" });

const WarehouseCostDto = registry.register(
  "WarehouseCost",
  z.object({
    id: z.string().uuid(),
    scope: ScopeSchema,
    warehouse: WarehouseRef.nullable(),
    category: CategorySchema,
    categoryLabel: z.string(),
    month: z.string().openapi({ example: "2026-11-01" }),
    amount: Money,
    description: z.string(),
    vendorOrPayee: z.string().nullable(),
    referenceNo: z.string().nullable(),
    createdBy: Ref,
    updatedBy: Ref.nullable(),
    voided: z.boolean(),
    voidedAt: z.string().nullable(),
    voidedBy: Ref.nullable(),
    voidReason: z.string().nullable(),
    attachmentCount: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
    actions: z.object({ edit: z.boolean(), void: z.boolean(), upload: z.boolean() }),
  }),
);
const HistoryDto = z.object({
  id: z.string().uuid(),
  action: z.enum(["CREATE", "UPDATE", "VOID", "ATTACHMENT_ADD", "ATTACHMENT_REMOVE"]),
  at: z.string(),
  by: Ref.nullable(),
  amount: Money.nullable(),
  changes: z.array(z.object({ field: z.string(), from: z.unknown(), to: z.unknown() })),
  files: z.array(z.string()),
  reason: z.string().nullable(),
});
const SummaryDto = z.object({
  monthFrom: z.string(),
  monthTo: z.string(),
  months: z.array(
    z.object({
      month: z.string(),
      warehouses: z.array(
        z.object({
          warehouse: WarehouseRef,
          storeChargeCost: Money,
          holdingCost: Money,
          warehouseTotal: Money,
          averageStockValue: Money.openapi({ description: "Mean of the daily closing stock values (stock ledger) over the month's days up to today" }),
          holdingPercent: z.string().nullable().openapi({ description: "holding ÷ average stock value × 100; null without stock" }),
        }),
      ),
      company: z.object({ establishmentCost: Money }),
      total: Money,
    }),
  ),
});
const AttachmentDto = z.object({ id: z.string().uuid(), fileName: z.string(), mimeType: z.string(), size: z.number().int(), label: z.string().nullable(), uploadedBy: Ref, createdAt: z.string(), url: z.string() });
const Upload = { body: { required: true, content: { "multipart/form-data": { schema: z.object({ file: z.array(z.string().openapi({ type: "string", format: "binary" })), label: z.string().optional() }) } } } };

path("get", "/warehouse-costs", "List overhead costs", `${VIEW} Filters scope, warehouseId, category, monthFrom / monthTo (YYYY-MM), includeVoided; \`q\` searches description, payee, reference. \`totals.amount\`: non-voided total of all matching lines.`, {
  request: { query: WarehouseCostListQuerySchema.innerType() },
  responses: { 200: json(z.object({ data: z.array(WarehouseCostDto), meta: z.record(z.unknown()), totals: z.object({ amount: Money }) })), ...errors(400, 401, 403) },
});
path("post", "/warehouse-costs", "Add an overhead cost", `${CREATE} ${RULES}`, {
  request: { headers: OptionalKey, ...body(CreateWarehouseCostSchema) },
  responses: { 201: json(dataOf(WarehouseCostDto.extend({ warnings: Warnings })), "Created"), ...errors(400, 401, 403, 409) },
});
path("get", "/warehouse-costs/summary", "Monthly summary", `${VIEW} Per month and warehouse in scope: store charge, holding, total, average stock value and holding % of it; the company's established cost; the month's total. Default: the last 6 months; at most 36.`, {
  request: { query: SummaryQuerySchema },
  responses: { 200: json(dataOf(SummaryDto)), ...errors(400, 401, 403) },
});
path("get", "/warehouse-costs/summary/export", "Monthly summary as Excel", `${VIEW} Same months and figures as the summary, as an .xlsx download.`, {
  request: { query: SummaryQuerySchema },
  responses: { 200: { description: "The workbook", content: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { schema: z.string().openapi({ type: "string", format: "binary" }) } } }, ...errors(400, 401, 403) },
});
path("get", "/warehouse-costs/{id}", "Get an overhead cost", VIEW, { request: { params: IdParams }, responses: { 200: json(dataOf(WarehouseCostDto)), ...errors(401, 403, 404) } });
path("patch", "/warehouse-costs/{id}", "Edit an overhead cost", `${CREATE} Omitted fields keep their value; optional \`reason\` kept in the history. ${RULES}`, {
  request: { params: IdParams, ...body(UpdateWarehouseCostSchema) },
  responses: { 200: json(dataOf(WarehouseCostDto.extend({ warnings: Warnings }))), ...errors(400, 401, 403, 404, 422) },
});
path("post", "/warehouse-costs/{id}/void", "Void an overhead cost", `${CREATE} With a reason; excluded from totals, kept for history. \`Idempotency-Key\` header required.`, {
  request: { params: IdParams, headers: RequiredKey, ...body(VoidWarehouseCostSchema) },
  responses: { 200: json(dataOf(WarehouseCostDto)), ...errors(400, 401, 403, 404, 422) },
});
path("get", "/warehouse-costs/{id}/history", "History of an overhead cost", `${VIEW} Its audit trail, oldest first: created, edited (old → new), voided, receipts added / removed — who, when, why.`, {
  request: { params: IdParams },
  responses: { 200: json(dataOf(z.object({ cost: WarehouseCostDto, history: z.array(HistoryDto) }))), ...errors(401, 403, 404) },
});
path("get", "/warehouse-costs/{id}/attachments", "Receipts and bills: list", VIEW, { request: { params: IdParams }, responses: { 200: json(dataOf(z.array(AttachmentDto))), ...errors(401, 403, 404) } });
path("post", "/warehouse-costs/{id}/attachments", "Receipts and bills: upload", `${CREATE} multipart \`file\` (repeatable): PDF, JPG, PNG or WebP (checked by content), up to 10 MB each, 20 per cost.`, {
  request: { params: IdParams, ...Upload },
  responses: { 201: json(dataOf(z.array(AttachmentDto)), "Uploaded"), ...errors(400, 401, 403, 404, 422) },
});
path("get", "/warehouse-costs/{id}/attachments/{attachmentId}", "Receipts and bills: download", VIEW, { request: { params: FileParams }, responses: { 200: { description: "The file" }, ...errors(401, 403, 404) } });
path("delete", "/warehouse-costs/{id}/attachments/{attachmentId}", "Receipts and bills: remove", CREATE, { request: { params: FileParams }, responses: { 204: { description: "Removed" }, ...errors(401, 403, 404) } });
