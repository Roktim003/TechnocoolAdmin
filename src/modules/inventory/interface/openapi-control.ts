import { z } from "@/shared/validation/zod";
import { AUTHENTICATED, dataOf, errors, IdempotencyHeaders, IdParams, json, listOf, registry } from "@/shared/openapi/registry";
import {
  CountLineSchema,
  CountListQuerySchema,
  CountStatusSchema,
  CreateCountSchema,
  LowStockQuerySchema,
  RecountSchema,
  SubmitCountSchema,
  UnlockOpeningSchema,
  UpdateAlertSettingsSchema,
  UpdateCountSchema,
} from "../application/dto";

const body = (schema: z.ZodTypeAny) => ({ body: { required: true, content: { "application/json": { schema } } } });
const optionalBody = (schema: z.ZodTypeAny) => ({ body: { required: false, content: { "application/json": { schema } } } });
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const binary = z.string().openapi({ type: "string", format: "binary" });
const RequiredKey = z.object({ "idempotency-key": z.string().min(8).max(128).openapi({ description: "Required. A unique key per user action; a replay returns the first response." }) });

const VIEW = "Requires `inventory` ≥ VIEW.";
const CREATE = "Requires `inventory` ≥ CREATE.";
const APPROVE = "Requires `inventory` ≥ APPROVE (warehouse in scope, not the person who submitted).";
const FULL = "Requires `inventory` = FULL.";
const KEY = "`Idempotency-Key` header required.";
const COST = "Values (`varianceValue`, `gainValue`, `lossValue`, `netValue`, `totalValue`) are removed without `seeCost`.";

function path(method: "get" | "post" | "patch" | "put", p: string, summary: string, description: string, extra: Record<string, unknown>, tags: string[]) {
  registry.registerPath({ method, path: p, tags, summary, description, security: AUTHENTICATED, ...extra } as Parameters<typeof registry.registerPath>[0]);
}

const Ref = z.object({ id: z.string().uuid(), name: z.string() });
const Wh = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });
const Qty = z.string().openapi({ example: "12.000" });

const CountLineDto = z.object({
  id: z.string().uuid(),
  product: z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), unitCode: z.string(), barcode: z.string().nullable(), model: z.string().nullable(), trackSerial: z.boolean() }),
  condition: z.enum(["GOOD", "DAMAGED"]),
  systemQty: Qty.nullable().optional().openapi({ description: "Hidden in blind counts unless the viewer is an approver" }),
  variance: Qty.nullable().optional(),
  countedQty: Qty.nullable(),
  notCounted: z.boolean(),
  countedBy: Ref.nullable(),
  countedAt: z.string().nullable(),
  recountRequested: z.boolean(),
  note: z.string().nullable(),
  serials: z.array(z.object({ serial: z.string(), result: z.enum(["FOUND", "MISSING", "UNEXPECTED"]).optional() })),
});

const CountDto = registry.register(
  "StockCount",
  z.object({
    id: z.string().uuid(),
    number: z.string().openapi({ example: "SC-2627-0001" }),
    warehouse: Wh,
    scope: z.enum(["ALL", "CATALOG", "CATEGORY", "SELECTED_PRODUCTS"]),
    scopeIds: z.array(z.string().uuid()),
    blindCount: z.boolean(),
    systemVisible: z.boolean(),
    status: CountStatusSchema,
    notes: z.string().nullable(),
    createdBy: Ref,
    submittedBy: Ref.nullable(),
    approvedBy: Ref.nullable(),
    adjustmentEntry: z.object({ id: z.string().uuid(), number: z.string().nullable() }).nullable(),
    startedAt: z.string().nullable(),
    submittedAt: z.string().nullable(),
    approvedAt: z.string().nullable(),
    progress: z.object({ total: z.number().int(), counted: z.number().int(), recount: z.number().int() }),
    lines: z.array(CountLineDto),
    actions: z.record(z.boolean()),
  }),
);

const CountSummaryDto = registry.register(
  "StockCountSummary",
  z.object({ id: z.string().uuid(), number: z.string(), warehouse: Wh, scope: z.string(), blindCount: z.boolean(), status: CountStatusSchema, createdBy: Ref, startedAt: z.string().nullable(), progress: z.object({ total: z.number().int(), counted: z.number().int() }) }).passthrough(),
);

const VarianceDto = registry.register(
  "StockCountVariance",
  z.object({
    countId: z.string().uuid(),
    number: z.string(),
    status: CountStatusSchema,
    systemVisible: z.boolean(),
    progress: z.object({ total: z.number().int(), counted: z.number().int() }),
    totals: z.object({ linesWithVariance: z.number().int().nullable(), gainQty: Qty.optional(), lossQty: Qty.optional(), gainValue: z.string().optional(), lossValue: z.string().optional(), netValue: z.string().optional() }),
    lines: z.array(z.object({ lineId: z.string().uuid(), systemQty: Qty.nullable(), countedQty: Qty.nullable(), variance: Qty.nullable(), varianceValue: z.string().optional(), missingSerials: z.array(z.string()), unexpectedSerials: z.array(z.string()) }).passthrough()),
  }),
);

const RowIssue = z.object({ row: z.number().int(), field: z.string(), message: z.string() });
const OpeningImportDto = registry.register(
  "OpeningImport",
  z.object({
    id: z.string().uuid(),
    fileName: z.string(),
    status: z.enum(["QUEUED", "VALIDATING", "VALID", "INVALID", "COMMITTED", "FAILED"]),
    totalRows: z.number().int(),
    validLines: z.number().int(),
    errors: z.array(RowIssue),
    warnings: z.array(RowIssue),
    summary: z.array(z.object({ warehouseId: z.string().uuid(), warehouseCode: z.string(), lines: z.number().int(), totalQty: Qty, totalValue: z.string().optional() })),
    entries: z.array(z.object({ id: z.string().uuid(), number: z.string().nullable(), warehouse: z.string() })),
    failedReason: z.string().nullable(),
    createdBy: Ref,
    createdAt: z.string(),
    committedAt: z.string().nullable(),
    alreadyCommitted: z.boolean().optional(),
  }),
);
const OpeningWarehouseDto = registry.register("OpeningWarehouse", z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), isActive: z.boolean(), openingLocked: z.boolean(), openingLockedAt: z.string().nullable(), openingLockedBy: Ref.nullable() }));

const LowStockDto = registry.register(
  "LowStockRow",
  z.object({
    product: z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), unitCode: z.string(), catalogName: z.string(), categoryName: z.string() }),
    warehouses: z.array(z.object({ warehouseId: z.string().uuid(), code: z.string(), available: Qty })),
    totalAvailable: Qty,
    minStockLevel: Qty,
    shortBy: Qty,
    suggestedQty: Qty.openapi({ description: "2 × minimum − available" }),
  }),
);
const AlertSettingsDto = registry.register("AlertSettings", z.object({ lowStockRoleIds: z.array(z.string().uuid()), digestEnabled: z.boolean(), digestTime: z.string().openapi({ example: "09:00" }), roles: z.array(Ref) }));

/* ── stock counts ── */
const C = ["Stock counts"];
const CountParams = IdParams;
path("get", "/stock-counts", "List stock counts", `${VIEW} Own warehouses. Filters: status, warehouseId, active.`, { request: { query: CountListQuerySchema.innerType() }, responses: { 200: json(listOf(CountSummaryDto)), ...errors(400, 401, 403) } }, C);
path("post", "/stock-counts", "Create a stock count (DRAFT)", `${CREATE} Lines come from the scope: ALL / CATALOG / CATEGORY (active products plus anything in stock) or SELECTED_PRODUCTS. Number SC-{FY}-0001.`, { request: { headers: IdempotencyHeaders, ...body(CreateCountSchema) }, responses: { 201: json(dataOf(CountDto), "Created"), ...errors(400, 401, 403, 422) } }, C);
path("get", "/stock-counts/{id}", "Get a stock count", `${VIEW} Blind counts hide system qty, variance and expected serials from non-approvers.`, { request: { params: CountParams }, responses: { 200: json(dataOf(CountDto)), ...errors(401, 403, 404) } }, C);
path("patch", "/stock-counts/{id}", "Edit a draft count", `${CREATE} Creator or FULL; DRAFT only. Changing the scope rebuilds the lines.`, { request: { params: CountParams, ...body(UpdateCountSchema) }, responses: { 200: json(dataOf(CountDto)), ...errors(400, 401, 403, 404, 422) } }, C);
path("post", "/stock-counts/{id}/start", "Start counting (snapshot + freeze)", `${CREATE} ${KEY} Snapshots on-hand quantities. While COUNTING or SUBMITTED, postings that touch the counted products in this warehouse get 422 COUNT_IN_PROGRESS.`, { request: { params: CountParams, headers: RequiredKey }, responses: { 200: json(dataOf(CountDto)), ...errors(400, 401, 403, 404, 422) } }, C);
path("put", "/stock-counts/{id}/lines/{lineId}", "Record a counted line", `${CREATE} COUNTING only. Tracked products: send the serials found (counted qty = serials); expected-but-not-found → MISSING, found-but-not-expected → UNEXPECTED. Records who counted.`, { request: { params: z.object({ id: z.string().uuid(), lineId: z.string().uuid() }), ...body(CountLineSchema) }, responses: { 200: json(dataOf(CountDto)), ...errors(400, 401, 403, 404, 422) } }, C);
path("post", "/stock-counts/{id}/submit", "Submit for approval", `${CREATE} ${KEY} Every line needs a counted qty, or send markUncountedAsZero. Recount lines must be counted again first.`, { request: { params: CountParams, headers: RequiredKey, ...optionalBody(SubmitCountSchema) }, responses: { 200: json(dataOf(CountDto)), ...errors(400, 401, 403, 404, 422) } }, C);
path("post", "/stock-counts/{id}/approve", "Approve and post the adjustment", `${APPROVE} ${KEY} Posts one STOCK_ADJUSTMENT (gains at average cost, losses removed at average cost; MISSING serials written off, UNEXPECTED ones into stock) and unfreezes. No variance → no entry.`, { request: { params: CountParams, headers: RequiredKey }, responses: { 200: json(dataOf(CountDto)), ...errors(401, 403, 404, 422) } }, C);
path("post", "/stock-counts/{id}/request-recount", "Request a recount of chosen lines", `${APPROVE} ${KEY} Back to COUNTING with the lines flagged.`, { request: { params: CountParams, headers: RequiredKey, ...body(RecountSchema) }, responses: { 200: json(dataOf(CountDto)), ...errors(400, 401, 403, 404, 422) } }, C);
path("post", "/stock-counts/{id}/cancel", "Cancel a count", `${CREATE} ${KEY} Creator or FULL, before approval. Unfreezes; no stock change.`, { request: { params: CountParams, headers: RequiredKey }, responses: { 200: json(dataOf(CountDto)), ...errors(401, 403, 404, 422) } }, C);
path("get", "/stock-counts/{id}/variance", "Variance summary", `${VIEW} Lines with a difference, largest value first; gain / loss quantities. ${COST}`, { request: { params: CountParams }, responses: { 200: json(dataOf(VarianceDto)), ...errors(401, 403, 404) } }, C);
path("get", "/stock-counts/{id}/sheet", "Queue a printable count sheet (PDF)", `${VIEW} Rendered by the worker; poll GET /documents/{jobId}. Blind counts print without system qty for counters.`, { request: { params: CountParams }, responses: { 202: json(dataOf(z.object({ jobId: z.string().uuid(), kind: z.literal("COUNT_SHEET"), status: z.literal("queued") })), "Queued"), ...errors(401, 403, 404, 422) } }, C);

/* ── opening stock ── */
const O = ["Opening stock"];
path("get", "/opening-stock/template", "Download the opening-stock template", `${FULL} Columns: Warehouse code, Product code, Condition, Quantity, Unit cost (BDT), Serial numbers, Note. A Lists sheet has the valid warehouses and active products.`, { responses: { 200: { description: "Template", content: { [XLSX]: { schema: binary } } }, ...errors(401, 403) } }, O);
path("get", "/opening-stock/imports", "Recent imports", FULL, { responses: { 200: json(dataOf(z.array(OpeningImportDto))), ...errors(401, 403) } }, O);
path("post", "/opening-stock/imports", "Upload a filled template", `${FULL} Multipart \`file\` (.xlsx ≤ 10 MB, ≤ 5000 rows). The worker validates it; poll GET /opening-stock/imports/{id}.`, { request: { body: { required: true, content: { "multipart/form-data": { schema: z.object({ file: binary }) } } } }, responses: { 202: json(dataOf(OpeningImportDto), "Queued for validation"), ...errors(400, 401, 403) } }, O);
path("get", "/opening-stock/imports/{id}", "Import status, row errors and per-warehouse summary", `${FULL} ${COST}`, { request: { params: IdParams }, responses: { 200: json(dataOf(OpeningImportDto)), ...errors(401, 403, 404) } }, O);
path("post", "/opening-stock/imports/{id}/commit", "Import and post", `${FULL} ${KEY} Only when there are no errors. One OPENING entry per warehouse through the posting engine, all in one transaction. Committing again changes nothing (alreadyCommitted: true).`, { request: { params: IdParams, headers: RequiredKey }, responses: { 200: json(dataOf(OpeningImportDto)), ...errors(400, 401, 403, 404, 422) } }, O);
path("get", "/opening-stock/warehouses", "Opening lock status per warehouse", FULL, { responses: { 200: json(dataOf(z.array(OpeningWarehouseDto))), ...errors(401, 403) } }, O);
path("post", "/warehouses/{id}/lock-opening", "Lock opening stock (go-live)", "Admin only. Afterwards OPENING entries and imports for the warehouse get 422 OPENING_LOCKED. Audit-logged.", { request: { params: IdParams, headers: IdempotencyHeaders }, responses: { 200: json(dataOf(OpeningWarehouseDto)), ...errors(401, 403, 404) } }, O);
path("post", "/warehouses/{id}/unlock-opening", "Unlock opening stock", "Admin only, reason required (audit-logged).", { request: { params: IdParams, headers: IdempotencyHeaders, ...body(UnlockOpeningSchema) }, responses: { 200: json(dataOf(OpeningWarehouseDto)), ...errors(400, 401, 403, 404) } }, O);

/* ── low stock & alerts ── */
const L = ["Low stock"];
path("get", "/stock/low-stock", "Products below their minimum", `${VIEW} Available = GOOD on hand − reserved. Totals are company-wide (or one warehouse with warehouseId); per-warehouse columns for the caller's warehouses. Sort by shortBy (default), code, name.`, { request: { query: LowStockQuerySchema.innerType() }, responses: { 200: json(listOf(LowStockDto)), ...errors(400, 401, 403) } }, L);
path("get", "/stock/low-stock/export", "Low-stock list as Excel", `${VIEW} Same filters as the list.`, { request: { query: LowStockQuerySchema.innerType() }, responses: { 200: { description: "Workbook", content: { [XLSX]: { schema: binary } } }, ...errors(400, 401, 403) } }, L);
path("get", "/alert-settings", "Low-stock alert settings", `${FULL} Recipient roles and the daily digest (default 09:00 Asia/Dhaka).`, { responses: { 200: json(dataOf(AlertSettingsDto)), ...errors(401, 403) } }, L);
path("patch", "/alert-settings", "Update alert settings", `${FULL} Reschedules the digest job. Audit-logged.`, { request: body(UpdateAlertSettingsSchema), responses: { 200: json(dataOf(AlertSettingsDto)), ...errors(400, 401, 403) } }, L);
