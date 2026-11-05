import type { TagKind } from "@/components/ui/Tag";
import { OVERHEAD_LABEL, SCOPE_CATEGORIES, WAREHOUSE_COST_CATEGORIES, type OverheadScope, type WarehouseCostCategory } from "@/modules/overheads/domain/types";
import type { MonthlySummary } from "@/modules/overheads/application/warehouse-cost.service";
import type { toCostAttachmentDto, toWarehouseCostDto, toWarehouseCostHistoryDto } from "@/modules/overheads/interface/mappers";

export { OVERHEAD_LABEL, SCOPE_CATEGORIES, WAREHOUSE_COST_CATEGORIES, type OverheadScope, type WarehouseCostCategory };

export type WarehouseCostDto = ReturnType<typeof toWarehouseCostDto>;
export type CostAttachmentDto = ReturnType<typeof toCostAttachmentDto>;
export type CostHistoryRow = ReturnType<typeof toWarehouseCostHistoryDto>[number];
export interface SummaryDto {
  monthFrom: string;
  monthTo: string;
  months: MonthlySummary[];
}

export interface CostWarning {
  code: string;
  message: string;
}

export interface WarehouseCostCaps {
  /** overheads ≥ CREATE + seeCost: add, edit, void, upload receipts */
  canEdit: boolean;
}

export interface WarehouseOption {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export const SCOPE_LABEL: Record<OverheadScope, string> = { WAREHOUSE: "Warehouse", COMPANY: "Company" };

/** Short labels for tags and the chart (the full label stays in selects). */
export const CATEGORY_SHORT: Record<WarehouseCostCategory, string> = { STORE_CHARGE: "Store charge", HOLDING: "Holding cost", ESTABLISHMENT: "Established cost" };
export const CATEGORY_TAG: Record<WarehouseCostCategory, TagKind> = { STORE_CHARGE: "blue", HOLDING: "green", ESTABLISHMENT: "purple" };

/* ── months ("YYYY-MM" in inputs, "YYYY-MM-01" from the API) ── */

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const parts = (m: string) => [Number(m.slice(0, 4)), Number(m.slice(5, 7))] as const;

/** "2026-11-01" → "Nov 2026" (or "November 2026"). */
export function monthLabel(m: string | null | undefined, long = false): string {
  if (!m || !/^\d{4}-\d{2}/.test(m)) return "—";
  const [y, mo] = parts(m);
  return `${(long ? LONG : SHORT)[mo - 1]} ${y}`;
}

/** This month in Asia/Dhaka, "YYYY-MM". */
export const thisMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date()).slice(0, 7);

/** "2026-11" + n months → "YYYY-MM". */
export function addMonths(m: string, n: number): string {
  const [y, mo] = parts(m);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/* ── exact decimal-string sums (no floats): "1250.50" + "10.00" → "1260.50" ── */

function toCents(v: string | null | undefined): bigint {
  const s = (v ?? "0").trim() || "0";
  const neg = s.startsWith("-");
  const [i = "0", f = ""] = s.replace("-", "").split(".");
  const n = BigInt(`${i || "0"}${`${f}00`.slice(0, 2)}`);
  return neg ? -n : n;
}

export function addMoney(...values: (string | null | undefined)[]): string {
  const c = values.reduce((a, v) => a + toCents(v), BigInt(0));
  const neg = c < BigInt(0);
  const digits = (neg ? -c : c).toString().padStart(3, "0");
  return `${neg ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
