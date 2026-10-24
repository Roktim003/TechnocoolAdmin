import { z } from "@/shared/validation/zod";
import { AUTHENTICATED, dataOf, errors, IdParams, json, listOf, registry } from "@/shared/openapi/registry";
import { PageMetaSchema } from "@/shared/pagination/list-query";
import { CreateScheduleSchema, ExportRequestSchema, RunsQuerySchema, ScheduleListQuerySchema, UpdateScheduleSchema } from "../application/dto";
import { REPORTS } from "../infrastructure/registry";

const body = (schema: z.ZodTypeAny) => ({ body: { required: true, content: { "application/json": { schema } } } });

const VIEW = "Requires `reports` ≥ VIEW (Admin and Accounts by default; Manager and Store Manager get 403).";
const FLAGS =
  "Columns, totals and charts the caller's role may not see are absent (cost → `seeCost`, profit → `seeProfit`, contract / margin → `seeMargin`), in JSON, Excel and PDF alike. Rows are limited to the caller's warehouses; a `warehouseId` outside them is 403.";
const SCHEDULE = "Requires `reports` ≥ VIEW: VIEW manages its own schedules, FULL everyone's. External email addresses need FULL.";

function path(tag: "Reports" | "Report schedules" | "Dashboard", method: "get" | "post" | "patch" | "delete", p: string, summary: string, description: string, extra: Record<string, unknown>) {
  registry.registerPath({ method, path: p, tags: [tag], summary, description, security: AUTHENTICATED, ...extra } as Parameters<typeof registry.registerPath>[0]);
}

const ReportIdParams = z.object({ id: z.enum(REPORTS.map((r) => r.meta.id) as [string, ...string[]]) });
const Column = z.object({ key: z.string(), label: z.string(), type: z.enum(["text", "number", "money", "date", "tag"]), align: z.enum(["start", "end"]), requires: z.string(), sortKey: z.string().optional() }).passthrough();
const Total = z.object({ key: z.string(), label: z.string(), type: z.enum(["number", "money"]), requires: z.string() }).passthrough();
const Chart = z.object({ type: z.enum(["bar", "hbar", "line", "stacked", "donut"]), title: z.string(), valueType: z.enum(["money", "number"]), series: z.array(z.string()).optional(), points: z.array(z.object({ label: z.string(), values: z.array(z.union([z.string(), z.number()])) })) }).nullable();

const ReportInfo = registry.register(
  "ReportInfo",
  z.object({
    id: z.string().openapi({ example: "stock-summary" }),
    number: z.number().int(),
    title: z.string(),
    group: z.string(),
    description: z.string(),
    landscape: z.boolean(),
    params: z.array(z.object({ key: z.string(), label: z.string(), kind: z.string(), options: z.array(z.object({ value: z.string(), label: z.string() })).optional(), default: z.string().optional() })),
    sortFields: z.array(z.string()),
    defaultSort: z.string(),
    columns: z.array(Column),
    totals: z.array(Total),
    chart: z.object({ type: z.string(), title: z.string() }).passthrough().nullable(),
    rowAction: z.object({ kind: z.string(), label: z.string() }).passthrough().nullable(),
  }),
);

const ExportJob = registry.register(
  "ReportExportJob",
  z.object({
    jobId: z.string().uuid(),
    reportId: z.string(),
    format: z.enum(["xlsx", "pdf"]),
    status: z.enum(["queued", "processing", "completed", "failed"]),
    fileName: z.string().nullable().optional(),
    rows: z.number().int().nullable().optional(),
    downloadUrl: z.string().nullable().optional().openapi({ description: "Signed link, valid for 1 hour (no session needed)" }),
    expiresAt: z.string().nullable().optional(),
    failedReason: z.string().nullable().optional(),
  }),
);

const Schedule = registry.register(
  "ReportSchedule",
  z.object({
    id: z.string().uuid(),
    reportId: z.string(),
    reportTitle: z.string(),
    reportNumber: z.number().int(),
    params: z.record(z.string()),
    frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
    dayOfWeek: z.number().int().nullable(),
    dayOfMonth: z.number().int().nullable(),
    time: z.string().openapi({ example: "09:00" }),
    description: z.string().openapi({ example: "Weekly · Sunday 9:00 AM" }),
    format: z.enum(["XLSX", "PDF", "BOTH"]),
    recipientUserIds: z.array(z.string().uuid()),
    externalEmails: z.array(z.string()),
    isActive: z.boolean(),
    owner: z.object({ id: z.string().uuid(), name: z.string() }),
    nextRunAt: z.string().nullable(),
    lastRunAt: z.string().nullable(),
    lastStatus: z.enum(["RUNNING", "SUCCESS", "FAILED"]).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
);

const Run = registry.register(
  "ReportScheduleRun",
  z.object({
    id: z.string().uuid(),
    trigger: z.enum(["SCHEDULE", "MANUAL"]),
    status: z.enum(["RUNNING", "SUCCESS", "FAILED"]),
    startedAt: z.string(),
    finishedAt: z.string().nullable(),
    error: z.string().nullable(),
    rowCount: z.number().int().nullable(),
    emailed: z.number().int(),
    files: z.array(z.object({ index: z.number().int(), name: z.string(), format: z.enum(["XLSX", "PDF"]), downloadable: z.boolean().openapi({ description: "False when the file holds data the caller may not see" }) })),
  }),
);

const Widget = registry.register(
  "DashboardWidget",
  z.object({ id: z.string(), kind: z.enum(["kpi", "chart", "list"]), title: z.string(), link: z.string().nullable().optional() }).passthrough(),
);

/* reports */

path("Reports", "get", "/reports", "The reports catalog", `${VIEW} Lists the 14 reports with their filters and the columns / totals / chart this caller gets. ${FLAGS}`, {
  responses: { 200: json(z.object({ data: z.array(ReportInfo), scheduleCount: z.number().int() })), ...errors(401, 403) },
});
path("Reports", "get", "/reports/{id}/run", "Run a report (one page)", `${VIEW} Filters are query parameters (see \`params\`; dates accept YYYY-MM-DD or tokens such as \`monthStart\`, \`today\`, \`-30d\`). Aggregation and paging happen in the database; queries stop after 30 s (503 QUERY_TIMEOUT). ${FLAGS}`, {
  request: { params: ReportIdParams, query: z.object({ page: z.number().int().optional(), pageSize: z.number().int().max(200).optional(), sort: z.string().optional() }).passthrough() },
  responses: {
    200: json(z.object({ data: z.array(z.record(z.unknown())), meta: PageMetaSchema, totals: z.record(z.union([z.string(), z.number(), z.null()])), chart: Chart, report: z.object({}).passthrough(), params: z.record(z.string()) })),
    ...errors(400, 401, 403, 404),
    503: json(z.object({ error: z.object({ code: z.literal("QUERY_TIMEOUT") }).passthrough() }), "The query took longer than 30 seconds"),
  },
});
path("Reports", "post", "/reports/{id}/exports", "Export a report to Excel or PDF", `${VIEW} Validates the filters, writes an audit row (\`report.export\`) and queues the file (worker). Excel streams up to 100,000 rows; PDF shows the first 5,000. Poll \`GET /exports/{jobId}\`. ${FLAGS}`, {
  request: { params: ReportIdParams, ...body(ExportRequestSchema) },
  responses: { 202: json(dataOf(ExportJob), "Queued"), ...errors(400, 401, 403, 404, 422) },
});
path("Reports", "get", "/exports/{jobId}", "Export status", `${VIEW} Only the requester sees their job. When completed, \`downloadUrl\` is a signed link valid for 1 hour.`, {
  request: { params: z.object({ jobId: z.string().uuid() }) },
  responses: { 200: json(dataOf(ExportJob)), ...errors(401, 403, 404) },
});
registry.registerPath({
  method: "get",
  path: "/exports/{jobId}/download",
  tags: ["Reports"],
  summary: "Download an export (signed link)",
  description: "No session needed: `expires` and `signature` (HMAC) are the authorisation; the link stops working after 1 hour.",
  request: { params: z.object({ jobId: z.string().uuid() }), query: z.object({ expires: z.string(), signature: z.string() }) },
  responses: { 200: { description: "The file (xlsx or pdf)" }, ...errors(403, 404, 409) },
});
path("Reports", "get", "/reports/lookups", "Filter options", `${VIEW} Warehouses (the caller's), brands, categories, projects, suppliers, customers, users and audit record types.`, {
  responses: { 200: json(dataOf(z.object({}).passthrough())), ...errors(401, 403) },
});
path("Reports", "get", "/reports/lookups/products", "Product search for filters", VIEW, {
  request: { query: z.object({ q: z.string().optional() }) },
  responses: { 200: json(dataOf(z.array(z.object({ id: z.string().uuid(), code: z.string(), name: z.string() })))), ...errors(401, 403) },
});

/* schedules */

path("Report schedules", "get", "/report-schedules", "List schedules", SCHEDULE, { request: { query: ScheduleListQuerySchema }, responses: { 200: json(listOf(Schedule)), ...errors(400, 401, 403) } });
path("Report schedules", "post", "/report-schedules", "Create a schedule", `${SCHEDULE} Every user recipient must have \`reports\` ≥ VIEW. Times are Asia/Dhaka; \`dayOfMonth\` 31 means the last day of each month. Audited.`, {
  ...{ request: body(CreateScheduleSchema) },
  responses: { 201: json(dataOf(Schedule), "Created"), ...errors(400, 401, 403, 404) },
});
path("Report schedules", "get", "/report-schedules/{id}", "Get a schedule", SCHEDULE, { request: { params: IdParams }, responses: { 200: json(dataOf(Schedule)), ...errors(401, 403, 404) } });
path("Report schedules", "patch", "/report-schedules/{id}", "Edit a schedule", `${SCHEDULE} Audited.`, { request: { params: IdParams, ...body(UpdateScheduleSchema) }, responses: { 200: json(dataOf(Schedule)), ...errors(400, 401, 403, 404) } });
path("Report schedules", "delete", "/report-schedules/{id}", "Delete a schedule", `${SCHEDULE} Audited.`, { request: { params: IdParams }, responses: { 204: { description: "Deleted" }, ...errors(401, 403, 404) } });
for (const [action, summary] of [["pause", "Pause a schedule"], ["resume", "Resume a schedule (next run recalculated)"]] as const) {
  path("Report schedules", "post", `/report-schedules/{id}/${action}`, summary, `${SCHEDULE} Audited.`, { request: { params: IdParams }, responses: { 200: json(dataOf(Schedule)), ...errors(401, 403, 404) } });
}
path("Report schedules", "post", "/report-schedules/{id}/run-now", "Run a schedule now", `${SCHEDULE} Queues a run with the owner's current permissions; the regular schedule is unchanged. Audited.`, {
  request: { params: IdParams },
  responses: { 202: json(dataOf(z.object({ runId: z.string().uuid(), status: z.literal("RUNNING") })), "Queued"), ...errors(401, 403, 404) },
});
path("Report schedules", "get", "/report-schedules/{id}/runs", "Run history", SCHEDULE, { request: { params: IdParams, query: RunsQuerySchema }, responses: { 200: json(listOf(Run)), ...errors(401, 403, 404) } });
path("Report schedules", "get", "/report-schedules/{id}/runs/{runId}/files/{index}", "Download a run's file", `${SCHEDULE} Only when the caller can see everything the file was generated for (flags and warehouses).`, {
  request: { params: z.object({ id: z.string().uuid(), runId: z.string().uuid(), index: z.number().int() }) },
  responses: { 200: { description: "The file (xlsx or pdf)" }, ...errors(401, 403, 404) },
});

/* dashboard */

path("Dashboard", "get", "/dashboard", "The role-aware dashboard", "Requires `dashboard` ≥ VIEW. Widgets the caller may not see are omitted (money only with `seeCost`; project contract vs cost only with `seeMargin`). Shared widgets are cached for 60 s per role, flags and warehouse scope and cleared when stock, purchasing or project data change.", {
  responses: { 200: json(z.object({ data: z.array(Widget), cached: z.boolean(), generatedAt: z.string() })), ...errors(401, 403) },
});
