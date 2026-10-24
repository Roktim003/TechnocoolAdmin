import { SENSITIVE_FIELDS } from "@/shared/rbac/sensitive-fields";
import type { SensitiveFlag, SensitiveFlags } from "@/shared/rbac/levels";
import type { ChartData, ColumnDef, ReportRow, ReportTotals, Requirement, TotalDef } from "./types";

/** True when `flags` unlock `requires`. */
export function canSee(requires: Requirement, flags: SensitiveFlags): boolean {
  return requires === "none" || flags[requires];
}

export const visibleColumns = (cols: ColumnDef[], flags: SensitiveFlags) => cols.filter((c) => canSee(c.requires, flags));
export const visibleTotals = (totals: TotalDef[], flags: SensitiveFlags) => totals.filter((t) => canSee(t.requires, flags));

/**
 * Keeps only the visible columns' values (plus `_links` / `_id` for the UI). Hidden values are
 * removed from the row itself — not just from the header — so they never reach JSON or a file.
 */
export function stripRow(row: ReportRow, columns: ColumnDef[]): ReportRow {
  const out: ReportRow = {};
  for (const c of columns) out[c.key] = row[c.key] ?? null;
  if (row._id) out._id = row._id;
  if (row._links) {
    const keep = new Set([...columns.filter((c) => c.link).map((c) => c.key), "_action"]);
    const links = Object.fromEntries(Object.entries(row._links).filter(([k]) => keep.has(k)));
    if (Object.keys(links).length) out._links = links;
  }
  return out;
}

export function stripTotals(totals: ReportTotals, defs: TotalDef[]): ReportTotals {
  return Object.fromEntries(defs.map((t) => [t.key, totals[t.key] ?? null]));
}

/** The flags a viewer and a recipient both have (a recipient never gets more than they could see). */
export function intersectFlags(a: SensitiveFlags, b: SensitiveFlags): SensitiveFlags {
  return { seeCost: a.seeCost && b.seeCost, seeProfit: a.seeProfit && b.seeProfit, seeMargin: a.seeMargin && b.seeMargin };
}

/** Field names a role without the flag must not see (used for audit before/after values). */
export function hiddenFieldNames(flags: SensitiveFlags): Set<string> {
  const hidden = new Set<string>();
  for (const f of Object.keys(SENSITIVE_FIELDS) as SensitiveFlag[]) if (!flags[f]) for (const k of SENSITIVE_FIELDS[f]) hidden.add(k);
  return hidden;
}

/** A chart whose values the viewer may not see is dropped (not shown empty). */
export function chartVisible(chart: ChartData | null, flags: SensitiveFlags): ChartData | null {
  return chart && canSee(chart.requires, flags) ? chart : null;
}
