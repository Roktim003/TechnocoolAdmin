import type { ChartInput } from "@/components/charts/Chart";
import type { ColumnDef, ParamDef, ReportGroup, RowActionDef, TotalDef } from "@/modules/reporting/domain/types";

export type { ColumnDef, ParamDef, TotalDef };

export interface ReportsCaps {
  userId: string;
  isFull: boolean;
  canCreatePo: boolean;
}

/** One entry of GET /reports (columns already limited to what this user may see). */
export interface ReportInfo {
  id: string;
  number: number;
  title: string;
  group: ReportGroup;
  description: string;
  landscape: boolean;
  params: ParamDef[];
  sortFields: string[];
  defaultSort: string;
  columns: ColumnDef[];
  totals: TotalDef[];
  chart: { type: string; title: string } | null;
  rowAction: RowActionDef | null;
}

export interface RunResult {
  data: (Record<string, unknown> & { _links?: Record<string, string>; _id?: string })[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
  totals: Record<string, string | number | null>;
  chart: ChartInput | null;
  report: ReportInfo;
  params: Record<string, string>;
}

export interface Lookups {
  warehouses: { id: string; code: string; name: string }[];
  catalogs: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  projects: { id: string; code: string; name: string }[];
  suppliers: { id: string; code: string; name: string }[];
  customers: { id: string; name: string }[];
  users: { id: string; name: string; username: string }[];
  recordTypes: string[];
}

export interface ScheduleDto {
  id: string;
  reportId: string;
  reportTitle: string;
  reportNumber: number;
  params: Record<string, string>;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  time: string;
  description: string;
  format: "XLSX" | "PDF" | "BOTH";
  recipientUserIds: string[];
  externalEmails: string[];
  isActive: boolean;
  owner: { id: string; name: string };
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: "RUNNING" | "SUCCESS" | "FAILED" | null;
}

export interface RunDto {
  id: string;
  trigger: "SCHEDULE" | "MANUAL";
  status: "RUNNING" | "SUCCESS" | "FAILED";
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  rowCount: number | null;
  emailed: number;
  files: { index: number; name: string; format: "XLSX" | "PDF"; downloadable: boolean }[];
}

export const FORMAT_LABEL: Record<ScheduleDto["format"], string> = { XLSX: "Excel", PDF: "PDF", BOTH: "Excel + PDF" };

const dateTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
export const formatDhaka = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : "—");

/** Only the declared filters, without empty values. */
export function cleanFilters(params: ParamDef[], values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of params) {
    const v = values[p.key];
    if (v !== undefined && v !== "") out[p.key] = v;
  }
  return out;
}

/** Filters with each parameter's default filled in (relative date tokens stay tokens). */
export function withDefaults(params: ParamDef[], values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of params) {
    const v = values[p.key] ?? p.default;
    if (v !== undefined && v !== "") out[p.key] = v;
  }
  return out;
}
