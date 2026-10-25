import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "@/shared/config/env";
import { redis } from "@/shared/redis/redis";

/**
 * Worker heartbeat: every 30 s each worker process writes a Redis key (read by /health/ready and
 * System health) and touches a local file (read by the container HEALTHCHECK, no Redis needed).
 */
export const HEARTBEAT_INTERVAL_MS = 30_000;
/** A heartbeat older than this means the worker is down or stuck. */
export const HEARTBEAT_MAX_AGE_MS = 120_000;
export const HEARTBEAT_FILE = path.join(os.tmpdir(), "stockbook-worker.alive");

export interface Heartbeat {
  id: string;
  host: string;
  pid: number;
  queues: string[];
  at: string;
  startedAt: string;
  rssMb: number;
  heapMb: number;
  version: string;
  commit: string;
}

const KEY = "worker:hb:";

async function beat(id: string, queues: string[], startedAt: Date): Promise<void> {
  const m = process.memoryUsage();
  const e = env();
  const hb: Heartbeat = {
    id,
    host: os.hostname(),
    pid: process.pid,
    queues,
    at: new Date().toISOString(),
    startedAt: startedAt.toISOString(),
    rssMb: Math.round(m.rss / 1048576),
    heapMb: Math.round(m.heapUsed / 1048576),
    version: e.APP_VERSION,
    commit: e.GIT_COMMIT,
  };
  await Promise.allSettled([redis().set(KEY + id, JSON.stringify(hb), "EX", 300), writeFile(HEARTBEAT_FILE, hb.at)]);
}

/** Starts beating; returns a stop function (also removes the Redis key). */
export function startHeartbeat(queues: string[]): () => Promise<void> {
  const id = `${os.hostname()}:${process.pid}`;
  const startedAt = new Date();
  void beat(id, queues, startedAt);
  const timer = setInterval(() => void beat(id, queues, startedAt), HEARTBEAT_INTERVAL_MS);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await redis().del(KEY + id).catch(() => undefined);
  };
}

/** Every live worker's last heartbeat, newest first. */
export async function readHeartbeats(): Promise<Heartbeat[]> {
  const client = redis();
  const prefix = env().REDIS_KEY_PREFIX;
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [next, found] = await client.scan(cursor, "MATCH", `${prefix}${KEY}*`, "COUNT", 100);
    cursor = next;
    keys.push(...found.map((k) => k.slice(prefix.length)));
  } while (cursor !== "0");
  if (!keys.length) return [];
  const values = await client.mget(...keys);
  return values
    .flatMap((v) => {
      try {
        return v ? [JSON.parse(v) as Heartbeat] : [];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

export const isFresh = (hb: Heartbeat | undefined, now = Date.now()) => !!hb && now - Date.parse(hb.at) < HEARTBEAT_MAX_AGE_MS;
