import { NotFoundError, ValidationError } from "@/shared/errors/app-error";
import { QUEUE_LABELS } from "../domain/types";
import type { AdminNotifier } from "./ports";

export interface QueueCounts {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: number;
}

export interface FailedJob {
  id: string;
  name: string;
  error: string;
  attempts: number;
  maxAttempts: number;
  failedAt: string | null;
  createdAt: string | null;
}

/** What the jobs page needs from BullMQ (infrastructure/bull-inspector.ts). */
export interface QueueInspector {
  names(): string[];
  counts(queue: string): Promise<QueueCounts>;
  failed(queue: string, start: number, end: number): Promise<FailedJob[]>;
  retry(queue: string, jobId: string): Promise<"retried" | "not_found" | "not_failed">;
  /** Failed jobs whose last attempt finished after `since`, across all queues. */
  failedSince(since: Date): Promise<{ queue: string; job: FailedJob }[]>;
}

export interface AlertGate {
  /** True the first time it is called for `key` within `ttlSeconds` (so one alert per hour). */
  once(key: string, ttlSeconds: number): Promise<boolean>;
}

export class JobsService {
  constructor(private readonly d: { inspector: QueueInspector; notifier: AdminNotifier; gate: AlertGate; threshold: () => number; now?: () => Date }) {}

  private known(queue: string) {
    if (!this.d.inspector.names().includes(queue)) throw new NotFoundError("Queue");
  }

  async overview() {
    const queues = await Promise.all(
      this.d.inspector.names().map(async (name) => ({ name, label: QUEUE_LABELS[name] ?? name, counts: await this.d.inspector.counts(name) })),
    );
    const since = new Date((this.d.now?.() ?? new Date()).getTime() - 3600_000);
    const lastHour = await this.d.inspector.failedSince(since);
    return { queues, failedLastHour: lastHour.length, threshold: this.d.threshold() };
  }

  async failed(queue: string, page: number, pageSize: number) {
    this.known(queue);
    const start = (page - 1) * pageSize;
    const [counts, items] = await Promise.all([this.d.inspector.counts(queue), this.d.inspector.failed(queue, start, start + pageSize - 1)]);
    return { items, total: counts.failed };
  }

  async retry(queue: string, jobId: string) {
    this.known(queue);
    const r = await this.d.inspector.retry(queue, jobId);
    if (r === "not_found") throw new NotFoundError("Job");
    if (r === "not_failed") throw new ValidationError("Only failed jobs can be retried.");
    return { queue, jobId, retried: true };
  }

  /** Every 5 minutes (worker): one alert per hour when failures in the last hour pass the threshold. */
  async checkFailures(): Promise<{ failedLastHour: number; alerted: boolean }> {
    const now = this.d.now?.() ?? new Date();
    const recent = await this.d.inspector.failedSince(new Date(now.getTime() - 3600_000));
    const threshold = this.d.threshold();
    if (recent.length <= threshold) return { failedLastHour: recent.length, alerted: false };
    const hour = now.toISOString().slice(0, 13);
    if (!(await this.d.gate.once(`jobs-alert:${hour}`, 3600))) return { failedLastHour: recent.length, alerted: false };
    const byQueue = new Map<string, number>();
    for (const r of recent) byQueue.set(r.queue, (byQueue.get(r.queue) ?? 0) + 1);
    const summary = [...byQueue].map(([q, n]) => `${QUEUE_LABELS[q] ?? q}: ${n}`).join(", ");
    await this.d.notifier.notify("BACKGROUND_JOBS_FAILING", "Background jobs are failing", `${recent.length} jobs failed in the last hour (alert threshold ${threshold}). ${summary}.`, "/admin/jobs");
    return { failedLastHour: recent.length, alerted: true };
  }
}
