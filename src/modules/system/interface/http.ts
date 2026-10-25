import { auditService } from "@/modules/audit/interface/http";
import { authedRoute, type AuthedContext } from "@/shared/http/route";
import { pageMeta } from "@/shared/pagination/list-query";
import { z } from "@/shared/validation/zod";
import { requestOpsJob, system } from "./container";

/*
 * Thin HTTP adapters for System health and Background jobs. Admin only (users = FULL).
 * Starting a backup / restore test / check and retrying a job are audited.
 */

const ADMIN = { permission: ["users", "FULL"] } as const;

type QueueParams = { queue: string };
type JobParams = { queue: string; jobId: string };

const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

function audit(ctx: AuthedContext<unknown>, action: string, entityId: string, after: Record<string, unknown>) {
  return auditService().record({ actorId: ctx.principal.userId, ip: ctx.ip, requestId: ctx.requestId }, { action, entityType: "System", entityId, before: null, after });
}

async function start(ctx: AuthedContext<unknown>, kind: "backup" | "restoreTest" | "integrity") {
  const r = await requestOpsJob(kind, ctx.principal.userId);
  if (!r.alreadyQueued) await audit(ctx, `system.${kind === "restoreTest" ? "restore_test" : kind}.requested`, r.jobId, { jobId: r.jobId });
  return { status: 202, data: r };
}

export const systemHandlers = {
  health: authedRoute(ADMIN, async () => ({ data: await system().health.snapshot() })),

  backups: authedRoute(ADMIN, async () => ({ data: await system().store.latestBackups(30) })),
  runBackup: authedRoute({ ...ADMIN, idempotent: false }, (ctx) => start(ctx, "backup")),
  runRestoreTest: authedRoute({ ...ADMIN, idempotent: false }, (ctx) => start(ctx, "restoreTest")),
  runIntegrity: authedRoute({ ...ADMIN, idempotent: false }, (ctx) => start(ctx, "integrity")),
  integrity: authedRoute(ADMIN, async () => ({ data: await system().store.latestIntegrity(10) })),

  jobs: authedRoute(ADMIN, async () => ({ data: await system().jobs.overview() })),
  failedJobs: authedRoute<QueueParams>(ADMIN, async (ctx) => {
    const q = ctx.query(PageQuery);
    const { items, total } = await system().jobs.failed(ctx.params.queue, q.page, q.pageSize);
    return { data: items, meta: pageMeta(total, q.page, q.pageSize) };
  }),
  retryJob: authedRoute<JobParams>({ ...ADMIN, idempotent: false }, async (ctx) => {
    const r = await system().jobs.retry(ctx.params.queue, ctx.params.jobId);
    await audit(ctx, "system.job.retry", `${ctx.params.queue}:${ctx.params.jobId}`, r);
    return { data: r };
  }),
};
