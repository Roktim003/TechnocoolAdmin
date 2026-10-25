/**
 * Security headers and CORS. Pure functions (no env(), no Node APIs) so the edge middleware
 * and the unit tests can use them.
 */

export interface SecurityHeaderOptions {
  nonce: string;
  appUrl: string;
  /** next dev needs eval (React refresh) and a websocket. */
  dev: boolean;
  /** Error tracking ingest origin, when SENTRY_DSN is set. */
  reportOrigin?: string | null;
}

export function contentSecurityPolicy(o: SecurityHeaderOptions): string {
  const https = o.appUrl.startsWith("https:");
  const connect = ["'self'", o.reportOrigin, o.dev ? "ws: wss:" : null].filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    // Nonce-based: no 'unsafe-inline' scripts. 'strict-dynamic' lets Next's nonced loader pull its chunks.
    `script-src 'self' 'nonce-${o.nonce}' 'strict-dynamic'${o.dev ? " 'unsafe-eval'" : ""}`,
    // React style attributes need inline styles; no script can run from a style.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** Headers sent on every response (pages and API). */
export function securityHeaders(o: SecurityHeaderOptions): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": contentSecurityPolicy(o),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // The web app uses no device features.
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  // HSTS only makes sense (and is only honoured) over https.
  if (o.appUrl.startsWith("https:")) headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  return headers;
}

/** Parses the comma-separated CORS allow-list into origins (invalid entries are dropped). */
export function parseOrigins(csv: string | undefined): string[] {
  return (csv ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => {
      try {
        return [new URL(s).origin];
      } catch {
        return [];
      }
    });
}

export const CORS_ALLOWED_HEADERS = "Authorization, Content-Type, Idempotency-Key, X-Request-Id";
export const CORS_ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE";

/**
 * CORS for /api: closed unless the Origin is on the allow-list. Credentials (cookies) are never
 * allowed cross-origin, so a listed origin can only use bearer tokens.
 * Returns null when the origin is not allowed (no CORS headers are sent).
 */
export function corsHeaders(origin: string | null, allowed: string[], preflight: boolean): Record<string, string> | null {
  if (!origin || !allowed.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Expose-Headers": "X-Request-Id, Retry-After, Location, Idempotent-Replayed",
    ...(preflight ? { "Access-Control-Allow-Methods": CORS_ALLOWED_METHODS, "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS, "Access-Control-Max-Age": "600" } : {}),
  };
}

/** Origin of a Sentry DSN (https://key@o1.ingest.sentry.io/1 → https://o1.ingest.sentry.io). */
export function dsnOrigin(dsn: string | undefined): string | null {
  if (!dsn) return null;
  try {
    return new URL(dsn).origin;
  } catch {
    return null;
  }
}
