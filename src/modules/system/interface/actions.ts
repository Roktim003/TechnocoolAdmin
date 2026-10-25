"use server";

import { auditService } from "@/modules/audit/interface/http";
import { authedAction, type ActionContext } from "@/shared/http/action";
import { requestOpsJob, system } from "./container";

/*
 * Server Actions behind the buttons on System health and Background jobs. Each one goes through
 * authedAction (same principal resolver, permission check and rate limit as the API) and calls
 * the same services as the matching /api/v1/system endpoint.
 */

const ADMIN = { permission: ["users", "FULL"] } as const;

async function start(ctx: ActionContext, kind: "backup" | "restoreTest" | "integrity") {
  const r = await requestOpsJob(kind, ctx.principal.userId);
  if (!r.alreadyQueued) {
    await auditService().record(
      { actorId: ctx.principal.userId, ip: ctx.ip, requestId: ctx.requestId },
      { action: `system.${kind === "restoreTest" ? "restore_test" : kind}.requested`, entityType: "System", entityId: r.jobId, before: null, after: { jobId: r.jobId } },
    );
  }
  return r;
}

export const runBackupNowAction = authedAction(ADMIN, async (ctx) => start(ctx, "backup"));

export const runRestoreTestAction = authedAction(ADMIN, async (ctx) => start(ctx, "restoreTest"));

export const runIntegrityCheckAction = authedAction(ADMIN, async (ctx) => start(ctx, "integrity"));

export const retryJobAction = authedAction(ADMIN, async (ctx, queue: string, jobId: string) => {
  const r = await system().jobs.retry(String(queue), String(jobId));
  await auditService().record({ actorId: ctx.principal.userId, ip: ctx.ip, requestId: ctx.requestId }, { action: "system.job.retry", entityType: "System", entityId: `${queue}:${jobId}`, before: null, after: r });
  return r;
});
