import { createHash } from "node:crypto";
import { hasLevel } from "@/shared/rbac/levels";
import { addDays, dhakaDate } from "../domain/schedule";
import type { ChartData, ReportViewer } from "../domain/types";
import type { DashboardCache } from "./ports";

export interface KpiWidget {
  id: string;
  kind: "kpi";
  title: string;
  value: string | number;
  valueType: "money" | "number";
  /** Highlight (e.g. overdue POs > 0). */
  tone: "default" | "warning" | "danger";
  caption?: string;
  link: string;
}

export interface ChartWidget {
  id: string;
  kind: "chart";
  chart: ChartData;
  link: string;
}

export interface ListRow {
  primary: string;
  secondary?: string;
  meta?: string;
  link?: string;
  tag?: { label: string; kind: "green" | "red" | "yellow" | "blue" | "purple" | "gray" };
}

export interface ListWidget {
  id: string;
  kind: "list";
  title: string;
  rows: ListRow[];
  empty: string;
  link: string | null;
}

export type Widget = KpiWidget | ChartWidget | ListWidget;

export interface ApprovalItem {
  kind: "entry" | "count" | "po";
  id: string;
  number: string;
  label: string;
  warehouse: string;
  date: string;
  by: string;
}

/** Read-only dashboard queries (infrastructure). `scope` is the viewer's warehouses. */
export interface DashboardQueries {
  stockValue(scope: string[]): Promise<string>;
  lowStock(scope: string[], limit: number): Promise<{ count: number; top: { productId: string; code: string; name: string; available: string; minimum: string; unit: string }[] }>;
  openPos(scope: string[], today: string): Promise<{ open: number; overdue: number }>;
  runningProjects(): Promise<number>;
  transfersToReceive(scope: string[]): Promise<number>;
  byBrand(scope: string[], money: boolean): Promise<{ label: string; value: string }[]>;
  inOut(scope: string[], from: string, to: string): Promise<{ date: string; inQty: string; outQty: string }[]>;
  topIssued(scope: string[], from: string): Promise<{ label: string; value: string }[]>;
  projectCostVsContract(scope: string[]): Promise<{ label: string; cost: string; contract: string }[]>;
  recentActivity(scope: string[], limit: number): Promise<{ id: string; number: string; type: string; typeLabel: string; warehouse: string; postedAt: Date; by: string }[]>;
  /** What this user can approve now: entries / counts in their warehouses created or submitted by others, POs (own only with FULL). */
  approvals(viewer: ReportViewer, limit: number): Promise<{ entries: number; counts: number; pos: number; items: ApprovalItem[] }>;
  myEntries(userId: string, limit: number): Promise<{ id: string; number: string; typeLabel: string; status: string; date: string }[]>;
}

const CACHE_TTL_SECONDS = 60;

const STATUS_TAG: Record<string, ListRow["tag"]> = {
  DRAFT: { label: "Draft", kind: "gray" },
  PENDING: { label: "Pending", kind: "yellow" },
  POSTED: { label: "Posted", kind: "green" },
  REJECTED: { label: "Rejected", kind: "red" },
  CANCELLED: { label: "Cancelled", kind: "gray" },
  REVERSED: { label: "Reversed", kind: "purple" },
  DISPATCHED: { label: "In transit", kind: "blue" },
  RECEIVED: { label: "Received", kind: "green" },
};

const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

export class DashboardService {
  constructor(private readonly d: { queries: DashboardQueries; cache: DashboardCache; now?: () => Date }) {}

  /** Same permissions, flags and scope → same shared widgets. */
  cacheKey(v: ReportViewer): string {
    const raw = JSON.stringify([v.permissions, v.flags, [...v.warehouseIds].sort(), v.isAdmin]);
    return `dash:v1:${createHash("sha256").update(raw).digest("hex").slice(0, 32)}`;
  }

  async build(v: ReportViewer): Promise<{ widgets: Widget[]; cached: boolean; generatedAt: string }> {
    const key = this.cacheKey(v);
    let shared = await this.d.cache.get<{ widgets: Widget[]; generatedAt: string }>(key);
    const cached = !!shared;
    if (!shared) {
      shared = { widgets: await this.sharedWidgets(v), generatedAt: (this.d.now?.() ?? new Date()).toISOString() };
      await this.d.cache.set(key, shared, CACHE_TTL_SECONDS);
    }
    const personal = await this.personalWidgets(v);
    // KPIs first (the approvals tile sits in its spec position), then charts, then lists.
    const kpis = shared.widgets.filter((w) => w.kind === "kpi");
    const pos = kpis.findIndex((w) => w.id === "low-stock");
    kpis.splice(pos >= 0 ? pos + 1 : 0, 0, ...personal.filter((w) => w.kind === "kpi"));
    const lists = shared.widgets.filter((w) => w.kind === "list");
    lists.splice(Math.min(1, lists.length), 0, ...personal.filter((w) => w.kind === "list"));
    return { widgets: [...kpis, ...shared.widgets.filter((w) => w.kind === "chart"), ...lists], cached, generatedAt: shared.generatedAt };
  }

  clearCache() {
    return this.d.cache.clear();
  }

  private async sharedWidgets(v: ReportViewer): Promise<Widget[]> {
    const q = this.d.queries;
    const scope = v.warehouseIds;
    const inv = hasLevel(v.permissions.inventory, "VIEW");
    const pur = hasLevel(v.permissions.purchasing, "VIEW");
    const prj = hasLevel(v.permissions.projects, "VIEW");
    const rep = hasLevel(v.permissions.reports, "VIEW");
    const link = (report: string, screen: string) => (rep ? `/reports?r=${report}` : screen);
    const today = dhakaDate(this.d.now?.() ?? new Date());
    const out: Widget[] = [];

    const [value, low, pos, running, transfers] = await Promise.all([
      inv && v.flags.seeCost ? q.stockValue(scope) : null,
      inv ? q.lowStock(scope, 5) : null,
      pur ? q.openPos(scope, today) : null,
      prj ? q.runningProjects() : null,
      inv ? q.transfersToReceive(scope) : null,
    ]);
    if (value !== null) out.push({ id: "stock-value", kind: "kpi", title: "Stock value", value, valueType: "money", tone: "default", caption: "At average cost, your warehouses", link: link("stock-summary", "/stock?tab=levels") });
    if (low) out.push({ id: "low-stock", kind: "kpi", title: "Low stock items", value: low.count, valueType: "number", tone: low.count ? "warning" : "default", caption: "Below their minimum level", link: link("low-stock", "/stock/low-stock") });
    if (pos) {
      out.push({ id: "open-pos", kind: "kpi", title: "Open POs", value: pos.open, valueType: "number", tone: "default", caption: "Approved, sent or partly received", link: link("open-pos", "/purchases") });
      out.push({ id: "overdue-pos", kind: "kpi", title: "Overdue POs", value: pos.overdue, valueType: "number", tone: pos.overdue ? "danger" : "default", caption: "Past the expected delivery date", link: rep ? "/reports?r=open-pos&overdueOnly=true" : "/purchases?tab=overdue" });
    }
    if (running !== null) out.push({ id: "running-projects", kind: "kpi", title: "Running projects", value: running, valueType: "number", tone: "default", link: rep ? "/reports?r=project-cost-summary&status=RUNNING" : "/projects" });
    if (transfers !== null) out.push({ id: "transfers", kind: "kpi", title: "Transfers to receive", value: transfers, valueType: "number", tone: transfers ? "warning" : "default", caption: "Dispatched to your warehouses", link: "/stock?tab=entries" });

    if (inv) {
      const from = addDays(today, -29);
      const [brands, flow, top] = await Promise.all([q.byBrand(scope, v.flags.seeCost), q.inOut(scope, from, today), q.topIssued(scope, `${today.slice(0, 8)}01`)]);
      out.push({
        id: "by-brand",
        kind: "chart",
        chart: { type: "bar", title: v.flags.seeCost ? "Stock value by brand" : "Stock quantity by brand", valueType: v.flags.seeCost ? "money" : "number", requires: v.flags.seeCost ? "seeCost" : "none", points: brands.map((b) => ({ label: b.label, values: [b.value] })) },
        link: link("stock-summary", "/stock?tab=levels"),
      });
      out.push({
        id: "in-out",
        kind: "chart",
        chart: { type: "line", title: "Stock in vs out, last 30 days (qty)", valueType: "number", requires: "none", series: ["In", "Out"], points: flow.map((f) => ({ label: f.date, values: [f.inQty, f.outQty] })) },
        link: rep ? `/reports?r=stock-movement&dateFrom=${from}&dateTo=${today}` : "/stock?tab=entries",
      });
      out.push({
        id: "top-issued",
        kind: "chart",
        chart: { type: "hbar", title: "Top 10 issued products this month", valueType: "number", requires: "none", points: top.map((t) => ({ label: t.label, values: [t.value] })) },
        link: rep ? "/reports?r=material-by-project&dateFrom=monthStart" : "/projects",
      });
    }
    if (prj && v.flags.seeMargin && v.flags.seeCost) {
      const rows = await q.projectCostVsContract(scope);
      out.push({
        id: "project-cost",
        kind: "chart",
        chart: { type: "stacked", title: "Project cost vs contract value", valueType: "money", requires: "seeMargin", series: ["Total cost", "Remaining contract"], points: rows.map((r) => ({ label: r.label, values: [r.cost, Math.max(0, Number(r.contract) - Number(r.cost)).toFixed(2)] })) },
        link: link("project-cost-summary", "/projects"),
      });
    }

    if (low) {
      out.push({
        id: "low-stock-list",
        kind: "list",
        title: "Low stock",
        rows: low.top.map((r) => ({ primary: `${r.code} · ${r.name}`, meta: `${trim(r.available)} of min ${trim(r.minimum)} ${r.unit}`, tag: { label: "Low", kind: "red" }, link: `/stock/products/${r.productId}` })),
        empty: "Nothing is below its minimum level.",
        link: link("low-stock", "/stock/low-stock"),
      });
    }
    if (inv) {
      const recent = await q.recentActivity(scope, 10);
      out.push({
        id: "recent-activity",
        kind: "list",
        title: "Recent activity",
        rows: recent.map((r) => ({ primary: `${r.number} · ${r.typeLabel}`, secondary: `${r.warehouse} · ${r.by}`, meta: fmtDate(r.postedAt), link: `/stock/${r.id}` })),
        empty: "No posted entries in your warehouses yet.",
        link: rep ? "/reports?r=stock-movement" : "/stock?tab=entries",
      });
    }
    return out;
  }

  /** Per-user widgets (never cached across users). */
  private async personalWidgets(v: ReportViewer): Promise<Widget[]> {
    const out: Widget[] = [];
    const approver = hasLevel(v.permissions.inventory, "APPROVE") || hasLevel(v.permissions.purchasing, "APPROVE");
    if (approver) {
      const a = await this.d.queries.approvals(v, 8);
      const total = a.entries + a.counts + a.pos;
      const parts = [a.entries && `${a.entries} entr${a.entries === 1 ? "y" : "ies"}`, a.counts && `${a.counts} count${a.counts === 1 ? "" : "s"}`, a.pos && `${a.pos} PO${a.pos === 1 ? "" : "s"}`].filter(Boolean);
      out.push({ id: "my-approvals", kind: "kpi", title: "Waiting for my approval", value: total, valueType: "number", tone: total ? "warning" : "default", caption: parts.join(" · ") || "Nothing to approve", link: hasLevel(v.permissions.reports, "VIEW") ? "/reports?r=pending" : "/stock?tab=pending" });
      out.push({
        id: "my-approvals-list",
        kind: "list",
        title: "My pending approvals",
        rows: a.items.map((i) => ({
          primary: `${i.number} · ${i.label}`,
          secondary: `${i.warehouse} · by ${i.by}`,
          meta: i.date,
          link: i.kind === "po" ? `/purchases/${i.id}` : i.kind === "count" ? `/stock/counts/${i.id}` : `/stock/${i.id}`,
          tag: { label: "Waiting", kind: "yellow" },
        })),
        empty: "Nothing is waiting for you.",
        link: null,
      });
    }
    if (hasLevel(v.permissions.inventory, "CREATE")) {
      const mine = await this.d.queries.myEntries(v.userId, 5);
      out.push({
        id: "my-entries",
        kind: "list",
        title: "My recent entries",
        rows: mine.map((e) => ({ primary: `${e.number} · ${e.typeLabel}`, meta: e.date, tag: STATUS_TAG[e.status], link: `/stock/${e.id}` })),
        empty: "You haven't created any stock entries yet.",
        link: "/stock?tab=entries",
      });
    }
    return out;
  }
}

const trim = (q: string) => (q.includes(".") ? q.replace(/\.?0+$/, "") : q);
