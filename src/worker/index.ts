/**
 * BullMQ worker — runs as a separate process from the web app (same image, different command):
 *   node dist/worker.js        (production)
 *   npm run worker             (development)
 */
import { Worker } from "bullmq";
import { env } from "@/shared/config/env";
import { prisma } from "@/shared/db/prisma";
import { logger } from "@/shared/logger/logger";
import { bullConnection } from "@/shared/redis/redis";
import { QUEUES, queuePrefix } from "@/shared/queue/queue";
import { processSystemJob } from "./processors/system";
import { processCatalogImportJob } from "@/modules/catalog/interface/import-jobs";
import { processDocumentJob } from "@/modules/inventory/interface/documents";
import { processAlertJob } from "@/modules/inventory/interface/events";
import { ensureDigestSchedule, processOpeningImportJob } from "@/modules/inventory/interface/jobs";
import { processEmailJob } from "@/modules/notifications/interface/container";
import { wireModules } from "@/modules/bootstrap";
import { PO_DOCUMENT_JOB, processPoDocumentJob } from "@/modules/purchasing/interface/documents";
import { ensurePoDigestSchedule, processPurchasingJob } from "@/modules/purchasing/interface/events";
import { COST_STATEMENT_JOB, processCostStatementJob } from "@/modules/projects/interface/documents";
import { processProjectsJob } from "@/modules/projects/interface/events";
import { processReportJob, registerReportScheduler } from "@/modules/reporting/interface/container";

const log = logger.child({ service: "worker" });

function start() {
  env(); // fail fast on bad configuration
  wireModules();

  const workers = [
    new Worker(QUEUES.system, (job) => processSystemJob(job, log.child({ queue: QUEUES.system })), {
      connection: bullConnection(),
      prefix: queuePrefix(),
      concurrency: 5,
    }),
    // One import at a time: each commit is a single large transaction.
    new Worker(QUEUES.catalogImport, (job) => processCatalogImportJob(job, log.child({ queue: QUEUES.catalogImport })), {
      connection: bullConnection(),
      prefix: queuePrefix(),
      concurrency: 1,
    }),
    // PDF rendering (headless Chromium) — only ever runs in this process. Purchase orders and project cost statements too.
    new Worker(QUEUES.documents, (job) => (job.name === PO_DOCUMENT_JOB ? processPoDocumentJob : job.name === COST_STATEMENT_JOB ? processCostStatementJob : processDocumentJob)(job, log.child({ queue: QUEUES.documents })), {
      connection: bullConnection(),
      prefix: queuePrefix(),
      concurrency: 2,
    }),
    // Opening-stock validation, one file at a time.
    new Worker(QUEUES.openingImport, (job) => processOpeningImportJob(job, log.child({ queue: QUEUES.openingImport })), {
      connection: bullConnection(),
      prefix: queuePrefix(),
      concurrency: 1,
    }),
    // Outgoing email; BullMQ retries failures with exponential backoff (EMAIL_MAX_ATTEMPTS).
    new Worker(QUEUES.email, (job) => processEmailJob(job, log.child({ queue: QUEUES.email })), {
      connection: bullConnection(),
      prefix: queuePrefix(),
      concurrency: 3,
    }),
    // Low-stock crossings after postings, and the daily digest (repeatable job).
    new Worker(QUEUES.alerts, (job) => processAlertJob(job, log.child({ queue: QUEUES.alerts })), {
      connection: bullConnection(),
      prefix: queuePrefix(),
      concurrency: 1,
    }),
    // Purchasing: the daily overdue-PO digest (repeatable job, 09:00 Asia/Dhaka).
    // Projects: cost-used alerts after costs, issues / returns and contract changes.
    new Worker(QUEUES.projects, (job) => processProjectsJob(job, log.child({ queue: QUEUES.projects })), {
      connection: bullConnection(),
      prefix: queuePrefix(),
      concurrency: 2,
    }),
    new Worker(QUEUES.purchasing, (job) => processPurchasingJob(job, log.child({ queue: QUEUES.purchasing })), {
      connection: bullConnection(),
      prefix: queuePrefix(),
      concurrency: 1,
    }),
    // Reports: Excel / PDF exports, the every-minute scheduler tick and scheduled runs (PDFs render here).
    new Worker(QUEUES.reports, (job) => processReportJob(job, log.child({ queue: QUEUES.reports })), {
      connection: bullConnection(),
      prefix: queuePrefix(),
      concurrency: 2,
    }),
  ];

  for (const w of workers) {
    w.on("failed", (job, err) => log.error({ err, jobId: job?.id, queue: w.name, job: job?.name }, "job failed"));
    w.on("error", (err) => log.error({ err, queue: w.name }, "worker error"));
  }
  log.info({ queues: workers.map((w) => w.name) }, "worker started");
  // The app runs migrations on release; until they are done the settings table may not exist yet.
  const schedule = (attempt: number) =>
    ensureDigestSchedule(log).catch((err) => {
      log.warn({ err, attempt }, "could not schedule the low-stock digest yet; retrying");
      if (attempt < 40) setTimeout(() => void schedule(attempt + 1), 15_000);
      else log.error({ err }, "gave up scheduling the low-stock digest");
    });
  void schedule(1);
  ensurePoDigestSchedule(log).catch((err) => log.error({ err }, "could not schedule the PO overdue digest"));
  registerReportScheduler().catch((err) => log.error({ err }, "could not register the report scheduler"));

  const shutdown = async (signal: string) => {
    log.info({ signal }, "worker shutting down");
    await Promise.allSettled(workers.map((w) => w.close()));
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

start();
