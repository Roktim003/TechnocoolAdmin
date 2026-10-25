"use client";

import { useEffect } from "react";

/**
 * Browser error tracking. Rendered by the root layout only when SENTRY_DSN is set; the SDK is
 * loaded on demand, so pages without a DSN never download it.
 */
export function BrowserErrorTracking({ dsn, release, environment }: { dsn: string; release: string; environment: string }) {
  useEffect(() => {
    let cancelled = false;
    void import("@sentry/browser").then((Sentry) => {
      if (cancelled || Sentry.getClient()) return;
      Sentry.init({ dsn, release, environment, tracesSampleRate: 0, sendDefaultPii: false, initialScope: { tags: { service: "browser" } } });
    });
    return () => {
      cancelled = true;
    };
  }, [dsn, release, environment]);
  return null;
}
