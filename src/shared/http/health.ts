import { prisma } from "@/shared/db/prisma";
import { redis } from "@/shared/redis/redis";
import { publicRoute } from "./route";

async function probe(fn: () => Promise<unknown>, timeoutMs = 2000): Promise<{ status: "up" | "down"; latencyMs: number; error?: string }> {
  const started = Date.now();
  try {
    await Promise.race([fn(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))]);
    return { status: "up", latencyMs: Date.now() - started };
  } catch (err) {
    return { status: "down", latencyMs: Date.now() - started, error: err instanceof Error ? err.message : "error" };
  }
}

/** GET /api/v1/health — 200 when PostgreSQL and Redis both respond, 503 otherwise. */
export const healthHandler = publicRoute(async () => {
  const [database, cache] = await Promise.all([probe(() => prisma.$queryRaw`SELECT 1`), probe(() => redis().ping())]);
  const ok = database.status === "up" && cache.status === "up";
  return {
    status: ok ? 200 : 503,
    data: { status: ok ? "ok" : "degraded", checks: { database, redis: cache }, time: new Date().toISOString() },
  };
});
