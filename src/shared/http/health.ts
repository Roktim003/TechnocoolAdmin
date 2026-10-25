import { prisma } from "@/shared/db/prisma";
import { HEARTBEAT_MAX_AGE_MS, readHeartbeats } from "@/shared/lifecycle/heartbeat";
import { isDraining, processStartedAt } from "@/shared/lifecycle/shutdown";
import { getQueue, QUEUES } from "@/shared/queue/queue";
import { redis } from "@/shared/redis/redis";
import { probeStorage } from "@/shared/storage/storage";
import { publicRoute } from "./route";

type Probe = { status: "up" | "down"; latencyMs: number; error?: string };

async function probe(fn: () => Promise<unknown>, timeoutMs = 2000): Promise<Probe> {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([fn(), new Promise((_, reject) => (timer = setTimeout(() => reject(new Error("timeout")), timeoutMs)))]);
    return { status: "up", latencyMs: Date.now() - started };
  } catch (err) {
    return { status: "down", latencyMs: Date.now() - started, error: err instanceof Error ? err.message : "error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /api/v1/health — liveness: the web process is up and answering. No dependencies are
 * checked, so a database outage doesn't make the orchestrator restart healthy web containers.
 */
export const livenessHandler = publicRoute(async () => ({
  data: {
    status: "ok",
    version: process.env.APP_VERSION ?? process.env.npm_package_version ?? "0.0.0",
    commit: process.env.GIT_COMMIT ?? "unknown",
    uptimeSeconds: Math.floor((Date.now() - processStartedAt().getTime()) / 1000),
    time: new Date().toISOString(),
  },
}));

/**
 * GET /api/v1/health/ready — readiness: PostgreSQL, Redis, the storage bucket and the job queue
 * are reachable, and a worker sent a heartbeat in the last 2 minutes. 503 otherwise (and while
 * the process is shutting down), so a load balancer stops sending traffic here.
 */
export const readinessHandler = publicRoute(async () => {
  const [database, cache, storage, queue, beats] = await Promise.all([
    probe(() => prisma.$queryRaw`SELECT 1`),
    probe(() => redis().ping()),
    probe(() => probeStorage(), 3000),
    probe(() => getQueue(QUEUES.system).getJobCounts("waiting")),
    readHeartbeats().catch(() => []),
  ]);
  const newest = beats[0];
  const ageMs = newest ? Date.now() - Date.parse(newest.at) : null;
  const worker = { status: ageMs !== null && ageMs < HEARTBEAT_MAX_AGE_MS ? ("up" as const) : ("down" as const), lastHeartbeat: newest?.at ?? null, ageSeconds: ageMs === null ? null : Math.round(ageMs / 1000), processes: beats.length };
  const draining = isDraining();
  const ok = !draining && [database, cache, storage, queue, worker].every((c) => c.status === "up");
  return {
    status: ok ? 200 : 503,
    data: { status: ok ? "ready" : draining ? "shutting_down" : "not_ready", checks: { database, redis: cache, storage, queue, worker }, time: new Date().toISOString() },
  };
});

/** Kept for existing imports: the liveness probe. */
export const healthHandler = livenessHandler;
