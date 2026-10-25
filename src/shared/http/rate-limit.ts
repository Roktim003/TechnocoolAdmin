import { redis } from "@/shared/redis/redis";
import { logger } from "@/shared/logger/logger";
import { RateLimitError } from "@/shared/errors/app-error";

/**
 * Fixed-window rate limits in Redis (one counter per bucket and minute). Shared by every web
 * process, so the limit holds however many instances run. If Redis can't be reached the request
 * is let through (the app can't work without Redis anyway, and the health check reports it).
 */
export interface RateLimit {
  /** Bucket name, e.g. "api", "exports", "refresh". */
  bucket: string;
  /** Who is counted: user id, token id or IP. */
  subject: string;
  limit: number;
  windowSeconds?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

export async function hitRateLimit({ bucket, subject, limit, windowSeconds = 60 }: RateLimit): Promise<RateLimitResult> {
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = `rl:${bucket}:${subject}:${window}`;
  try {
    const [[, count]] = (await redis().multi().incr(key).expire(key, windowSeconds + 1).exec()) as [[Error | null, number]];
    const retryAfter = Math.max(1, (window + 1) * windowSeconds - Math.floor(Date.now() / 1000));
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfter };
  } catch (err) {
    logger.warn({ err, bucket }, "rate limit check failed; request allowed");
    return { allowed: true, remaining: limit, retryAfter: 0 };
  }
}

/** Throws 429 (with Retry-After) when the limit is exceeded. */
export async function enforceRateLimit(rl: RateLimit, message = "Too many requests. Please wait a moment and try again."): Promise<void> {
  const r = await hitRateLimit(rl);
  if (!r.allowed) throw new RateLimitError(message, r.retryAfter);
}
