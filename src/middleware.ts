import { NextResponse, type NextRequest } from "next/server";
import { corsHeaders, dsnOrigin, parseOrigins, securityHeaders } from "@/shared/http/security-headers";

/**
 * Runs before every page and API request: a fresh CSP nonce per request (Next.js applies it to
 * its own scripts), the security headers, and CORS for /api (closed unless CORS_ORIGINS lists
 * the origin). Rate limits, body limits and auth run in the route wrapper (Node runtime).
 */
export function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const headers = securityHeaders({
    nonce,
    appUrl: process.env.APP_URL ?? "http://localhost:3000",
    dev: process.env.NODE_ENV === "development",
    reportOrigin: dsnOrigin(process.env.SENTRY_DSN),
  });

  const isApi = req.nextUrl.pathname.startsWith("/api/");
  const origin = req.headers.get("origin");
  const preflight = isApi && req.method === "OPTIONS" && !!req.headers.get("access-control-request-method");
  const cors = isApi ? corsHeaders(origin, parseOrigins(process.env.CORS_ORIGINS), preflight) : null;

  if (preflight) {
    // Not on the allow-list: answer without CORS headers, so the browser blocks the call.
    const res = new NextResponse(null, { status: cors ? 204 : 403 });
    for (const [k, v] of Object.entries({ ...headers, ...cors })) res.headers.set(k, v);
    return res;
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", headers["Content-Security-Policy"]!);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [k, v] of Object.entries({ ...headers, ...cors })) res.headers.set(k, v);
  return res;
}

export const config = {
  // Everything except build assets (immutable, served by Next) and the Swagger page (own CSP).
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.svg|api/docs).*)" }],
};
