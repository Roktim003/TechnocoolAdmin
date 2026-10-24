import { NotFoundError } from "@/shared/errors/app-error";
import { authedRoute, publicRoute, type AuthedContext, type BaseContext } from "@/shared/http/route";
import { pageMeta } from "@/shared/pagination/list-query";
import { UuidSchema } from "@/shared/validation/zod";
import type { ActorContext } from "@/modules/audit/application/audit.service";
import { CreateScheduleSchema, ExportRequestSchema, ProductLookupQuerySchema, RunQuerySchema, RunsQuerySchema, ScheduleListQuerySchema, UpdateScheduleSchema } from "../application/dto";
import type { ScheduleDto } from "../application/schedule.service";
import { reporting, viewerOf } from "./container";

/* Thin HTTP adapters. Every rule (columns, flags, scope, owners) lives in the services. */

const VIEW = { permission: ["reports", "VIEW"] } as const;
const DASHBOARD = { permission: ["dashboard", "VIEW"] } as const;

type IdParams = { id: string };
type RunParams = { id: string; runId: string };

const viewer = (ctx: AuthedContext<unknown>) => viewerOf(ctx.principal);
const actor = (ctx: AuthedContext<unknown>): ActorContext => ({ actorId: ctx.principal.userId, ip: ctx.ip, requestId: ctx.requestId });
const r = () => reporting();

function uuid(value: string | undefined, entity: string): string {
  const parsed = UuidSchema.safeParse(value);
  if (!parsed.success) throw new NotFoundError(entity);
  return parsed.data;
}
const reportId = (ctx: BaseContext<IdParams>) => {
  if (!/^[a-z0-9-]{1,60}$/.test(ctx.params.id ?? "")) throw new NotFoundError("Report");
  return ctx.params.id;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);
export const toScheduleDto = (s: ScheduleDto) => ({
  id: s.id,
  reportId: s.reportId,
  reportTitle: s.reportTitle,
  reportNumber: s.reportNumber,
  params: s.params,
  frequency: s.frequency,
  dayOfWeek: s.dayOfWeek,
  dayOfMonth: s.dayOfMonth,
  time: s.time,
  description: s.description,
  format: s.format,
  recipientUserIds: s.recipientUserIds,
  externalEmails: s.externalEmails,
  isActive: s.isActive,
  owner: s.owner,
  nextRunAt: iso(s.nextRunAt),
  lastRunAt: iso(s.lastRunAt),
  lastStatus: s.lastStatus,
  createdAt: s.createdAt.toISOString(),
  updatedAt: s.updatedAt.toISOString(),
});

/* ─────────────── reports ─────────────── */

export const reportHandlers = {
  catalog: authedRoute(VIEW, async (ctx) => {
    const v = viewer(ctx);
    const [reports, schedules] = await Promise.all([r().reports.catalog(v), r().schedules.count(v)]);
    return { data: reports, extra: { scheduleCount: schedules } };
  }),
  run: authedRoute<IdParams>(VIEW, async (ctx) => {
    ctx.query(RunQuerySchema); // page / pageSize bounds → 400
    const query = Object.fromEntries(ctx.req.nextUrl.searchParams.entries());
    const out = await r().reports.run(viewer(ctx), reportId(ctx), query);
    return { data: out.rows, meta: out.meta, extra: { totals: out.totals, chart: out.chart, report: out.report, params: out.params } };
  }),
  export: authedRoute<IdParams>(VIEW, async (ctx) => {
    const body = await ctx.body(ExportRequestSchema);
    const job = await r().exports.request(viewer(ctx), actor(ctx), reportId(ctx), body.format, body.params, body.sort);
    return { status: 202, data: job, headers: { Location: `/api/v1/exports/${job.jobId}` } };
  }),
  lookups: authedRoute(VIEW, async (ctx) => ({ data: await r().reports.options(viewer(ctx)) })),
  products: authedRoute(VIEW, async (ctx) => ({ data: await r().reports.products(ctx.query(ProductLookupQuerySchema).q) })),
};

export const exportHandlers = {
  status: authedRoute<{ jobId: string }>(VIEW, async (ctx) => ({ data: await r().exports.status(viewer(ctx), uuid(ctx.params.jobId, "Export")) })),
  /** Signed link (no session): the signature and the 1-hour expiry are the authorisation. */
  download: publicRoute<{ jobId: string }>(async (ctx) => {
    const sp = ctx.req.nextUrl.searchParams;
    const f = await r().exports.download(uuid(ctx.params.jobId, "Export"), sp.get("expires"), sp.get("signature"));
    return { file: { body: f.body, contentType: f.contentType, filename: f.fileName } };
  }),
};

/* ─────────────── schedules ─────────────── */

export const scheduleHandlers = {
  list: authedRoute(VIEW, async (ctx) => {
    const q = ctx.query(ScheduleListQuerySchema);
    const out = await r().schedules.list(viewer(ctx), q);
    return { data: out.items.map(toScheduleDto), meta: pageMeta(out.total, q.page, q.pageSize) };
  }),
  create: authedRoute(VIEW, async (ctx) => {
    const s = await r().schedules.create(viewer(ctx), actor(ctx), await ctx.body(CreateScheduleSchema));
    return { status: 201, data: toScheduleDto(s), headers: { Location: `/api/v1/report-schedules/${s.id}` } };
  }),
  get: authedRoute<IdParams>(VIEW, async (ctx) => ({ data: toScheduleDto(await r().schedules.get(viewer(ctx), uuid(ctx.params.id, "Schedule"))) })),
  update: authedRoute<IdParams>(VIEW, async (ctx) => {
    const patch = await ctx.body(UpdateScheduleSchema);
    return { data: toScheduleDto(await r().schedules.update(viewer(ctx), actor(ctx), uuid(ctx.params.id, "Schedule"), patch)) };
  }),
  remove: authedRoute<IdParams>(VIEW, async (ctx) => {
    await r().schedules.remove(viewer(ctx), actor(ctx), uuid(ctx.params.id, "Schedule"));
    return { status: 204 };
  }),
  pause: authedRoute<IdParams>(VIEW, async (ctx) => ({ data: toScheduleDto(await r().schedules.setActive(viewer(ctx), actor(ctx), uuid(ctx.params.id, "Schedule"), false)) })),
  resume: authedRoute<IdParams>(VIEW, async (ctx) => ({ data: toScheduleDto(await r().schedules.setActive(viewer(ctx), actor(ctx), uuid(ctx.params.id, "Schedule"), true)) })),
  runNow: authedRoute<IdParams>(VIEW, async (ctx) => ({ status: 202, data: await r().schedules.runNow(viewer(ctx), actor(ctx), uuid(ctx.params.id, "Schedule")) })),
  runs: authedRoute<IdParams>(VIEW, async (ctx) => {
    const q = ctx.query(RunsQuerySchema);
    const out = await r().schedules.runs(viewer(ctx), uuid(ctx.params.id, "Schedule"), q.page, q.pageSize);
    return {
      data: out.items.map((x) => ({ id: x.id, trigger: x.trigger, status: x.status, startedAt: x.startedAt.toISOString(), finishedAt: iso(x.finishedAt), error: x.error, rowCount: x.rowCount, emailed: x.emailed, files: x.files })),
      meta: pageMeta(out.total, q.page, q.pageSize),
    };
  }),
  file: authedRoute<RunParams & { index: string }>(VIEW, async (ctx) => {
    const index = Number(ctx.params.index);
    if (!Number.isInteger(index) || index < 0 || index > 99) throw new NotFoundError("File");
    const f = await r().schedules.file(viewer(ctx), uuid(ctx.params.id, "Schedule"), uuid(ctx.params.runId, "Run"), index);
    return { file: { body: f.body, contentType: f.contentType, filename: f.fileName } };
  }),
};

/* ─────────────── dashboard ─────────────── */

export const dashboardHandlers = {
  get: authedRoute(DASHBOARD, async (ctx) => {
    const out = await r().dashboard.build(viewer(ctx));
    return { data: out.widgets, extra: { cached: out.cached, generatedAt: out.generatedAt } };
  }),
};
