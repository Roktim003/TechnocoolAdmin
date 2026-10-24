import { NotFoundError } from "@/shared/errors/app-error";
import { authedRoute, type AuthedContext, type BaseContext } from "@/shared/http/route";
import { pageMeta } from "@/shared/pagination/list-query";
import { requireAnyPermission } from "@/shared/rbac/guards";
import type { Principal } from "@/shared/auth/principal";
import { UuidSchema } from "@/shared/validation/zod";
import {
  AddCostSchema,
  ChangeStatusSchema,
  CostListQuerySchema,
  CreateProjectSchema,
  EntriesQuerySchema,
  ProjectListQuerySchema,
  ProjectOptionsQuerySchema,
  UpdateProjectSchema,
  VoidCostSchema,
} from "../application/dto";
import type { AttachmentTarget } from "../application/attachment.service";
import type { ProjectsActor } from "../application/ports";
import { ProjectErrors } from "../domain/errors";
import { projects } from "./container";
import { costSubtotals, toActivityDto, toCostDto, toEntryRowDto, toHistoryDto, toMaterialDto, toProjectAttachmentDto, toProjectDto, toProjectOptionDto } from "./mappers";

/* Thin HTTP adapters: parse + validate → call the service → map. */

const VIEW = { permission: ["projects", "VIEW"] } as const;
const CREATE = { permission: ["projects", "CREATE"] } as const;
const FULL = { permission: ["projects", "FULL"] } as const;
/** State changes that must never run twice on a retry. */
const ACTION = (level: "CREATE" | "FULL") => ({ permission: ["projects", level] as const, idempotent: "required" as const });
/** The stock form (Store Managers have projects NONE) and the PO form need project choices. */
const OPTION_READERS = [["inventory", "CREATE"], ["projects", "VIEW"], ["purchasing", "CREATE"]] as const;

type IdParams = { id: string };
type CostParams = { id: string; costId: string };

/** The projects actor for a principal (API requests and server-rendered pages). */
export function projectsActor(p: Principal, ip: string | null = null, requestId: string | null = null): ProjectsActor {
  return {
    actorId: p.userId,
    name: p.name,
    ip,
    requestId,
    level: p.permissions.projects,
    inventoryLevel: p.permissions.inventory,
    purchasingLevel: p.permissions.purchasing,
    warehouseIds: p.warehouseIds,
    canSeeCost: p.flags.seeCost,
    canSeeMargin: p.flags.seeMargin,
    isAdmin: p.isAdmin,
  };
}
const actorOf = (ctx: AuthedContext<unknown>) => projectsActor(ctx.principal, ctx.ip, ctx.requestId);

function uuid(value: string | undefined, entity: string): string {
  const parsed = UuidSchema.safeParse(value);
  if (!parsed.success) throw new NotFoundError(entity);
  return parsed.data;
}
const id = (ctx: BaseContext<IdParams>) => uuid(ctx.params.id, "Project");
const costTarget = (ctx: BaseContext<CostParams>): AttachmentTarget => ({ kind: "cost", projectId: uuid(ctx.params.id, "Project"), costId: uuid(ctx.params.costId, "Cost") });
const p = () => projects();

const detail = async (ctx: AuthedContext<unknown>, projectId: string) => {
  const a = actorOf(ctx);
  const r = await p().projects.detail(a, projectId);
  return toProjectDto(r.project, r.summary, a, r.transitions);
};

async function files(ctx: BaseContext<unknown>) {
  const form = await ctx.form();
  const list = await Promise.all(
    [...form.getAll("file"), ...form.getAll("files")]
      .filter((v): v is File => typeof v === "object" && v !== null && "arrayBuffer" in v)
      .map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
  );
  const label = typeof form.get("label") === "string" ? String(form.get("label")).slice(0, 100) || null : null;
  return { list, label };
}

/* ─────────────── projects ─────────────── */

export const projectHandlers = {
  list: authedRoute(VIEW, async (ctx) => {
    const a = actorOf(ctx);
    const query = ctx.query(ProjectListQuerySchema);
    const r = await p().projects.list({ filters: query.filters, q: query.q, sort: query.sort, skip: query.skip, take: query.take });
    return { data: r.items.map((x) => toProjectDto(x.project, x.summary, a)), meta: { ...pageMeta(r.total, query.page, query.pageSize), statusCounts: r.statusCounts } };
  }),
  create: authedRoute(CREATE, async (ctx) => {
    const created = await p().projects.create(actorOf(ctx), await ctx.body(CreateProjectSchema));
    return { status: 201, data: await detail(ctx, created.id), headers: { Location: `/api/v1/projects/${created.id}` } };
  }),
  get: authedRoute<IdParams>(VIEW, async (ctx) => ({ data: await detail(ctx, id(ctx)) })),
  update: authedRoute<IdParams>(CREATE, async (ctx) => {
    const projectId = id(ctx);
    await p().projects.update(actorOf(ctx), projectId, await ctx.body(UpdateProjectSchema));
    return { data: await detail(ctx, projectId) };
  }),
  deactivate: authedRoute<IdParams>(FULL, async (ctx) => {
    const projectId = id(ctx);
    await p().projects.update(actorOf(ctx), projectId, { isActive: false });
    return { data: await detail(ctx, projectId) };
  }),
  status: authedRoute<IdParams>(ACTION("CREATE"), async (ctx) => {
    const projectId = id(ctx);
    const input = await ctx.body(ChangeStatusSchema);
    await p().projects.changeStatus(actorOf(ctx), projectId, input.toStatus, input.reason);
    return { data: await detail(ctx, projectId) };
  }),
  statusHistory: authedRoute<IdParams>(VIEW, async (ctx) => {
    const projectId = id(ctx);
    await p().projects.get(projectId);
    return { data: (await p().projects.history(projectId)).map(toHistoryDto) };
  }),
  activity: authedRoute<IdParams>(VIEW, async (ctx) => {
    const a = actorOf(ctx);
    const r = await p().projects.activity(id(ctx));
    return { data: { statusHistory: r.history.map(toHistoryDto), audit: r.audit.map((x) => toActivityDto(x, a)) } };
  }),
  siteEngineers: authedRoute(CREATE, async () => ({ data: await p().projects.siteEngineers() })),
  options: authedRoute({}, async (ctx) => {
    requireAnyPermission(ctx.principal, OPTION_READERS);
    const q = ctx.query(ProjectOptionsQuerySchema);
    return { data: (await p().projects.options(q.type, q.q)).map(toProjectOptionDto) };
  }),

  /* material */
  material: authedRoute<IdParams>(VIEW, async (ctx) => {
    const a = actorOf(ctx);
    const projectId = id(ctx);
    const project = await p().projects.get(projectId);
    const [rows, summary] = await Promise.all([p().costing.material(projectId), p().costing.summary(project)]);
    return {
      data: { lines: rows.map((m) => toMaterialDto(m, a)), totals: a.canSeeCost ? { issuedCost: summary.issuedCost, returnedCost: summary.returnedCost, netMaterialCost: summary.netMaterialCost } : {} },
    };
  }),
  movements: authedRoute<IdParams>(VIEW, async (ctx) => {
    const a = actorOf(ctx);
    const projectId = id(ctx);
    await p().projects.get(projectId);
    const query = ctx.query(EntriesQuerySchema);
    const r = await p().stock.entries(projectId, { skip: query.skip, take: query.take }, query.filters);
    return { data: r.items.map((e) => toEntryRowDto(e, a)), meta: pageMeta(r.total, query.page, query.pageSize) };
  }),

  /* costs */
  costs: authedRoute<IdParams>(VIEW, async (ctx) => {
    const a = actorOf(ctx);
    const query = ctx.query(CostListQuerySchema);
    const rows = await p().costs.list(id(ctx), query);
    return { data: { costs: rows.map((c) => toCostDto(c, a)), subtotals: costSubtotals(rows, a) } };
  }),
  addCost: authedRoute<IdParams>(ACTION("CREATE"), async (ctx) => {
    const c = await p().costs.add(actorOf(ctx), id(ctx), await ctx.body(AddCostSchema));
    return { status: 201, data: toCostDto(c, actorOf(ctx)) };
  }),
  voidCost: authedRoute<CostParams>(ACTION("FULL"), async (ctx) => {
    const t = costTarget(ctx);
    if (t.kind !== "cost") throw new NotFoundError("Cost");
    const input = await ctx.body(VoidCostSchema);
    return { data: toCostDto(await p().costs.void(actorOf(ctx), t.projectId, t.costId, input.reason), actorOf(ctx)) };
  }),

  /* documents */
  costStatement: authedRoute<IdParams>(VIEW, async (ctx) => {
    const a = actorOf(ctx);
    if (!a.canSeeCost) throw ProjectErrors.costHidden();
    const projectId = id(ctx);
    await p().projects.get(projectId);
    const r = await p().documents.enqueue({ projectId, userId: a.actorId, userName: a.name, showMargin: a.canSeeMargin });
    return { status: 202, data: { jobId: r.jobId, kind: "PROJECT_COST_STATEMENT", status: "queued" }, headers: { Location: `/api/v1/documents/${r.jobId}` } };
  }),
};

/* ─────────────── attachments (project files; cost receipts) ─────────────── */

function attachmentHandlers<P extends IdParams>(target: (ctx: BaseContext<P>) => AttachmentTarget) {
  return {
    list: authedRoute<P>(VIEW, async (ctx) => {
      const t = target(ctx);
      return { data: (await p().attachments.list(t)).map((x) => toProjectAttachmentDto(x, t.projectId)) };
    }),
    add: authedRoute<P>({ ...CREATE, idempotent: false }, async (ctx) => {
      const t = target(ctx);
      const f = await files(ctx);
      return { status: 201, data: (await p().attachments.upload(actorOf(ctx), t, f.list, f.label)).map((x) => toProjectAttachmentDto(x, t.projectId)) };
    }),
    file: authedRoute<P & { attachmentId: string }>(VIEW, async (ctx) => {
      const f = await p().attachments.file(target(ctx), uuid(ctx.params.attachmentId, "Attachment"));
      return { file: { body: f.body, contentType: f.mimeType, filename: f.fileName, inline: true, cacheSeconds: 300 } };
    }),
    remove: authedRoute<P & { attachmentId: string }>(CREATE, async (ctx) => {
      await p().attachments.remove(actorOf(ctx), target(ctx), uuid(ctx.params.attachmentId, "Attachment"));
      return { status: 204 };
    }),
  };
}

export const projectAttachmentHandlers = attachmentHandlers<IdParams>((ctx) => ({ kind: "project", projectId: id(ctx) }));
export const costAttachmentHandlers = attachmentHandlers<CostParams>(costTarget);
