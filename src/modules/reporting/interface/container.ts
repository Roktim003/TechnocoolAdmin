import type { Job } from "bullmq";
import { auditService } from "@/modules/audit/interface/http";
import { principalForUser } from "@/modules/identity/interface/principal-loader";
import { ADMIN_ROLE_NAME } from "@/modules/identity/domain/seed-roles";
import { renderEmail } from "@/modules/notifications/application/email-template";
import { notifications } from "@/modules/notifications/interface/container";
import { APP_NAME } from "@/shared/config/constants";
import { env } from "@/shared/config/env";
import { prisma } from "@/shared/db/prisma";
import type { Logger } from "@/shared/logger/logger";
import { getQueue, QUEUES } from "@/shared/queue/queue";
import { storage } from "@/shared/storage/storage";
import { DashboardService } from "../application/dashboard.service";
import { ExportService, ReportFiles } from "../application/export.service";
import type { AuditSink, ExportJobData, ExportJobState, ExportQueue, FileStore, ReportMailer, ViewerSource } from "../application/ports";
import { ReportService } from "../application/report.service";
import { ScheduleService } from "../application/schedule.service";
import type { ReportViewer } from "../domain/types";
import { dashboardQueries, redisDashboardCache } from "../infrastructure/dashboard-queries";
import { reportFileWriter } from "../infrastructure/file-writer";
import { prismaLookups } from "../infrastructure/lookups";
import { prismaScheduleStore } from "../infrastructure/prisma-schedule.store";
import { reportRegistry } from "../infrastructure/registry";
import { hmacLinkSigner } from "../infrastructure/signer";

/** Job names on the `reports` queue. */
export const REPORT_JOBS = { export: "report-export", tick: "scheduler-tick", run: "schedule-run" } as const;

const STATES: Record<string, ExportJobState["state"]> = { waiting: "queued", delayed: "queued", "waiting-children": "queued", prioritized: "queued", active: "processing", completed: "completed", failed: "failed" };

const bullExportQueue: ExportQueue = {
  async enqueue(jobId, data) {
    // Kept a day (the download link lives 1 hour); one retry for a transient failure.
    await getQueue(QUEUES.reports).add(REPORT_JOBS.export, data, { jobId, attempts: 2, removeOnComplete: { age: 24 * 3600 }, removeOnFail: { age: 24 * 3600 } });
  },
  async get(jobId) {
    const job = await getQueue(QUEUES.reports).getJob(jobId);
    if (!job || job.name !== REPORT_JOBS.export) return null;
    const state = STATES[await job.getState()] ?? "queued";
    return { data: job.data as ExportJobData, state, result: (job.returnvalue as ExportJobState["result"]) ?? null, failedReason: job.failedReason ?? null };
  },
};

const fileStore: FileStore = {
  put: (key, body, contentType) => storage().put(key, body, contentType),
  get: async (key) => {
    const obj = await storage().get(key);
    return obj ? { body: obj.body, contentType: obj.contentType } : null;
  },
};

/** A principal's report view (the same shape the API, exports and schedules use). */
export function viewerOf(p: { userId: string; name: string; isAdmin: boolean; permissions: ReportViewer["permissions"]; flags: ReportViewer["flags"]; warehouseIds: string[] }): ReportViewer {
  return { userId: p.userId, name: p.name, isAdmin: p.isAdmin, permissions: p.permissions, flags: p.flags, warehouseIds: [...p.warehouseIds] };
}

const viewers: ViewerSource = {
  async forUser(userId) {
    const p = await principalForUser(userId);
    return p ? viewerOf(p) : null;
  },
};

const mailer: ReportMailer = {
  async send(to, subject, content, attachments) {
    const { html, text } = renderEmail({ ...content, footer: "Sent by StockBook scheduled reports. Ask the schedule's owner to change or stop it." });
    await notifications().service.queueEmail({ to, subject, html, text, attachments }, null);
  },
  async notifyAdmins(title, body, link) {
    const roles = await prisma.role.findMany({ where: { name: ADMIN_ROLE_NAME }, select: { id: true } });
    const userIds = await notifications().recipients.withRoles(roles.map((r) => r.id));
    await notifications().service.publish({ type: "REPORT_SCHEDULE_FAILED", userIds, title, body, link });
  },
};

const audit: AuditSink = (actor, entry) => auditService().record(actor, entry);

function build() {
  const reports = new ReportService({ registry: reportRegistry, lookups: prismaLookups(prisma) });
  const files = new ReportFiles({ reports, writer: reportFileWriter, companyName: () => process.env.COMPANY_NAME ?? APP_NAME });
  const exports = new ExportService({ reports, files, queue: bullExportQueue, store: fileStore, signer: hmacLinkSigner, audit });
  const schedules = new ScheduleService({
    store: prismaScheduleStore(prisma),
    reports,
    files,
    fileStore,
    viewers,
    mailer,
    audit,
    enqueueRun: async (runId) => {
      await getQueue(QUEUES.reports).add(REPORT_JOBS.run, { runId }, { jobId: `run-${runId}`, attempts: 1, removeOnComplete: { age: 7 * 24 * 3600 }, removeOnFail: { age: 7 * 24 * 3600 } });
    },
    appUrl: () => env().APP_URL,
  });
  const dashboard = new DashboardService({ queries: dashboardQueries, cache: redisDashboardCache });
  return { reports, files, exports, schedules, dashboard, viewers };
}

let instance: ReturnType<typeof build> | undefined;

export function reporting() {
  return (instance ??= build());
}

/* ───────────── worker ───────────── */

/** Every minute, Asia/Dhaka (one repeatable job however many workers run). */
export async function registerReportScheduler() {
  await getQueue(QUEUES.reports).upsertJobScheduler("report-scheduler", { pattern: "* * * * *", tz: "Asia/Dhaka" }, { name: REPORT_JOBS.tick, data: {}, opts: { removeOnComplete: 100, removeOnFail: 100 } });
}

/** BullMQ processor for the `reports` queue. */
export async function processReportJob(job: Job, log: Logger) {
  const r = reporting();
  switch (job.name) {
    case REPORT_JOBS.export: {
      const result = await r.exports.generate(job.data as ExportJobData);
      log.info({ jobId: job.id, reportId: (job.data as ExportJobData).reportId, ...result }, "report export written");
      return result;
    }
    case REPORT_JOBS.tick: {
      const result = await r.schedules.tick(new Date());
      if (result.claimed) log.info({ ...result }, "report schedules claimed");
      return result;
    }
    case REPORT_JOBS.run: {
      const result = await r.schedules.execute((job.data as { runId: string }).runId);
      log.info({ jobId: job.id, ...result }, "scheduled report run");
      return result;
    }
    default:
      throw new Error(`Unknown reports job ${job.name}`);
  }
}
