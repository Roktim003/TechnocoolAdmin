import type { ColumnDef, TotalDef } from "./types";

/**
 * Display formatting shared by the report screen, PDFs and emails. Money is BDT with thousand
 * separators (Bangladeshi lakh grouping, like every other StockBook screen and document).
 */
const money2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export function formatBdt(v: unknown, withSymbol = true): string {
  if (v === null || v === undefined || v === "") return "—";
  const s = money2.format(v as number);
  return withSymbol ? `৳ ${s}` : s;
}

/** Quantities: thousand separators, trailing zeros trimmed (12.500 → 12.5). */
export function formatNumber(v: unknown, decimals = 3): string {
  if (v === null || v === undefined || v === "") return "—";
  if (decimals === 0) return intFmt.format(v as number);
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(v as number);
}

/** "2026-10-24" → "24 Oct 2026"; an ISO date-time → "24 Oct 2026, 14:05" (Asia/Dhaka). */
export function formatDateValue(v: unknown, withTime = false): string {
  if (!v) return "—";
  const s = String(v);
  if (withTime) return dateTimeFmt.format(new Date(s));
  return dateFmt.format(new Date(`${s.slice(0, 10)}T00:00:00Z`));
}

/** A cell as text (PDF / email / print). */
export function formatCell(c: ColumnDef | TotalDef, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (c.type === "money") return formatBdt(v, false);
  if (c.type === "number") return `${formatNumber(v, c.decimals ?? 3)}${c.percent ? "%" : ""}`;
  if ("tags" in c && c.type === "tag") return c.tags?.[String(v)]?.label ?? String(v);
  if (c.type === "date") return formatDateValue(v, "withTime" in c ? c.withTime : false);
  return String(v);
}

export const isNegative = (v: unknown) => v !== null && v !== undefined && v !== "" && Number(v) < 0;
