import { d } from "@/modules/inventory/domain/decimal";
import { OverheadErrors } from "./errors";
import { LARGE_OVERHEAD_AMOUNT, SCOPE_CATEGORIES, type OverheadScope, type WarehouseCostCategory } from "./types";

/** "2026-11" or "2026-11-17" → "2026-11-01" (null when not a valid month). */
export function monthOf(value: string): string | null {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

/** First day of the month after `month` (YYYY-MM-01). */
export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

/** Months from `from` to `to` (both YYYY-MM-01), inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to && out.length < 600; m = nextMonth(m)) out.push(m);
  return out;
}

/**
 * Scope and category must agree (WAREHOUSE: store charge / holding with a warehouse; COMPANY:
 * established cost, no warehouse); the month can't be more than one month ahead of `today`.
 */
export function validateCost(x: { scope: OverheadScope; category: WarehouseCostCategory; warehouseId: string | null; month: string }, today: string): void {
  if (!SCOPE_CATEGORIES[x.scope].includes(x.category)) throw OverheadErrors.scopeCategory(x.scope);
  if (x.scope === "WAREHOUSE" && !x.warehouseId) throw OverheadErrors.warehouseRequired();
  if (x.scope === "COMPANY" && x.warehouseId) throw OverheadErrors.noWarehouseForCompany();
  const latest = nextMonth(monthOf(today)!);
  if (x.month > latest) throw OverheadErrors.monthTooFar();
}

export function largeAmountWarning(amount: string): { code: string; message: string }[] {
  return d(amount).gt(d(LARGE_OVERHEAD_AMOUNT)) ? [{ code: "OVERHEAD_LARGE_AMOUNT", message: "This overhead entry is above BDT 10,00,000. Check the amount." }] : [];
}

/** Holding cost as a % of the average stock value (2 dp); null without stock. */
export function holdingPercent(holding: string, averageStockValue: string): string | null {
  const avg = d(averageStockValue);
  if (avg.lte(0)) return null;
  return d(holding).div(avg).times(100).toDecimalPlaces(2).toFixed(2);
}
