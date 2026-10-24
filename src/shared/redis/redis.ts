import Redis, { type RedisOptions } from "ioredis";
import { env } from "@/shared/config/env";
import { logger } from "@/shared/logger/logger";

const globalForRedis = globalThis as unknown as { redis?: Redis };

/**
 * Shared Redis client for cache and rate limiting. Every key is namespaced with
 * REDIS_KEY_PREFIX automatically. BullMQ uses its own connections (see shared/queue).
 */
export function redis(): Redis {
  if (!globalForRedis.redis) {
    const e = env();
    const client = new Redis(e.REDIS_URL, { keyPrefix: e.REDIS_KEY_PREFIX, maxRetriesPerRequest: 2, enableOfflineQueue: true });
    client.on("error", (err) => logger.error({ err }, "redis error"));
    globalForRedis.redis = client;
  }
  return globalForRedis.redis;
}

/** Connection options for BullMQ (requires maxRetriesPerRequest: null and no keyPrefix). */
export function bullConnection(): RedisOptions & { url: string } {
  return { url: env().REDIS_URL, maxRetriesPerRequest: null };
}

/** Deletes every key under the configured prefix matching `pattern` (pattern is relative to the prefix). */
export async function deleteKeys(pattern: string): Promise<number> {
  const client = redis();
  const prefix = env().REDIS_KEY_PREFIX;
  let cursor = "0";
  let deleted = 0;
  do {
    // SCAN does not apply keyPrefix, so match on the full key and strip the prefix before DEL.
    const [next, keys] = await client.scan(cursor, "MATCH", prefix + pattern, "COUNT", 200);
    cursor = next;
    if (keys.length) deleted += await client.del(...keys.map((k) => k.slice(prefix.length)));
  } while (cursor !== "0");
  return deleted;
}
