import type { ModuleKey, PermissionLevel, PermissionMap, SensitiveFlag, SensitiveFlags } from "@/shared/rbac/levels";

/** Framework-free vocabulary of the report engine. */

export const REPORT_GROUPS = ["Stock", "Purchases", "Projects", "Sales & losses", "Control"] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];

export type ColumnType = "text" | "number" | "money" | "date" | "tag";
/** Which role flag a column / total needs (`none` = everyone who may run the report). */
export type Requirement = SensitiveFlag | "none";

export interface TagStyle {
  label: string;
  kind: "green" | "red" | "yellow" | "blue" | "purple" | "gray";
}

export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  align: "start" | "end";
  requires: Requirement;
  /** number: decimals shown (default 3 for quantities; 0 for counts; 1 for percents). */
  decimals?: number;
  /** number: rendered with a "%" suffix. */
  percent?: boolean;
  /** date: the value is a date-time (shown in Asia/Dhaka). */
  withTime?: boolean;
  /** tag: value → label + colour. */
  tags?: Record<string, TagStyle>;
  /** The cell links to the row's `_links[key]`. */
  link?: boolean;
  /** Sort key accepted by `sort` (omitted: not sortable). */
  sortKey?: string;
  /** Values below zero are shown in red. */
  negativeRed?: boolean;
  /** Column width hint for Excel (characters). */
  width?: number;
}

export interface TotalDef {
  key: string;
  label: string;
  type: "number" | "money";
  requires: Requirement;
  decimals?: number;
  percent?: boolean;
}

export type ChartType = "bar" | "hbar" | "line" | "stacked" | "donut";

export interface ChartSpec {
  type: ChartType;
  title: string;
  /** "money" or "number" values. */
  valueType: "money" | "number";
  /** The flag needed to see the plotted values. */
  requires: Requirement;
  /** Series names for multi-series charts (line / stacked); single series otherwise. */
  series?: string[];
}

export interface ChartPoint {
  label: string;
  /** One value per series (single-series charts: one value). Decimal strings or numbers. */
  values: (string | number)[];
}

export interface ChartData extends ChartSpec {
  points: ChartPoint[];
}

export type ParamKind = "dateFrom" | "dateTo" | "date" | "warehouse" | "catalog" | "category" | "product" | "project" | "supplier" | "customer" | "user" | "select" | "text" | "boolean";

export interface ParamDef {
  key: string;
  label: string;
  kind: ParamKind;
  /** select: allowed values. */
  options?: { value: string; label: string }[];
  /** Pre-filled in the UI (relative date tokens allowed, e.g. "monthStart", "today"). */
  default?: string;
  placeholder?: string;
}

/** A per-row action the UI renders as a link or button. */
export interface RowActionDef {
  kind: "link" | "createPo";
  label: string;
  /** Only shown to users with this module level. */
  requires?: readonly [ModuleKey, PermissionLevel];
}

/** Who runs a report: their permissions, sensitive-data flags and warehouse scope. */
export interface ReportViewer {
  userId: string;
  name: string;
  isAdmin: boolean;
  permissions: PermissionMap;
  flags: SensitiveFlags;
  warehouseIds: string[];
}

export type ReportRow = Record<string, unknown> & {
  /** Links per column key, plus `_action` for the row action. */
  _links?: Record<string, string>;
  /** Row id for the row action (e.g. a product id for "Create PO"). */
  _id?: string;
};

export type ReportTotals = Record<string, string | number | null>;

export interface ReportMeta {
  id: string;
  number: number;
  title: string;
  group: ReportGroup;
  description: string;
  /** Wide reports print landscape. */
  landscape: boolean;
}
