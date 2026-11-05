import { NotFoundError } from "@/shared/errors/app-error";
import type { Principal } from "@/shared/auth/principal";
import { authedRoute, type AuthedContext, type BaseContext } from "@/shared/http/route";
import { pageMeta } from "@/shared/pagination/list-query";
import { canSeeOverheads, hasLevel } from "@/shared/rbac/levels";
import { UuidSchema } from "@/shared/validation/zod";
import { CreateWarehouseCostSchema, SummaryQuerySchema, UpdateWarehouseCostSchema, VoidWarehouseCostSchema, WarehouseCostListQuerySchema } from "../application/dto";
import type { OverheadsActor } from "../application/ports";
import { overheads } from "./container";
import { toCostAttachmentDto, toWarehouseCostDto, toWarehouseCostHistoryDto } from "./mappers";
import { summaryWorkbook } from "../infrastructure/summary-xlsx";
import { formatDateTime } from "@/shared/time/format";

/* Thin HTTP adapters: parse + validate → call the service → map. */

/** Reading needs overheads ≥ VIEW (+ seeCost, checked by the service); writing overheads ≥ CREATE. */
const VIEW = { permission: ["overheads", "VIEW"] } as const;
const CREATE = { permission: ["overheads", "CREATE"] } as const;

type IdParams = { id: string };

export function overheadsActor(p: Principal, ip: string | null = null, requestId: string | null = null): OverheadsActor {
  return {
    actorId: p.userId,
    name: p.name,
    ip,
    requestId,
    level: p.permissions.overheads,
    canSee: canSeeOverheads(p),
    canEdit: hasLevel(p.permissions.overheads, "CREATE") && p.flags.seeCost,
    warehouseIds: p.warehouseIds,
  };
}
const actorOf = (ctx: AuthedContext<unknown>) => overheadsActor(ctx.principal, ctx.ip, ctx.requestId);

function uuid(value: string | undefined, entity: string): string {
  const parsed = UuidSchema.safeParse(value);
  if (!parsed.success) throw new NotFoundError(entity);
  return parsed.data;
}
const id = (ctx: BaseContext<IdParams>) => uuid(ctx.params.id, "Warehouse cost");
const s = () => overheads().costs;

export const warehouseCostHandlers = {
  list: authedRoute(VIEW, async (ctx) => {
    const a = actorOf(ctx);
    const query = ctx.query(WarehouseCostListQuerySchema);
    const r = await s().list(a, query);
    return { data: r.items.map((c) => toWarehouseCostDto(c, a)), meta: pageMeta(r.total, query.page, query.pageSize), extra: { totals: { amount: r.totalAmount } } };
  }),
  create: authedRoute(CREATE, async (ctx) => {
    const a = actorOf(ctx);
    const r = await s().create(a, await ctx.body(CreateWarehouseCostSchema));
    return { status: 201, data: { ...toWarehouseCostDto(r.cost, a), warnings: r.warnings }, headers: { Location: `/api/v1/warehouse-costs/${r.cost.id}` } };
  }),
  get: authedRoute<IdParams>(VIEW, async (ctx) => {
    const a = actorOf(ctx);
    return { data: toWarehouseCostDto(await s().get(a, id(ctx)), a) };
  }),
  update: authedRoute<IdParams>(CREATE, async (ctx) => {
    const a = actorOf(ctx);
    const costId = id(ctx);
    const r = await s().update(a, costId, await ctx.body(UpdateWarehouseCostSchema));
    return { data: { ...toWarehouseCostDto(r.cost, a), warnings: r.warnings } };
  }),
  void: authedRoute<IdParams>({ ...CREATE, idempotent: "required" }, async (ctx) => {
    const a = actorOf(ctx);
    const costId = id(ctx);
    const { reason } = await ctx.body(VoidWarehouseCostSchema);
    return { data: toWarehouseCostDto(await s().void(a, costId, reason), a) };
  }),
  history: authedRoute<IdParams>(VIEW, async (ctx) => {
    const a = actorOf(ctx);
    const r = await s().history(a, id(ctx));
    return { data: { cost: toWarehouseCostDto(r.cost, a), history: toWarehouseCostHistoryDto(r.rows) } };
  }),
  summary: authedRoute(VIEW, async (ctx) => {
    const q = ctx.query(SummaryQuerySchema);
    return { data: await s().summary(actorOf(ctx), q) };
  }),
  /** The same summary as an Excel file. */
  summaryExport: authedRoute(VIEW, async (ctx) => {
    const a = actorOf(ctx);
    const r = await s().summary(a, ctx.query(SummaryQuerySchema));
    const body = await summaryWorkbook(r, { generatedBy: a.name, generatedAt: formatDateTime(new Date()) });
    return { file: { body, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename: `warehouse-costs-${r.monthFrom.slice(0, 7)}-to-${r.monthTo.slice(0, 7)}.xlsx` } };
  }),

  /* receipts and bills */
  listAttachments: authedRoute<IdParams>(VIEW, async (ctx) => {
    const costId = id(ctx);
    return { data: (await s().attachments(actorOf(ctx), costId)).map((x) => toCostAttachmentDto(x, costId)) };
  }),
  addAttachments: authedRoute<IdParams>({ ...CREATE, idempotent: false }, async (ctx) => {
    const costId = id(ctx);
    const form = await ctx.form();
    const files = await Promise.all(
      [...form.getAll("file"), ...form.getAll("files")]
        .filter((v): v is File => typeof v === "object" && v !== null && "arrayBuffer" in v)
        .map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
    );
    const label = typeof form.get("label") === "string" ? String(form.get("label")).slice(0, 100) || null : null;
    return { status: 201, data: (await s().upload(actorOf(ctx), costId, files, label)).map((x) => toCostAttachmentDto(x, costId)) };
  }),
  attachmentFile: authedRoute<IdParams & { attachmentId: string }>(VIEW, async (ctx) => {
    const f = await s().file(actorOf(ctx), id(ctx), uuid(ctx.params.attachmentId, "Attachment"));
    return { file: { body: f.body, contentType: f.mimeType, filename: f.fileName, inline: true, cacheSeconds: 300 } };
  }),
  removeAttachment: authedRoute<IdParams & { attachmentId: string }>(CREATE, async (ctx) => {
    await s().removeAttachment(actorOf(ctx), id(ctx), uuid(ctx.params.attachmentId, "Attachment"));
    return { status: 204 };
  }),
};
