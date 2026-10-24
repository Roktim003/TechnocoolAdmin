import type { ActorContext } from "@/modules/audit/application/audit.service";
import type { ListQuery, SortField } from "@/shared/pagination/list-query";
import type { SensitiveFlags } from "@/shared/rbac/levels";
import type { Frequency } from "../domain/schedule";
import type { ChartData, ChartSpec, ColumnDef, ParamDef, ReportMeta, ReportRow, ReportTotals, ReportViewer, RowActionDef, TotalDef } from "../domain/types";

/* ───────────────────────── report engine ───────────────────────── */

export interface WarehouseRef {
  id: string;
  code: string;
  name: string;
}

/** Parsed filter values: dates are Date bounds (Asia/Dhaka day start / end), ids are uuids, flags booleans. */
export type ParsedParams = Record<string, string | boolean | Date | undefined>;

export interface RunRequest {
  /** 1-based; ignored when `limit` / `offset` are given (exports). */
  page: number;
  pageSize: number;
  offset: number;
  sort: SortField[];
  /** Also compute the total row count, totals and chart (screen and first export chunk). */
  summary: boolean;
}

export interface RunContext {
  viewer: ReportViewer;
  /** Warehouses the query may read: the viewer's scope, or the chosen warehouse inside it. */
  scope: string[];
  /** The viewer's warehouses (for per-warehouse columns). */
  warehouses: WarehouseRef[];
  now: Date;
}

export interface RunOutput {
  rows: ReportRow[];
  total: number;
  totals: ReportTotals;
  chart: ChartData | null;
}

/**
 * One report of the registry. Infrastructure implements `run` with read-only SQL (database-side
 * aggregation and paging); the application layer validates params, enforces scope and strips
 * every column / total / chart the viewer may not see.
 */
export interface ReportDefinition {
  meta: ReportMeta;
  params: ParamDef[];
  /** Sort keys accepted by `sort` (column `sortKey`s). */
  sortFields: string[];
  defaultSort: string;
  columns(warehouses: WarehouseRef[]): ColumnDef[];
  totals: TotalDef[];
  /** The chart shown for these flags (null: no chart for this viewer). */
  chart?(flags: SensitiveFlags): ChartSpec | null;
  rowAction?: RowActionDef;
  run(params: ParsedParams, req: RunRequest, ctx: RunContext): Promise<RunOutput>;
}

export interface ReportRegistry {
  all(): ReportDefinition[];
  get(id: string): ReportDefinition | undefined;
}

export interface Lookups {
  warehouses(ids?: string[]): Promise<WarehouseRef[]>;
  /** Display names for filter ids (for the "filters used" line of exports and emails). */
  names(kind: "catalog" | "category" | "product" | "project" | "supplier" | "customer" | "user", id: string): Promise<string | null>;
  options(scope: string[]): Promise<{
    warehouses: WarehouseRef[];
    catalogs: { id: string; name: string }[];
    categories: { id: string; name: string }[];
    projects: { id: string; code: string; name: string }[];
    suppliers: { id: string; code: string; name: string }[];
    customers: { id: string; name: string }[];
    users: { id: string; name: string; username: string }[];
    recordTypes: string[];
  }>;
  products(q: string, limit: number): Promise<{ id: string; code: string; name: string }[]>;
}

/* ───────────────────────── exports ───────────────────────── */

export type ExportFormat = "xlsx" | "pdf";

export interface FilterLine {
  label: string;
  value: string;
}

/** Everything a file needs; `rows` streams the data in chunks. */
export interface ReportFileInput {
  meta: ReportMeta;
  columns: ColumnDef[];
  totalDefs: TotalDef[];
  totals: ReportTotals;
  chart: ChartData | null;
  filters: FilterLine[];
  generatedAt: Date;
  generatedBy: string;
  companyName: string;
  rows: () => AsyncIterable<ReportRow[]>;
  /** PDF only: rows were cut at this many (the Excel file has them all). */
  truncatedAt?: number | null;
}

export interface ReportFileWriter {
  xlsx(input: ReportFileInput): Promise<Uint8Array>;
  pdf(input: ReportFileInput): Promise<Uint8Array>;
}

export interface FileStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Uint8Array; contentType: string } | null>;
}

export interface ExportJobData {
  kind: "REPORT_EXPORT";
  reportId: string;
  format: ExportFormat;
  /** Raw filter values as sent. */
  params: Record<string, string>;
  sort?: string;
  /** The requester's permissions when they asked (the file shows exactly what they could see). */
  viewer: ReportViewer;
  fileKey: string;
  requestedAt: string;
}

export interface ExportJobState {
  data: ExportJobData;
  state: "queued" | "processing" | "completed" | "failed";
  result: { fileName: string; bytes: number; rows: number } | null;
  failedReason: string | null;
}

export interface ExportQueue {
  enqueue(jobId: string, data: ExportJobData): Promise<void>;
  get(jobId: string): Promise<ExportJobState | null>;
}

/** Signed, expiring download links (no session needed to follow one). */
export interface LinkSigner {
  sign(path: string, expiresAt: Date): string;
  verify(path: string, expires: string | null, signature: string | null): boolean;
}

/* ───────────────────────── schedules ───────────────────────── */

export type FileFormat = "XLSX" | "PDF" | "BOTH";
export type RunStatus = "RUNNING" | "SUCCESS" | "FAILED";

export interface ScheduleInput {
  reportId: string;
  params: Record<string, string>;
  frequency: Frequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  time: string;
  format: FileFormat;
  recipientUserIds: string[];
  externalEmails: string[];
  isActive: boolean;
}

export interface ScheduleRecord extends ScheduleInput {
  id: string;
  owner: { id: string; name: string };
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastStatus: RunStatus | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Who a generated file was made for: a recipient never gets data beyond these. */
export interface FileAudience {
  flags: SensitiveFlags;
  warehouseIds: string[];
}

export interface RunFile {
  key: string;
  name: string;
  format: "XLSX" | "PDF";
  audience: FileAudience;
}

export interface RunRecord {
  id: string;
  scheduleId: string;
  trigger: "SCHEDULE" | "MANUAL";
  startedAt: Date;
  finishedAt: Date | null;
  status: RunStatus;
  error: string | null;
  rowCount: number | null;
  fileKeys: string[];
  files: RunFile[];
  emailed: number;
}

export interface ScheduleFilters {
  ownerId?: string;
  reportId?: string;
}

export interface ScheduleStore {
  list(q: ListQuery<ScheduleFilters>): Promise<{ items: ScheduleRecord[]; total: number }>;
  count(filters: ScheduleFilters): Promise<number>;
  get(id: string): Promise<ScheduleRecord | null>;
  create(ownerId: string, input: ScheduleInput, nextRunAt: Date | null): Promise<ScheduleRecord>;
  update(id: string, input: Partial<ScheduleInput>, nextRunAt: Date | null | undefined): Promise<ScheduleRecord>;
  delete(id: string): Promise<void>;
  /**
   * Claims every active schedule due at `now` — each row locked (FOR UPDATE SKIP LOCKED) so two
   * workers never claim the same one — moves its nextRunAt forward and opens a RUNNING run.
   */
  claimDue(now: Date, next: (s: ScheduleRecord) => Date, limit: number): Promise<{ schedule: ScheduleRecord; runId: string }[]>;
  startRun(scheduleId: string, trigger: "SCHEDULE" | "MANUAL"): Promise<string>;
  finishRun(runId: string, data: { status: RunStatus; error?: string | null; rowCount?: number | null; files?: RunFile[]; emailed?: number }): Promise<void>;
  runs(scheduleId: string, page: number, pageSize: number): Promise<{ items: RunRecord[]; total: number }>;
  run(runId: string): Promise<RunRecord | null>;
  /** Active users among the ids (name + email), for recipient checks. */
  users(ids: string[]): Promise<{ id: string; name: string; email: string | null }[]>;
}

/** The current permissions of a user (null: missing or disabled). */
export interface ViewerSource {
  forUser(userId: string): Promise<ReportViewer | null>;
}

export interface ReportMailer {
  /** Queues one email with attachments (files already in storage). */
  send(to: string, subject: string, content: { title: string; paragraphs: string[]; link?: string | null; linkLabel?: string }, attachments: { filename: string; fileKey: string; contentType: string }[]): Promise<void>;
  /** In-app + email notice to every Admin that a schedule could not run. */
  notifyAdmins(title: string, body: string, link: string): Promise<void>;
}

export type AuditSink = (actor: ActorContext, entry: { action: string; entityType: string; entityId: string | null; before?: unknown; after?: unknown }) => Promise<void>;

/* ───────────────────────── dashboard ───────────────────────── */

export interface DashboardCache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  clear(): Promise<void>;
}
