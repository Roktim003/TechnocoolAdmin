import type { Job } from "bullmq";
import { getQueue, QUEUES } from "@/shared/queue/queue";
import { redis } from "@/shared/redis/redis";
import type { AlertGate, FailedJob, QueueInspector } from "../application/jobs.service";

const iso = (ms: number | undefined) => (ms ? new Date(ms).toISOString() : null);

function toFailed(j: Job): FailedJob {
  return {
    id: String(j.id),
    name: j.name,
    // First line only: stack traces stay in the worker logs.
    error: (j.failedReason ?? "Unknown error").split("\n")[0]!.slice(0, 500),
    attempts: j.attemptsMade,
    maxAttempts: j.opts.attempts ?? 1,
    failedAt: iso(j.finishedOn),
    createdAt: iso(j.timestamp),
  };
}

/** BullMQ queues read through the same Redis as the worker. */
export const bullInspector: QueueInspector = {
  names: () => Object.values(QUEUES),
  async counts(queue) {
    const c = await getQueue(queue).getJobCounts("waiting", "active", "delayed", "completed", "failed", "paused", "prioritized", "waiting-children");
    return {
      waiting: (c.waiting ?? 0) + (c.prioritized ?? 0) + (c["waiting-children"] ?? 0),
      active: c.active ?? 0,
      delayed: c.delayed ?? 0,
      completed: c.completed ?? 0,
      failed: c.failed ?? 0,
      paused: c.paused ?? 0,
    };
  },
  async failed(queue, start, end) {
    return (await getQueue(queue).getFailed(start, end)).filter(Boolean).map(toFailed);
  },
  async retry(queue, jobId) {
    const job = await getQueue(queue).getJob(jobId);
    if (!job) return "not_found";
    if (!(await job.isFailed())) return "not_failed";
    await job.retry("failed");
    return "retried";
  },
  async failedSince(since) {
    const out: { queue: string; job: FailedJob }[] = [];
    for (const queue of Object.values(QUEUES)) {
      // Newest first; stop at the first one older than `since` (bounded to 1,000 per queue).
      for (let start = 0; start < 1000; start += 100) {
        const page = (await getQueue(queue).getFailed(start, start + 99)).filter(Boolean);
        const recent = page.filter((j) => (j.finishedOn ?? 0) >= since.getTime());
        out.push(...recent.map((j) => ({ queue, job: toFailed(j) })));
        if (page.length < 100 || recent.length < page.length) break;
      }
    }
    return out;
  },
};

export const redisAlertGate: AlertGate = {
  async once(key, ttlSeconds) {
    return (await redis().set(`alert:${key}`, "1", "EX", ttlSeconds, "NX")) === "OK";
  },
};
