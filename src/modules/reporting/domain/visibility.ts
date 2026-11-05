import { OVERHEAD_FIELDS, SENSITIVE_FIELDS } from "@/shared/rbac/sensitive-fields";
import { canSeeOverheads, type PermissionMap, type SensitiveFlag, type SensitiveFlags } from "@/shared/rbac/levels";
import type { ChartData, ColumnDef, ReportFlags, ReportRow, ReportTotals, Requirement, Requires, TotalDef } from "./types";

/**
 * A viewer's report flags from their role: the three sensitive-data flags plus overhead access
 * (overheads ≥ VIEW and seeCost). Computed once, so everything downstream (columns, totals,
 * charts, files, schedule audiences, dashboard) decides from flags alone.
 */
export function reportFlags(p: { permissions: Partial<PermissionMap>; flags: SensitiveFlags }): ReportFlags {
  return { seeCost: p.flags.seeCost, seeProfit: p.flags.seeProfit, seeMargin: p.flags.seeMargin, overheads: canSeeOverheads(p) };
}

function meets(r: Requirement, flags: ReportFlags): boolean {
  if (r === "none") return true;
  // Overhead amounts also need seeCost (defence in depth: the flag is computed with it).
  if (r === "overheads") return flags.overheads === true && flags.seeCost === true;
  return flags[r] === true;
}

/** True when `flags` unlock `requires` (every one of them, for a list). */
export function canSee(requires: Requires, flags: ReportFlags): boolean {
  return typeof requires === "string" ? meets(requires, flags) : requires.every((r) => meets(r, flags));
}

/** Overhead access (store charge, holding, established cost and what is built on them). */
export const seesOverheads = (flags: ReportFlags) => canSee("overheads", flags);

export const visibleColumns = (cols: ColumnDef[], flags: ReportFlags) => cols.filter((c) => canSee(c.requires, flags));
export const visibleTotals = (totals: TotalDef[], flags: ReportFlags) => totals.filter((t) => canSee(t.requires, flags));

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

/**
 * The flags a viewer and a recipient both have (a recipient never gets more than they could
 * see, nor more than the owner): seeCost, seeProfit, seeMargin and overhead access.
 */
export function intersectFlags(a: ReportFlags, b: ReportFlags): ReportFlags {
  return { seeCost: a.seeCost && b.seeCost, seeProfit: a.seeProfit && b.seeProfit, seeMargin: a.seeMargin && b.seeMargin, overheads: seesOverheads(a) && seesOverheads(b) };
}

/** Field names a role without the flag must not see (used for audit before/after values). */
export function hiddenFieldNames(flags: ReportFlags): Set<string> {
  const hidden = new Set<string>();
  for (const f of Object.keys(SENSITIVE_FIELDS) as SensitiveFlag[]) if (!flags[f]) for (const k of SENSITIVE_FIELDS[f]) hidden.add(k);
  if (!seesOverheads(flags)) for (const k of OVERHEAD_FIELDS) hidden.add(k);
  return hidden;
}

/** A chart whose values the viewer may not see is dropped (not shown empty). */
export function chartVisible(chart: ChartData | null, flags: ReportFlags): ChartData | null {
  return chart && canSee(chart.requires, flags) ? chart : null;
}
