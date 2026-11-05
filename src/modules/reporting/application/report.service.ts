import { parseSort, pageMeta, type SortField } from "@/shared/pagination/list-query";
import { hasLevel } from "@/shared/rbac/levels";
import { ReportErrors } from "../domain/errors";
import type { ColumnDef, ReportFlags, ReportRow, ReportViewer, TotalDef } from "../domain/types";
import { canSee, chartVisible, seesOverheads, stripRow, stripTotals, visibleColumns, visibleTotals } from "../domain/visibility";
import { cleanParams, filterLines, parseParams } from "./params";
import type { FilterLine, Lookups, ParsedParams, ReportDefinition, ReportRegistry, RunContext, RunOutput, WarehouseRef } from "./ports";

export const SCREEN_MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;

/** Audit record types only overhead viewers may see (see the audit log report). */
const OVERHEAD_RECORD_TYPES = new Set(["WarehouseCost"]);

/** True when the viewer may see / run the report at all (report-level `requires`). */
export const canRun = (def: ReportDefinition, flags: ReportFlags) => !def.requires || canSee(def.requires, flags);

const totalsOf = (def: ReportDefinition, flags: ReportFlags) => (typeof def.totals === "function" ? def.totals(flags) : def.totals);

/** A report ready to run for one viewer: validated filters, scope and the columns they may see. */
export interface PreparedReport {
  def: ReportDefinition;
  raw: Record<string, string>;
  params: ParsedParams;
  ctx: RunContext;
  columns: ColumnDef[];
  totalDefs: TotalDef[];
  sort: SortField[];
  rowActionAllowed: boolean;
}

export class ReportService {
  constructor(private readonly d: { registry: ReportRegistry; lookups: Lookups; now?: () => Date }) {}

  private now() {
    return this.d.now?.() ?? new Date();
  }

  definition(id: string): ReportDefinition {
    const def = this.d.registry.get(id);
    if (!def) throw ReportErrors.unknownReport();
    return def;
  }

  private rowActionAllowed(def: ReportDefinition, viewer: ReportViewer) {
    const r = def.rowAction?.requires;
    return !!def.rowAction && (!r || hasLevel(viewer.permissions[r[0]], r[1]));
  }

  /** The reports this viewer may run (reports needing e.g. overhead access are left out without it). */
  available(viewer: ReportViewer): ReportDefinition[] {
    return this.d.registry.all().filter((def) => canRun(def, viewer.flags));
  }

  /** Every report this viewer may run, with its filters and the columns / totals / chart they would get. */
  async catalog(viewer: ReportViewer) {
    const warehouses = await this.d.lookups.warehouses(viewer.warehouseIds);
    return this.available(viewer).map((def) => {
      const chart = def.chart?.(viewer.flags) ?? null;
      return {
        ...def.meta,
        params: def.params,
        sortFields: def.sortFields,
        defaultSort: def.defaultSort,
        columns: visibleColumns(def.columns(warehouses, viewer.flags), viewer.flags),
        totals: visibleTotals(totalsOf(def, viewer.flags), viewer.flags),
        chart: chart && canSee(chart.requires, viewer.flags) ? chart : null,
        rowAction: this.rowActionAllowed(def, viewer) ? def.rowAction! : null,
      };
    });
  }

  /**
   * Validates access, filters and scope. A report needing flags the viewer lacks (e.g. overhead
   * access) is a 403; so is a warehouse outside the viewer's scope (never an empty report).
   */
  async prepare(viewer: ReportViewer, id: string, input: Record<string, unknown>, sortRaw?: string): Promise<PreparedReport> {
    const def = this.definition(id);
    if (!canRun(def, viewer.flags)) throw ReportErrors.reportForbidden();
    const raw = cleanParams(def.params, input);
    const now = this.now();
    const params = parseParams(def.params, raw, now);
    const wh = def.params.find((p) => p.kind === "warehouse");
    const chosen = wh ? (params[wh.key] as string | undefined) : undefined;
    if (chosen && !viewer.warehouseIds.includes(chosen)) throw ReportErrors.outOfScope();
    const warehouses = await this.d.lookups.warehouses(viewer.warehouseIds);
    return {
      def,
      raw,
      params,
      ctx: { viewer, scope: chosen ? [chosen] : [...viewer.warehouseIds], warehouses, now },
      columns: visibleColumns(def.columns(warehouses, viewer.flags), viewer.flags),
      totalDefs: visibleTotals(totalsOf(def, viewer.flags), viewer.flags),
      sort: parseSort(sortRaw, def.sortFields, def.defaultSort),
      rowActionAllowed: this.rowActionAllowed(def, viewer),
    };
  }

  /** Removes hidden columns, totals, chart and (without the permission) row actions. */
  shape(p: PreparedReport, out: RunOutput) {
    const rows = out.rows.map((r) => {
      const row = stripRow(r, p.columns);
      if (!p.rowActionAllowed) {
        if (row._links) delete row._links._action;
        delete row._id;
      }
      return row;
    });
    return { rows, total: out.total, totals: stripTotals(out.totals, p.totalDefs), chart: chartVisible(out.chart, p.ctx.viewer.flags) };
  }

  /** One page for the screen / API (page size ≤ 200). */
  async run(viewer: ReportViewer, id: string, query: Record<string, string>) {
    const p = await this.prepare(viewer, id, query, query.sort);
    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const pageSize = Math.min(SCREEN_MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(query.pageSize) || DEFAULT_PAGE_SIZE)));
    const out = await p.def.run(p.params, { page, pageSize, offset: (page - 1) * pageSize, sort: p.sort, summary: true }, p.ctx);
    const shaped = this.shape(p, out);
    return {
      report: { ...p.def.meta, columns: p.columns, totals: p.totalDefs, rowAction: p.rowActionAllowed ? (p.def.rowAction ?? null) : null },
      params: p.raw,
      rows: shaped.rows,
      meta: pageMeta(shaped.total, page, pageSize),
      totals: shaped.totals,
      chart: shaped.chart,
    };
  }

  /** Streams every row (exports / scheduled files) in chunks, already stripped. */
  async *allRows(p: PreparedReport, limit: number, chunk = 2000): AsyncIterable<ReportRow[]> {
    for (let offset = 0; offset < limit; offset += chunk) {
      const take = Math.min(chunk, limit - offset);
      const out = await p.def.run(p.params, { page: 1, pageSize: take, offset, sort: p.sort, summary: false }, p.ctx);
      const rows = this.shape(p, out).rows;
      if (rows.length) yield rows;
      if (out.rows.length < take) return;
    }
  }

  filters(p: PreparedReport): Promise<FilterLine[]> {
    return filterLines(p.def.params, p.raw, p.params, p.ctx.warehouses as WarehouseRef[], this.d.lookups);
  }

  /** Filter options; overhead record types (audit log) only for overhead viewers. */
  async options(viewer: ReportViewer) {
    const o = await this.d.lookups.options(viewer.warehouseIds);
    return seesOverheads(viewer.flags) ? o : { ...o, recordTypes: o.recordTypes.filter((t) => !OVERHEAD_RECORD_TYPES.has(t)) };
  }

  products(q: string) {
    return this.d.lookups.products(q, 20);
  }
}
