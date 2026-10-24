import { NextRequest } from "next/server";
import { TEST_ENV } from "../setup/test-env";

type RouteFn<P> = (req: NextRequest, args: { params: Promise<P> }) => Promise<Response>;

export const ORIGIN = TEST_ENV.APP_URL!;

export interface CallOptions {
  body?: unknown;
  /** Bearer access token (mobile style). */
  token?: string;
  /** Cookies to send, e.g. { sb_at: "..." }. */
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  query?: Record<string, string | number>;
  /** Origin header; defaults to the app's own origin. Pass null to omit it. */
  origin?: string | null;
}

export interface CallResult<T = any> {
  status: number;
  body: T;
  /** Raw response bytes (for file downloads). */
  bytes: Uint8Array;
  headers: Headers;
  /** Cookies set by the response (name → value; "" when cleared). */
  setCookies: Record<string, string>;
  rawSetCookies: string[];
}

/** Invokes a Next.js route handler in-process with a real NextRequest. */
export async function call<T = any, P = Record<string, string>>(handler: RouteFn<P>, method: string, path: string, opts: CallOptions = {}): Promise<CallResult<T>> {
  const url = new URL(`/api/v1${path}`, ORIGIN);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, String(v));

  const headers = new Headers(opts.headers);
  headers.set("host", url.host);
  headers.set("user-agent", headers.get("user-agent") ?? "vitest");
  if (opts.origin !== null && method !== "GET") headers.set("origin", opts.origin ?? ORIGIN);
  if (opts.token) headers.set("authorization", `Bearer ${opts.token}`);
  if (opts.cookies) headers.set("cookie", Object.entries(opts.cookies).map(([k, v]) => `${k}=${v}`).join("; "));
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body; // NextRequest sets the multipart boundary
  } else if (opts.body !== undefined) {
    body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    headers.set("content-type", "application/json");
  }

  const req = new NextRequest(url, { method, headers, body });
  const res = await handler(req, { params: Promise.resolve((opts.params ?? {}) as P) });
  const isJson = (res.headers.get("content-type") ?? "").includes("json");
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text = isJson || bytes.byteLength === 0 ? new TextDecoder().decode(bytes) : "";
  const rawSetCookies = res.headers.getSetCookie();
  const setCookies = Object.fromEntries(
    rawSetCookies.map((c) => {
      const [pair] = c.split(";");
      const idx = pair!.indexOf("=");
      return [pair!.slice(0, idx), decodeURIComponent(pair!.slice(idx + 1))];
    }),
  );
  return { status: res.status, body: text ? JSON.parse(text) : null, bytes, headers: res.headers, setCookies, rawSetCookies };
}
