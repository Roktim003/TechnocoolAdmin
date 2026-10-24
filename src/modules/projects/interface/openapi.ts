import { z } from "@/shared/validation/zod";
import { AUTHENTICATED, dataOf, errors, IdParams, json, listOf, registry } from "@/shared/openapi/registry";
import { AddCostSchema, ChangeStatusSchema, CostListQuerySchema, CreateProjectSchema, EntriesQuerySchema, ProjectListQuerySchema, ProjectOptionsQuerySchema, UpdateProjectSchema, VoidCostSchema } from "../application/dto";
import { COST_CATEGORIES, PROJECT_STATUSES, PROJECT_TYPES } from "../domain/types";

const body = (schema: z.ZodTypeAny) => ({ body: { required: true, content: { "application/json": { schema } } } });
const RequiredKey = z.object({ "idempotency-key": z.string().min(8).max(128).openapi({ description: "Required. A unique key per user action; a replay returns the first response." }) });
const OptionalKey = z.object({ "idempotency-key": z.string().min(8).max(128).optional() });
const CostParams = z.object({ id: z.string().uuid(), costId: z.string().uuid() });
const FileParams = IdParams.extend({ attachmentId: z.string().uuid() });
const CostFileParams = CostParams.extend({ attachmentId: z.string().uuid() });

const VIEW = "Requires `projects` ≥ VIEW. Projects are company-wide (not warehouse-scoped).";
const CREATE = "Requires `projects` ≥ CREATE.";
const FULL = "Requires `projects` = FULL.";
const KEY = "`Idempotency-Key` header required.";
const FLAGS = "Cost amounts (`netMaterialCost`, `labourCost`, `transportCost`, `otherCost`, `totalCost`, …) only with `seeCost`; `contractValue`, `margin`, `marginPercent`, `costUsedPercent` only with `seeMargin`.";

function path(method: "get" | "post" | "patch" | "delete", p: string, summary: string, description: string, extra: Record<string, unknown>) {
  registry.registerPath({ method, path: p, tags: ["Projects"], summary, description, security: AUTHENTICATED, ...extra } as Parameters<typeof registry.registerPath>[0]);
}

const Ref = z.object({ id: z.string().uuid(), name: z.string() });
const Money = z.string().openapi({ example: "125000.00" });
const Qty = z.string().openapi({ example: "12.000" });
const WarehouseRef = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });

const SummaryDto = z.object({
  netMaterialCost: Money.optional(),
  issuedCost: Money.optional(),
  returnedCost: Money.optional(),
  labourCost: Money.optional(),
  transportCost: Money.optional(),
  otherCost: Money.optional(),
  totalCost: Money.optional().openapi({ description: "net material + labour + transport + other (seeCost)" }),
  contractValue: Money.nullable().optional().openapi({ description: "seeMargin" }),
  margin: Money.nullable().optional().openapi({ description: "contract − total cost (seeMargin); null without a contract value" }),
  marginPercent: z.string().nullable().optional().openapi({ description: "margin ÷ contract × 100 (seeMargin)" }),
  costUsedPercent: z.string().nullable().optional().openapi({ description: "total cost ÷ contract × 100 (seeMargin + seeCost)" }),
});

const ProjectDto = registry.register(
  "Project",
  z.object({
    id: z.string().uuid(),
    code: z.string().openapi({ example: "PRJ-001" }),
    name: z.string(),
    clientName: z.string().nullable(),
    clientContactPerson: z.string().nullable(),
    clientPhone: z.string().nullable(),
    clientEmail: z.string().nullable(),
    siteAddress: z.string().nullable(),
    projectType: z.enum(PROJECT_TYPES),
    projectTypeLabel: z.string(),
    status: z.enum(PROJECT_STATUSES),
    statusLabel: z.string(),
    defaultWarehouse: WarehouseRef.nullable(),
    startDate: z.string().nullable(),
    expectedEndDate: z.string().nullable(),
    actualEndDate: z.string().nullable(),
    siteEngineer: Ref.nullable(),
    siteEngineerName: z.string().nullable(),
    contractValue: Money.nullable().optional().openapi({ description: "seeMargin only" }),
    notes: z.string().nullable(),
    closedAt: z.string().nullable(),
    closedBy: Ref.nullable(),
    closeReason: z.string().nullable(),
    createdBy: Ref.nullable(),
    isActive: z.boolean(),
    summary: SummaryDto,
    createdAt: z.string(),
    updatedAt: z.string(),
    actions: z.record(z.unknown()).openapi({ description: "What the caller may do, incl. `transitions` (allowed status changes)" }),
  }),
);
const OptionDto = registry.register("ProjectOption", z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), status: z.enum(PROJECT_STATUSES), defaultWarehouse: WarehouseRef.nullable() }));
const HistoryDto = registry.register("ProjectStatusChange", z.object({ id: z.string().uuid(), fromStatus: z.enum(PROJECT_STATUSES).nullable(), toStatus: z.enum(PROJECT_STATUSES), fromLabel: z.string().nullable(), toLabel: z.string(), changedBy: Ref, reason: z.string().nullable(), at: z.string() }));
const MaterialDto = registry.register(
  "ProjectMaterial",
  z.object({
    product: z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), unitCode: z.string(), trackSerial: z.boolean() }),
    issuedQty: Qty,
    returnedQty: Qty.openapi({ description: "GOOD + DAMAGED" }),
    returnedDamagedQty: Qty,
    netQty: Qty,
    issuedCost: Money.optional(),
    returnedCost: Money.optional(),
    netCost: Money.optional(),
    serialsAtSite: z.array(z.string()),
  }),
);
const MovementDto = registry.register(
  "ProjectMovement",
  z.object({ id: z.string().uuid(), number: z.string().nullable(), displayNumber: z.string(), type: z.string(), status: z.string(), entryDate: z.string(), warehouse: WarehouseRef, itemCount: z.number().int(), totalQty: Qty, costTotal: Money.optional(), reversalOf: z.object({ id: z.string().uuid(), number: z.string().nullable(), type: z.string() }).nullable(), createdBy: Ref, postedAt: z.string().nullable() }),
);
const CostDto = registry.register(
  "ProjectCost",
  z.object({
    id: z.string().uuid(),
    date: z.string(),
    category: z.enum(COST_CATEGORIES),
    categoryLabel: z.string(),
    description: z.string(),
    amount: Money.optional().openapi({ description: "seeCost only" }),
    vendorOrPayee: z.string().nullable(),
    referenceNo: z.string().nullable(),
    createdBy: Ref,
    voided: z.boolean(),
    voidedAt: z.string().nullable(),
    voidedBy: Ref.nullable(),
    voidReason: z.string().nullable(),
    attachmentCount: z.number().int(),
    createdAt: z.string(),
  }),
);
const AttachmentDto = z.object({ id: z.string().uuid(), fileName: z.string(), mimeType: z.string(), size: z.number().int(), label: z.string().nullable(), uploadedBy: Ref, createdAt: z.string(), url: z.string() });
const Upload = { body: { required: true, content: { "multipart/form-data": { schema: z.object({ file: z.string().openapi({ format: "binary" }), label: z.string().optional() }) } } } };
const JobDto = z.object({ jobId: z.string(), kind: z.literal("PROJECT_COST_STATEMENT"), status: z.literal("queued") });

path("get", "/projects", "List projects", `${VIEW} Each item has its summary totals. \`meta.statusCounts\` counts per status (for the filter chips). Sort: name, code, startDate, createdAt, totalCost. ${FLAGS}`, {
  request: { query: ProjectListQuerySchema.innerType() },
  responses: { 200: json(listOf(ProjectDto)), ...errors(400, 401, 403) },
});
path("post", "/projects", "Create a project", `${CREATE} Code PRJ-001… assigned automatically; starts as PLANNING or RUNNING. \`contractValue\` only with projects FULL + seeMargin (403 otherwise).`, {
  request: { headers: OptionalKey, ...body(CreateProjectSchema) },
  responses: { 201: json(dataOf(ProjectDto), "Created"), ...errors(400, 401, 403) },
});
path("get", "/projects/options", "Projects for the stock entry form", "Requires `inventory` ≥ CREATE (or projects VIEW / purchasing CREATE). `type=ISSUE_TO_PROJECT`: active planning / running projects; `RETURN_FROM_SITE`: any status but closed. Only id, code, name, status and default warehouse.", {
  request: { query: ProjectOptionsQuerySchema },
  responses: { 200: json(dataOf(z.array(OptionDto))), ...errors(400, 401, 403) },
});
path("get", "/projects/site-engineers", "Users to pick as site engineer", `${CREATE} Active users, id and name only.`, { responses: { 200: json(dataOf(z.array(Ref))), ...errors(401, 403) } });
path("get", "/projects/{id}", "Get a project", `${VIEW} Details and summary tiles. ${FLAGS}`, { request: { params: IdParams }, responses: { 200: json(dataOf(ProjectDto)), ...errors(401, 403, 404) } });
path("patch", "/projects/{id}", "Edit a project", `${CREATE} Not the status (see /status). \`contractValue\`: projects FULL + seeMargin; the old and new values are audit-logged. Closed projects are read-only (422 PROJECT_CLOSED).`, {
  request: { params: IdParams, ...body(UpdateProjectSchema) },
  responses: { 200: json(dataOf(ProjectDto)), ...errors(400, 401, 403, 404, 422) },
});
path("post", "/projects/{id}/deactivate", "Deactivate a project", `${FULL} Never deleted; inactive projects can't receive issues.`, { request: { params: IdParams }, responses: { 200: json(dataOf(ProjectDto)), ...errors(401, 403, 404) } });
path(
  "post",
  "/projects/{id}/status",
  "Change a project's status",
  `${CREATE} ${KEY} Allowed: PLANNING→RUNNING; RUNNING↔ON_HOLD (reason); RUNNING→COMPLETED (sets actualEndDate); COMPLETED→RUNNING (FULL, reason); COMPLETED→CLOSED (FULL, reason; 422 PROJECT_HAS_OPEN_ENTRIES while entries are pending or transfers unreceived); CLOSED→COMPLETED (Admin, reason). Others: 422 INVALID_TRANSITION. The site engineer is notified.`,
  { request: { params: IdParams, headers: RequiredKey, ...body(ChangeStatusSchema) }, responses: { 200: json(dataOf(ProjectDto)), ...errors(400, 401, 403, 404, 422) } },
);
path("get", "/projects/{id}/status-history", "Status history", VIEW, { request: { params: IdParams }, responses: { 200: json(dataOf(z.array(HistoryDto))), ...errors(401, 403, 404) } });
path("get", "/projects/{id}/activity", "Activity", `${VIEW} Status history and the project's audit log as readable lines (amounts per the caller's flags).`, {
  request: { params: IdParams },
  responses: { 200: json(dataOf(z.object({ statusHistory: z.array(HistoryDto), audit: z.array(z.object({ id: z.string(), action: z.string(), at: z.string(), by: z.string().nullable(), text: z.string() })) }))), ...errors(401, 403, 404) },
});
path("get", "/projects/{id}/material", "Material used", `${VIEW} Per product, from posted issues and returns (reversals netted; DAMAGED returns count as returned), at the unit costs recorded in the stock ledger; serial numbers still at the site. Costs with seeCost.`, {
  request: { params: IdParams },
  responses: { 200: json(dataOf(z.object({ lines: z.array(MaterialDto), totals: z.object({ issuedCost: Money.optional(), returnedCost: Money.optional(), netMaterialCost: Money.optional() }) }))), ...errors(401, 403, 404) },
});
path("get", "/projects/{id}/movements", "Issue / return history", `${VIEW} Issues, returns and their reversals (not drafts). \`costTotal\` with seeCost.`, {
  request: { params: IdParams, query: EntriesQuerySchema.innerType() },
  responses: { 200: json(listOf(MovementDto)), ...errors(400, 401, 403, 404) },
});
path("get", "/projects/{id}/costs", "Labour, transport & other costs", `${VIEW} Voided costs only with \`includeVoided=true\`. \`subtotals\`: per category, of non-voided costs (seeCost).`, {
  request: { params: IdParams, query: CostListQuerySchema },
  responses: { 200: json(dataOf(z.object({ costs: z.array(CostDto), subtotals: z.object({ labourCost: Money, transportCost: Money, otherCost: Money, costsTotal: Money }).partial() }))), ...errors(400, 401, 403, 404) },
});
path("post", "/projects/{id}/costs", "Add a cost", `${CREATE} ${KEY} Not on closed projects (422 PROJECT_CLOSED). Queues the cost-alert check.`, {
  request: { params: IdParams, headers: RequiredKey, ...body(AddCostSchema) },
  responses: { 201: json(dataOf(CostDto), "Created"), ...errors(400, 401, 403, 404, 422) },
});
path("post", "/projects/{id}/costs/{costId}/void", "Void a cost", `${FULL} ${KEY} With a reason; kept for audit and excluded from totals.`, {
  request: { params: CostParams, headers: RequiredKey, ...body(VoidCostSchema) },
  responses: { 200: json(dataOf(CostDto)), ...errors(400, 401, 403, 404, 422) },
});
for (const [base, Params, FParams, what] of [
  ["/projects/{id}/attachments", IdParams, FileParams, "Project documents (work order, drawings, handover papers, site photos)"],
  ["/projects/{id}/costs/{costId}/attachments", CostParams, CostFileParams, "Cost receipts"],
] as const) {
  path("get", base, `${what}: list`, VIEW, { request: { params: Params }, responses: { 200: json(dataOf(z.array(AttachmentDto))), ...errors(401, 403, 404) } });
  path("post", base, `${what}: upload`, `${CREATE} PDF, JPG, PNG or WebP (checked by content), up to 10 MB each.`, { request: { params: Params, ...Upload }, responses: { 201: json(dataOf(z.array(AttachmentDto)), "Uploaded"), ...errors(400, 401, 403, 404, 422) } });
  path("get", `${base}/{attachmentId}`, `${what}: download`, VIEW, { request: { params: FParams }, responses: { 200: { description: "The file" }, ...errors(401, 403, 404) } });
  path("delete", `${base}/{attachmentId}`, `${what}: remove`, `${CREATE} The uploader or projects FULL.`, { request: { params: FParams }, responses: { 204: { description: "Removed" }, ...errors(401, 403, 404) } });
}
path("post", "/projects/{id}/documents", "Cost statement PDF", `${VIEW} Requires seeCost. Queued for the worker; poll \`GET /documents/{jobId}\`. The contract / margin section only for seeMargin.`, {
  request: { params: IdParams },
  responses: { 202: json(dataOf(JobDto), "Queued"), ...errors(401, 403, 404) },
});
