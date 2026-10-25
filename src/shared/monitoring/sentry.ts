import type * as SentryNodeSdk from "@sentry/node";
import { logger } from "@/shared/logger/logger";

/**
 * Error tracking (Sentry SDK). Active only when SENTRY_DSN is set; otherwise errors go to the
 * structured logs only. Loaded lazily so a process without a DSN never imports the SDK.
 */
type SentryNode = typeof SentryNodeSdk;

let sdk: SentryNode | null = null;
let started = false;

export function releaseName(): string {
  const version = process.env.APP_VERSION ?? process.env.npm_package_version ?? "0.0.0";
  const commit = process.env.GIT_COMMIT ?? "unknown";
  return `stockbook@${version}+${commit.slice(0, 12)}`;
}

/** Starts error tracking for this process ("web" or "worker"). Safe to call more than once. */
export async function initErrorTracking(service: "web" | "worker"): Promise<boolean> {
  if (started) return !!sdk;
  started = true;
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    logger.info({ service }, "error tracking not set up (SENTRY_DSN is empty): errors go to the logs only");
    return false;
  }
  try {
    sdk = await import("@sentry/node");
    sdk.init({
      dsn,
      release: releaseName(),
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
      initialScope: { tags: { service } },
      // Errors only; no tracing, no request bodies, no personal data.
      tracesSampleRate: 0,
      sendDefaultPii: false,
      beforeSend: (event) => {
        if (event.request) {
          delete event.request.cookies;
          delete event.request.data;
          if (event.request.headers) {
            delete event.request.headers.authorization;
            delete event.request.headers.cookie;
          }
        }
        return event;
      },
    });
    logger.info({ service, release: releaseName() }, "error tracking enabled");
    return true;
  } catch (err) {
    logger.error({ err }, "could not start error tracking");
    sdk = null;
    return false;
  }
}

/** Reports an unexpected error (no-op without a DSN). */
export function captureError(err: unknown, context: Record<string, unknown> = {}): void {
  if (!sdk) return;
  sdk.withScope((scope) => {
    for (const [k, v] of Object.entries(context)) if (v !== undefined && v !== null) scope.setTag(k, String(v));
    sdk!.captureException(err);
  });
}

export async function flushErrorTracking(timeoutMs = 2000): Promise<void> {
  if (sdk) await sdk.flush(timeoutMs).catch(() => undefined);
}

export const errorTrackingActive = () => !!sdk;
