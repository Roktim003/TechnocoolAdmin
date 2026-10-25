import { Queue, QueueEvents } from "bullmq";
import { bullConnection } from "@/shared/redis/redis";

/** Queue names. Later modules add their own (e.g. "reports", "notifications"). */
export const QUEUES = {
  system: "system",
  catalogImport: "catalog-import",
  documents: "documents",
  openingImport: "opening-import",
  /** Outgoing email (retries with exponential backoff). */
  email: "email",
  /** Low-stock checks after postings and the daily digest. */
  alerts: "alerts",
  /** Purchasing: the daily overdue-PO digest. */
  purchasing: "purchasing",
  /** Projects: cost-used alerts (90 % / 100 % of the contract value). */
  projects: "projects",
  /** Reporting: Excel / PDF exports, the scheduler tick and scheduled report runs. */
  reports: "reports",
  /** Operations: database backups (2:00 AM) and restore tests (monthly). Needs pg_dump and the backup volume. */
  backups: "backups",
  /** Operations: the nightly integrity check (2:30 AM). */
  integrity: "integrity",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface SystemJobs {
  /** Smoke-test job: proves the app → Redis → worker path works. */
  ping: { message: string; requestedAt: string };
}

export type SystemJobName = keyof SystemJobs;

const globalForQueues = globalThis as unknown as { queues?: Map<string, Queue> };

function prefix(): string {
  return `${process.env.REDIS_KEY_PREFIX ?? "sb:"}bull`;
}

export function getQueue(name: string): Queue {
  globalForQueues.queues ??= new Map();
  let q = globalForQueues.queues.get(name);
  if (!q) {
    q = new Queue(name, {
      connection: bullConnection(),
      prefix: prefix(),
      defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000 },
    });
    globalForQueues.queues.set(name, q);
  }
  return q;
}

export function enqueueSystemJob<N extends SystemJobName>(name: N, data: SystemJobs[N]) {
  return getQueue(QUEUES.system).add(name, data);
}

export function queueEvents(name: string): QueueEvents {
  return new QueueEvents(name, { connection: bullConnection(), prefix: prefix() });
}

export const queuePrefix = prefix;

/** Closes the queue connections this process opened (graceful shutdown). */
export async function closeQueues(): Promise<void> {
  const open = [...(globalForQueues.queues?.values() ?? [])];
  globalForQueues.queues?.clear();
  await Promise.allSettled(open.map((q) => q.close()));
}
