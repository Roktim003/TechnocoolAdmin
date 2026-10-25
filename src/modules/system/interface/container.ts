import type { Job } from "bullmq";
import { env, optionalServices } from "@/shared/config/env";
import { prisma } from "@/shared/db/prisma";
import { HEARTBEAT_MAX_AGE_MS, readHeartbeats } from "@/shared/lifecycle/heartbeat";
import { processStartedAt } from "@/shared/lifecycle/shutdown";
import type { Logger } from "@/shared/logger/logger";
import { getQueue, QUEUES } from "@/shared/queue/queue";
import { redis } from "@/shared/redis/redis";
import { storageUsage } from "@/shared/storage/storage";
import { notifications } from "@/modules/notifications/interface/container";
import { BackupService } from "../application/backup.service";
import { HealthService } from "../application/health.service";
import { IntegrityService } from "../application/integrity.service";
import { JobsService } from "../application/jobs.service";
import type { AdminNotifier, OpsLogger } from "../application/ports";
import { RestoreTestService } from "../application/restore-test.service";
import type { OpsTrigger } from "../domain/types";
import { LocalBackups, OffsiteBackups } from "../infrastructure/backup-storage";
import { bullInspector, redisAlertGate } from "../infrastructure/bull-inspector";
import { runIntegrityChecks } from "../infrastructure/integrity-queries";
import { pgDump, pgRestore } from "../infrastructure/pg-tools";
import { databaseAdmin, inspectDatabase, prismaOpsStore } from "../infrastructure/prisma-ops.store";

export const OPS_JOBS = {
  backup: "backup",
  restoreTest: "restore-test",
  integrity: "integrity-check",
  failedJobsCheck: "failed-jobs-check",
} as const;

export interface OpsJobData {
  trigger: OpsTrigger;
  requestedById: string | null;
}

/** In-app notification (and email, when SMTP is set) to every active Admin. */
const adminNotifier: AdminNotifier = {
  async notify(type, title, body, link) {
    const roles = await prisma.role.findMany({ where: { isLocked: true }, select: { id: true } });
    const userIds = await notifications().recipients.withRoles(roles.map((r) => r.id));
    await notifications().service.publish({ type, userIds, title, body, link });
  },
};

const consoleLog = (log?: Logger): OpsLogger => log ?? { info: () => undefined, warn: () => undefined, error: () => undefined };

async function emailStatus() {
  const week = new Date(Date.now() - 7 * 86_400_000);
  const [sent, failed, notSent, queued] = await Promise.all([
    prisma.emailLog.findFirst({ where: { status: "SENT" }, orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
    prisma.emailLog.findFirst({ where: { status: { in: ["FAILED", "QUEUED"] }, error: { not: null } }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true, error: true } }),
    prisma.emailLog.count({ where: { status: { in: ["NOT_SENT_SMTP_MISSING", "SKIPPED"] }, createdAt: { gte: week } } }),
    prisma.emailLog.count({ where: { status: "QUEUED" } }),
  ]);
  return {
    configured: optionalServices().email,
    lastSentAt: sent?.sentAt ?? null,
    lastError: failed ? { at: failed.updatedAt, message: failed.error } : null,
    notSentLast7Days: notSent,
    queued,
  };
}

/** Storage usage lists the whole bucket: cached for 10 minutes. */
async function cachedStorageUsage() {
  const key = "system:storage-usage";
  const hit = await redis().get(key).catch(() => null);
  if (hit) return JSON.parse(hit) as { objects: number; bytes: number };
  const usage = await storageUsage();
  await redis().set(key, JSON.stringify(usage), "EX", 600).catch(() => undefined);
  return usage;
}

function build(log?: Logger) {
  const e = env();
  const store = prismaOpsStore(prisma);
  const local = new LocalBackups(e.BACKUP_DIR);
  const offsite = OffsiteBackups.fromEnv(e);
  const policy = { daily: e.BACKUP_KEEP_DAILY, weekly: e.BACKUP_KEEP_WEEKLY, monthly: e.BACKUP_KEEP_MONTHLY };
  const l = consoleLog(log);
  return {
    store,
    local,
    offsite,
    backups: new BackupService({
      store,
      dumper: { dump: (out) => pgDump(e.DATABASE_URL, out) },
      local,
      offsite,
      encryptionKey: e.BACKUP_ENCRYPTION_KEY,
      policy,
      attachmentsBucket: e.S3_BUCKET,
      notifier: adminNotifier,
      log: l,
    }),
    restoreTests: new RestoreTestService({
      store,
      local,
      offsite,
      encryptionKey: e.BACKUP_ENCRYPTION_KEY,
      databaseUrl: e.DATABASE_URL,
      admin: databaseAdmin(prisma),
      restore: pgRestore,
      inspect: inspectDatabase,
      notifier: adminNotifier,
      log: l,
    }),
    integrity: new IntegrityService({ store, check: () => runIntegrityChecks(prisma), notifier: adminNotifier, log: l }),
    jobs: new JobsService({ inspector: bullInspector, notifier: adminNotifier, gate: redisAlertGate, threshold: () => env().FAILED_JOBS_ALERT_THRESHOLD }),
    health: new HealthService({
      store,
      app: () => ({ version: e.APP_VERSION, commit: e.GIT_COMMIT, environment: e.NODE_ENV, startedAt: processStartedAt() }),
      config: () => {
        const o = optionalServices(e);
        return {
          email: o.email,
          offsiteBackup: o.offsiteBackup,
          offsiteLocation: offsite?.location ?? null,
          backupEncryption: o.backupEncryption,
          errorTracking: o.errorTracking,
          backupDir: e.BACKUP_DIR,
          appUrlHttps: e.APP_URL.startsWith("https:"),
          cookieSecure: e.COOKIE_SECURE,
          production: e.NODE_ENV === "production",
        };
      },
      databaseBytes: async () => Number((await prisma.$queryRaw<[{ n: bigint }]>`SELECT pg_database_size(current_database())::bigint AS n`)[0].n),
      storageUsage: cachedStorageUsage,
      email: emailStatus,
      heartbeats: readHeartbeats,
      heartbeatMaxAgeMs: HEARTBEAT_MAX_AGE_MS,
    }),
  };
}

let instance: ReturnType<typeof build> | undefined;

export function system(log?: Logger) {
  return (instance ??= build(log));
}

/** Tests only: rebuild after changing the environment. */
export function resetSystem() {
  instance = undefined;
}

/* ── queueing (web) ── */

const once = { removeOnComplete: { age: 30 * 86_400 }, removeOnFail: { age: 30 * 86_400 } };

/**
 * On-demand runs from System health. One backup / restore test / check at a time: the job id
 * dedupes a second click while one is still waiting or running.
 */
export async function requestOpsJob(kind: "backup" | "restoreTest" | "integrity", requestedById: string): Promise<{ jobId: string; alreadyQueued: boolean }> {
  const queue = kind === "integrity" ? QUEUES.integrity : QUEUES.backups;
  const name = OPS_JOBS[kind];
  const jobId = `manual-${name}`;
  const existing = await getQueue(queue).getJob(jobId);
  if (existing && ["waiting", "active", "delayed", "prioritized"].includes(await existing.getState())) return { jobId, alreadyQueued: true };
  if (existing) await existing.remove().catch(() => undefined);
  await getQueue(queue).add(name, { trigger: "MANUAL", requestedById } satisfies OpsJobData, { jobId, attempts: 1, ...once });
  return { jobId, alreadyQueued: false };
}

/* ── worker ── */

/** Repeatable jobs (Asia/Dhaka), registered by the process that consumes the queue. */
export async function registerOpsSchedules(queues: string[]) {
  const opts = { attempts: 1, removeOnComplete: 50, removeOnFail: 100 };
  const data: OpsJobData = { trigger: "SCHEDULED", requestedById: null };
  if (queues.includes(QUEUES.backups)) {
    await getQueue(QUEUES.backups).upsertJobScheduler("backup-nightly", { pattern: "0 2 * * *", tz: "Asia/Dhaka" }, { name: OPS_JOBS.backup, data, opts });
    await getQueue(QUEUES.backups).upsertJobScheduler("restore-test-monthly", { pattern: "0 4 1 * *", tz: "Asia/Dhaka" }, { name: OPS_JOBS.restoreTest, data, opts });
  }
  if (queues.includes(QUEUES.integrity)) {
    await getQueue(QUEUES.integrity).upsertJobScheduler("integrity-nightly", { pattern: "30 2 * * *", tz: "Asia/Dhaka" }, { name: OPS_JOBS.integrity, data, opts });
  }
  if (queues.includes(QUEUES.system)) {
    await getQueue(QUEUES.system).upsertJobScheduler("failed-jobs-check", { pattern: "*/5 * * * *", tz: "Asia/Dhaka" }, { name: OPS_JOBS.failedJobsCheck, data: {}, opts: { attempts: 1, removeOnComplete: 20, removeOnFail: 50 } });
  }
}

/** Processor for the `backups` and `integrity` queues (and the failed-jobs check on `system`). */
export async function processOpsJob(job: Job, log: Logger) {
  const s = system(log);
  const data = job.data as OpsJobData;
  switch (job.name) {
    case OPS_JOBS.backup: {
      const r = await s.backups.run(data.trigger, data.requestedById);
      return { file: r.run.fileName, sizeBytes: r.run.sizeBytes, location: r.location };
    }
    case OPS_JOBS.restoreTest: {
      const r = await s.restoreTests.run(data.trigger, data.requestedById);
      return { passed: r.passed, backupFile: (r as { backupFile?: string }).backupFile };
    }
    case OPS_JOBS.integrity: {
      const r = await s.integrity.run(data.trigger, data.requestedById);
      return { id: r.id, passed: r.passed };
    }
    case OPS_JOBS.failedJobsCheck:
      return s.jobs.checkFailures();
    default:
      throw new Error(`Unknown operations job: ${job.name}`);
  }
}
