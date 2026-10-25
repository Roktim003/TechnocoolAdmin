/**
 * BullMQ worker — runs as a separate process from the web app (same image, different command):
 *   docker: `worker`                 (node dist/worker.js)
 *   dev:    npm run worker
 *
 * WORKER_QUEUES picks the queues this process consumes ("*" = all; "*,!backups" = all but
 * backups; "backups" = only backups). In production the backup job runs as its own service
 * (it needs pg_dump and the /backups volume); the main worker takes everything else.
 */
import { Worker, type Job } from "bullmq";
import { env } from "@/shared/config/env";
import { prisma } from "@/shared/db/prisma";
import { logger, type Logger } from "@/shared/logger/logger";
import { bullConnection, redis } from "@/shared/redis/redis";
import { closeQueues, QUEUES, queuePrefix } from "@/shared/queue/queue";
import { startHeartbeat } from "@/shared/lifecycle/heartbeat";
import { onShutdown, shutdown } from "@/shared/lifecycle/shutdown";
import { captureError, flushErrorTracking, initErrorTracking } from "@/shared/monitoring/sentry";
import { processSystemJob } from "./processors/system";
import { selectQueues } from "./select-queues";
import { processCatalogImportJob } from "@/modules/catalog/interface/import-jobs";
import { processDocumentJob } from "@/modules/inventory/interface/documents";
import { processAlertJob } from "@/modules/inventory/interface/events";
import { ensureDigestSchedule, processOpeningImportJob } from "@/modules/inventory/interface/jobs";
import { closePdfBrowser } from "@/modules/inventory/infrastructure/pdf";
import { processEmailJob } from "@/modules/notifications/interface/container";
import { wireModules } from "@/modules/bootstrap";
import { PO_DOCUMENT_JOB, processPoDocumentJob } from "@/modules/purchasing/interface/documents";
import { ensurePoDigestSchedule, processPurchasingJob } from "@/modules/purchasing/interface/events";
import { COST_STATEMENT_JOB, processCostStatementJob } from "@/modules/projects/interface/documents";
import { processProjectsJob } from "@/modules/projects/interface/events";
import { processReportJob, registerReportScheduler } from "@/modules/reporting/interface/container";
import { OPS_JOBS, processOpsJob, registerOpsSchedules } from "@/modules/system/interface/container";

const log = logger.child({ component: "worker" });

type Processor = (job: Job, log: Logger) => Promise<unknown>;

/** Every queue, its processor and how many jobs run at once in one process. */
const QUEUE_DEFS: { name: string; concurrency: number; processor: Processor }[] = [
  { name: QUEUES.system, concurrency: 5, processor: (job, l) => (job.name === OPS_JOBS.failedJobsCheck ? processOpsJob(job, l) : processSystemJob(job, l)) },
  // One import at a time: each commit is a single large transaction.
  { name: QUEUES.catalogImport, concurrency: 1, processor: processCatalogImportJob },
  // PDF rendering (headless Chromium, PDF_CONCURRENCY pages at once): stock documents, POs, project cost statements.
  { name: QUEUES.documents, concurrency: 2, processor: (job, l) => (job.name === PO_DOCUMENT_JOB ? processPoDocumentJob : job.name === COST_STATEMENT_JOB ? processCostStatementJob : processDocumentJob)(job, l) },
  // Opening-stock validation, one file at a time.
  { name: QUEUES.openingImport, concurrency: 1, processor: processOpeningImportJob },
  // Outgoing email; BullMQ retries failures with exponential backoff (EMAIL_MAX_ATTEMPTS).
  { name: QUEUES.email, concurrency: 3, processor: processEmailJob },
  // Low-stock crossings after postings, and the daily digest (repeatable job).
  { name: QUEUES.alerts, concurrency: 1, processor: processAlertJob },
  // Projects: cost-used alerts after costs, issues / returns and contract changes.
  { name: QUEUES.projects, concurrency: 2, processor: processProjectsJob },
  // Purchasing: the daily overdue-PO digest (repeatable job, 09:00 Asia/Dhaka).
  { name: QUEUES.purchasing, concurrency: 1, processor: processPurchasingJob },
  // Reports: Excel / PDF exports, the every-minute scheduler tick and scheduled runs.
  { name: QUEUES.reports, concurrency: 2, processor: processReportJob },
  // Operations: backups and restore tests (one at a time), the nightly integrity check.
  { name: QUEUES.backups, concurrency: 1, processor: processOpsJob },
  { name: QUEUES.integrity, concurrency: 1, processor: processOpsJob },
];

async function start() {
  const e = env(); // fail fast on bad configuration
  await initErrorTracking("worker");
  wireModules();

  const selected = selectQueues(e.WORKER_QUEUES, QUEUE_DEFS.map((q) => q.name));
  if (!selected.length) throw new Error(`WORKER_QUEUES="${e.WORKER_QUEUES}" selects no queue`);

  const workers = QUEUE_DEFS.filter((q) => selected.includes(q.name)).map(
    (q) =>
      new Worker(q.name, (job) => q.processor(job, log.child({ queue: q.name, jobId: job.id, job: job.name })), {
        connection: bullConnection(),
        prefix: queuePrefix(),
        concurrency: q.concurrency,
      }),
  );

  for (const w of workers) {
    w.on("failed", (job, err) => {
      log.error({ err, jobId: job?.id, queue: w.name, job: job?.name, attempt: job?.attemptsMade }, "job failed");
      // The last attempt failed: report it (no-op without SENTRY_DSN).
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) captureError(err, { queue: w.name, job: job.name, jobId: job.id });
    });
    w.on("error", (err) => log.error({ err, queue: w.name }, "worker error"));
  }
  const stopHeartbeat = startHeartbeat(selected);
  log.info({ queues: selected, version: e.APP_VERSION, commit: e.GIT_COMMIT }, "worker started");

  // Repeatable jobs: registered by the process that consumes the queue.
  if (selected.includes(QUEUES.alerts)) {
    // The release runs migrations first; until they are done the settings table may not exist yet.
    const schedule = (attempt: number) =>
      ensureDigestSchedule(log).catch((err) => {
        log.warn({ err, attempt }, "could not schedule the low-stock digest yet; retrying");
        if (attempt < 40) setTimeout(() => void schedule(attempt + 1), 15_000);
        else log.error({ err }, "gave up scheduling the low-stock digest");
      });
    void schedule(1);
  }
  if (selected.includes(QUEUES.purchasing)) ensurePoDigestSchedule(log).catch((err) => log.error({ err }, "could not schedule the PO overdue digest"));
  if (selected.includes(QUEUES.reports)) registerReportScheduler().catch((err) => log.error({ err }, "could not register the report scheduler"));
  registerOpsSchedules(selected).catch((err) => log.error({ err }, "could not register the backup / integrity schedules"));

  // Graceful shutdown (closed in reverse order): Prisma, Redis, queue connections, Chromium, heartbeat.
  onShutdown("prisma", () => prisma.$disconnect());
  onShutdown("redis", () => redis().quit());
  onShutdown("queues", () => closeQueues());
  onShutdown("chromium", () => closePdfBrowser());
  onShutdown("error-tracking", () => flushErrorTracking());
  onShutdown("heartbeat", () => stopHeartbeat());

  const stop = (signal: string) =>
    void shutdown(signal, {
      timeoutMs: e.SHUTDOWN_TIMEOUT_MS,
      log,
      // close() stops taking new jobs and waits for the running ones. Past the timeout the worker
      // connections are dropped: lock renewal stops, and the running jobs go back to the queue
      // (another worker's stalled check moves them to waiting) instead of being lost.
      beforeDrain: async () => {
        const graceful = Promise.allSettled(workers.map((w) => w.close()));
        const finished = await Promise.race([graceful.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), e.SHUTDOWN_TIMEOUT_MS).unref())]);
        if (!finished) {
          log.warn({}, "jobs still running at the shutdown timeout: releasing them back to the queue");
          await Promise.allSettled(workers.map((w) => w.disconnect()));
        }
      },
    });
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
}

start().catch((err) => {
  log.fatal({ err }, "worker could not start");
  process.exit(1);
});
