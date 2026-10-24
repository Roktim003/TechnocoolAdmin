import { env } from "@/shared/config/env";
import { ForbiddenError } from "@/shared/errors/app-error";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

function originOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function allowedOrigins(headers: Headers): Set<string> {
  const e = env();
  const allowed = new Set<string>([new URL(e.APP_URL).origin, ...e.TRUSTED_ORIGINS.map((o) => originOf(o)).filter((o): o is string => !!o)]);
  // The request's own host (behind a proxy, the forwarded host) is same-origin by definition.
  const host = (e.TRUST_PROXY ? headers.get("x-forwarded-host") : null) ?? headers.get("host");
  if (host) {
    const proto = (e.TRUST_PROXY ? headers.get("x-forwarded-proto") : null) ?? new URL(e.APP_URL).protocol.replace(":", "");
    allowed.add(`${proto}://${host}`);
  }
  return allowed;
}

/**
 * CSRF defence for cookie-authenticated mutations: the browser-supplied Origin (or,
 * failing that, Referer) must match this app. Requests without either header are
 * rejected, because browsers always send Origin on cross-site POSTs and on fetch().
 * Bearer-token requests are exempt — a foreign site cannot attach the header.
 */
export function assertSameOrigin(method: string, headers: Headers): void {
  if (isSafeMethod(method)) return;
  const origin = originOf(headers.get("origin")) ?? originOf(headers.get("referer"));
  if (!origin || !allowedOrigins(headers).has(origin)) {
    throw new ForbiddenError("Cross-site request rejected.", "CSRF_REJECTED");
  }
}
