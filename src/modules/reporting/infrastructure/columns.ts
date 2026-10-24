import { ENTRY_TYPE_META, ENTRY_TYPES } from "@/modules/inventory/domain/types";
import { PO_STATUS_LABEL, PO_STATUSES } from "@/modules/purchasing/domain/types";
import { PROJECT_STATUS_LABEL, PROJECT_STATUSES } from "@/modules/projects/domain/types";
import type { Db } from "@/shared/db/prisma";
import type { ColumnDef, Requirement, TagStyle, TotalDef } from "../domain/types";
import type { ParsedParams, ReportDefinition, RunContext, RunOutput, RunRequest } from "../application/ports";
import { readOnly } from "./sql";

type Opt = Partial<ColumnDef>;

export const text = (key: string, label: string, o: Opt = {}): ColumnDef => ({ key, label, type: "text", align: "start", requires: "none", ...o });
export const qtyCol = (key: string, label: string, o: Opt = {}): ColumnDef => ({ key, label, type: "number", align: "end", requires: "none", decimals: 3, width: 12, ...o });
export const countCol = (key: string, label: string, o: Opt = {}): ColumnDef => ({ key, label, type: "number", align: "end", requires: "none", decimals: 0, width: 10, ...o });
export const percentCol = (key: string, label: string, requires: Requirement, o: Opt = {}): ColumnDef => ({ key, label, type: "number", align: "end", requires, decimals: 1, percent: true, negativeRed: true, width: 10, ...o });
export const moneyCol = (key: string, label: string, requires: Requirement = "seeCost", o: Opt = {}): ColumnDef => ({ key, label, type: "money", align: "end", requires, width: 16, ...o });
export const dateCol = (key: string, label: string, o: Opt = {}): ColumnDef => ({ key, label, type: "date", align: "start", requires: "none", width: 12, ...o });
export const tagCol = (key: string, label: string, tags: Record<string, TagStyle>, o: Opt = {}): ColumnDef => ({ key, label, type: "tag", align: "start", requires: "none", tags, width: 16, ...o });

export const moneyTotal = (key: string, label: string, requires: Requirement = "seeCost"): TotalDef => ({ key, label, type: "money", requires });
export const qtyTotal = (key: string, label: string): TotalDef => ({ key, label, type: "number", requires: "none", decimals: 3 });
export const countTotal = (key: string, label: string): TotalDef => ({ key, label, type: "number", requires: "none", decimals: 0 });

/* Tag colours: the same as the module screens. */

const ENTRY_TYPE_KIND: Record<string, TagStyle["kind"]> = { GRN_IMPORT: "green", GRN_LOCAL: "green", RETURN_FROM_SITE: "green", OPENING: "green", ISSUE_TO_PROJECT: "blue", SALE: "blue", RETURN_TO_SUPPLIER: "blue", DAMAGE_WRITE_OFF: "red", TRANSFER: "purple", REVERSAL: "gray", STOCK_ADJUSTMENT: "yellow" };
export const ENTRY_TYPE_TAGS: Record<string, TagStyle> = Object.fromEntries(ENTRY_TYPES.map((t) => [t, { label: ENTRY_TYPE_META[t].label, kind: ENTRY_TYPE_KIND[t]! }]));

export const ENTRY_STATUS_TAGS: Record<string, TagStyle> = {
  DRAFT: { label: "Draft", kind: "blue" },
  PENDING: { label: "Pending", kind: "yellow" },
  POSTED: { label: "Posted", kind: "green" },
  REJECTED: { label: "Rejected", kind: "red" },
  CANCELLED: { label: "Cancelled", kind: "gray" },
  REVERSED: { label: "Reversed", kind: "gray" },
  DISPATCHED: { label: "Dispatched", kind: "purple" },
  RECEIVED: { label: "Received", kind: "green" },
};

const PO_KIND: Record<string, TagStyle["kind"]> = { DRAFT: "gray", PENDING_APPROVAL: "yellow", REJECTED: "red", APPROVED: "blue", SENT: "purple", PARTLY_RECEIVED: "yellow", FULLY_RECEIVED: "green", CLOSED: "gray", CANCELLED: "gray" };
export const PO_STATUS_TAGS: Record<string, TagStyle> = Object.fromEntries(PO_STATUSES.map((s) => [s, { label: PO_STATUS_LABEL[s], kind: PO_KIND[s]! }]));

const PROJECT_KIND: Record<string, TagStyle["kind"]> = { PLANNING: "blue", RUNNING: "green", ON_HOLD: "yellow", COMPLETED: "purple", CLOSED: "gray" };
export const PROJECT_STATUS_TAGS: Record<string, TagStyle> = Object.fromEntries(PROJECT_STATUSES.map((s) => [s, { label: PROJECT_STATUS_LABEL[s], kind: PROJECT_KIND[s]! }]));

export const SERIAL_STATUS_TAGS: Record<string, TagStyle> = {
  IN_STOCK: { label: "In stock", kind: "green" },
  RESERVED: { label: "Reserved", kind: "yellow" },
  IN_TRANSIT: { label: "In transit", kind: "purple" },
  ISSUED: { label: "Issued to project", kind: "blue" },
  SOLD: { label: "Sold", kind: "blue" },
  RETURNED_TO_SUPPLIER: { label: "Returned to supplier", kind: "gray" },
  WRITTEN_OFF: { label: "Written off", kind: "gray" },
  DAMAGED: { label: "Damaged", kind: "red" },
};

export const OVERDUE_TAGS: Record<string, TagStyle> = { OVERDUE: { label: "Overdue", kind: "red" }, ON_TIME: { label: "On time", kind: "green" }, NO_DATE: { label: "No date", kind: "gray" } };

/** A report whose `query` runs inside the read-only, time-limited transaction. */
export interface SqlReport extends Omit<ReportDefinition, "run"> {
  query(db: Db, p: ParsedParams, req: RunRequest, ctx: RunContext): Promise<RunOutput>;
}

export function defineReport(r: SqlReport): ReportDefinition {
  const { query, ...def } = r;
  return { ...def, run: (p, req, ctx) => readOnly((db) => query(db, p, req, ctx)) };
}

/** Typed accessors for parsed params. */
export const str = (p: ParsedParams, k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined);
export const date = (p: ParsedParams, k: string) => (p[k] instanceof Date ? (p[k] as Date) : undefined);
export const bool = (p: ParsedParams, k: string) => p[k] === true;

/** Export chunks after the first: rows only (no count, totals or chart). */
export const rowsOnly = (rows: RunOutput["rows"]): RunOutput => ({ rows, total: 0, totals: {}, chart: null });
