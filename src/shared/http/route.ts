import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { ZodTypeAny, z } from "zod";
import { env } from "@/shared/config/env";
import { logger, type Logger } from "@/shared/logger/logger";
import { ACCESS_COOKIE, type CookieOp } from "@/shared/auth/cookies";
import { assertSameOrigin } from "@/shared/auth/csrf";
import { resolvePrincipal } from "@/shared/auth/resolver";
import type { Principal, PermissionRequirement } from "@/shared/auth/principal";
import { AppError, PayloadTooLargeError, UnauthenticatedError, ValidationError } from "@/shared/errors/app-error";
import { requirePermission } from "@/shared/rbac/guards";
import { filterSensitiveFields } from "@/shared/rbac/sensitive-fields";
import type { PageMeta } from "@/shared/pagination/list-query";
import { abandonIdempotent, beginIdempotent, completeIdempotent, IDEMPOTENCY_HEADER } from "@/shared/idempotency/idempotency";
import { isDraining, trackInFlight } from "@/shared/lifecycle/shutdown";
import { captureError } from "@/shared/monitoring/sentry";
import { toErrorBody } from "./errors";
import { enforceRateLimit } from "./rate-limit";

/** What a handler returns; the wrapper turns it into the JSON envelope. */
export interface HandlerResult {
  status?: number;
  data?: unknown;
  meta?: PageMeta;
  /** Extra top-level envelope members next to data / meta (e.g. a report's totals and chart). */
  extra?: Record<string, unknown>;
  cookies?: CookieOp[];
  headers?: Record<string, string>;
  /** Binary response (downloads, images): sent as-is, without the JSON envelope or field filtering. */
  file?: FileResult;
}

export interface FileResult {
  body: Uint8Array;
  contentType: string;
  /** Sent as `Content-Disposition: attachment` when set (unless `inline`). */
  filename?: string;
  inline?: boolean;
  /** Private browser cache lifetime; default no-store. */
  cacheSeconds?: number;
}

export interface RequestMeta {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
}

export interface BaseContext<P> extends RequestMeta {
  req: NextRequest;
  params: P;
  log: Logger;
  /** Raw body text (read once; also used for idempotency hashing). */
  text(): Promise<string>;
  /** Parses and validates the JSON body. Throws 400 on malformed JSON or schema errors. */
  body<S extends ZodTypeAny>(schema: S): Promise<z.output<S>>;
  /** Parses a multipart/form-data body. Throws 400 when the body is not multipart. */
  form(): Promise<FormData>;
  /** Validates the query string. */
  query<S extends ZodTypeAny>(schema: S): z.output<S>;
}

export interface AuthedContext<P> extends BaseContext<P> {
  principal: Principal;
}

type NextRouteArgs<P> = { params: Promise<P> };
type RouteFn<P> = (req: NextRequest, args: NextRouteArgs<P>) => Promise<Response>;

export interface AuthedOptions {
  /** e.g. ["users", "FULL"] — checked after authentication. */
  permission?: PermissionRequirement;
  /** Honour the Idempotency-Key header on POST (default true). "required": POSTs without one get 400. */
  idempotent?: boolean | "required";
  /**
   * Extra rate-limit bucket on top of the general API limit: "exports" for routes that start an
   * Excel / PDF job (RATE_LIMIT_EXPORTS_PER_MINUTE per user).
   */
  rateLimit?: "exports";
}

export function clientIp(headers: Headers): string | null {
  if (env().TRUST_PROXY) {
    const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (fwd) return fwd;
    const real = headers.get("x-real-ip");
    if (real) return real;
  }
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export function requestMeta(headers: Headers): RequestMeta {
  const incoming = headers.get("x-request-id");
  return {
    requestId: incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID(),
    ip: clientIp(headers),
    userAgent: headers.get("user-agent")?.slice(0, 512) ?? null,
  };
}

const isMultipart = (req: NextRequest) => !!req.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data");

/** Body size limit: MAX_UPLOAD_MB for multipart uploads, MAX_JSON_BODY_KB for everything else. */
export function bodyLimit(req: NextRequest): number {
  const e = env();
  return isMultipart(req) ? e.MAX_UPLOAD_MB * 1024 * 1024 : e.MAX_JSON_BODY_KB * 1024;
}

/** Reads the body, refusing it (413) as soon as it passes the limit, declared or not. */
async function readLimited(req: NextRequest, limit: number): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > limit) throw new PayloadTooLargeError(limit);
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new PayloadTooLargeError(limit);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function buildContext<P>(req: NextRequest, params: P, meta: RequestMeta): BaseContext<P> {
  let bytesCache: Promise<Uint8Array> | undefined;
  const bytes = () => (bytesCache ??= readLimited(req, bodyLimit(req)));
  let textCache: Promise<string> | undefined;
  const text = () => (textCache ??= bytes().then((b) => new TextDecoder().decode(b)));
  return {
    ...meta,
    req,
    params,
    log: logger.child({ requestId: meta.requestId }),
    text,
    async body(schema) {
      const raw = await text();
      let json: unknown;
      try {
        json = raw.trim() ? JSON.parse(raw) : {};
      } catch {
        throw new ValidationError("Request body must be valid JSON.");
      }
      return schema.parse(json);
    },
    async form() {
      if (!isMultipart(req)) {
        throw new ValidationError("Request body must be multipart/form-data.");
      }
      const raw = await bytes();
      try {
        return await new Response(raw as BodyInit, { headers: { "content-type": req.headers.get("content-type")! } }).formData();
      } catch {
        throw new ValidationError("Malformed multipart body.");
      }
    },
    query(schema) {
      return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    },
  };
}

const RESPONSE_COOKIES = Symbol("responseCookies");

/** Attaches cookies (e.g. clearing dead auth cookies) to the error response for `err`. */
export function withResponseCookies(err: unknown, cookies: CookieOp[]): unknown {
  if (typeof err === "object" && err !== null) Object.defineProperty(err, RESPONSE_COOKIES, { value: cookies });
  return err;
}

function cookiesOf(err: unknown): CookieOp[] | undefined {
  return typeof err === "object" && err !== null ? (err as { [RESPONSE_COOKIES]?: CookieOp[] })[RESPONSE_COOKIES] : undefined;
}

function envelope(result: HandlerResult): { status: number; body: unknown } {
  const status = result.status ?? 200;
  if (status === 204) return { status, body: null };
  return { status, body: { data: result.data, ...(result.meta ? { meta: result.meta } : {}), ...result.extra } };
}

function toResponse(status: number, body: unknown, requestId: string, result?: HandlerResult): NextResponse {
  const res = status === 204 ? new NextResponse(null, { status }) : NextResponse.json(body, { status });
  res.headers.set("X-Request-Id", requestId);
  res.headers.set("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(result?.headers ?? {})) res.headers.set(k, v);
  for (const c of result?.cookies ?? []) res.cookies.set(c.name, c.value, c.options);
  return res;
}

function fileResponse(file: FileResult, requestId: string): NextResponse {
  const res = new NextResponse(file.body as BodyInit, { status: 200 });
  res.headers.set("Content-Type", file.contentType);
  res.headers.set("Content-Length", String(file.body.byteLength));
  res.headers.set("X-Request-Id", requestId);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Cache-Control", file.cacheSeconds ? `private, max-age=${file.cacheSeconds}` : "no-store");
  if (file.filename) {
    const safe = file.filename.replace(/[^\w.\- ]/g, "_");
    res.headers.set("Content-Disposition", `${file.inline ? "inline" : "attachment"}; filename="${safe}"`);
  }
  return res;
}

function respond(result: HandlerResult, requestId: string, transform: (body: unknown) => unknown = (b) => b): NextResponse {
  if (result.file) return fileResponse(result.file, requestId);
  const { status, body } = envelope(result);
  return toResponse(status, transform(body), requestId, result);
}

/** Retry-After for rate-limited responses. */
function errorHeaders(err: unknown): Record<string, string> | undefined {
  const retryAfter = (err as { retryAfter?: number } | null)?.retryAfter;
  return typeof retryAfter === "number" && (err as AppError).status === 429 ? { "Retry-After": String(retryAfter) } : undefined;
}

/** Sends the error envelope; unexpected (5xx) errors also go to error tracking when it is set up. */
function errorResponse(err: unknown, ctx: BaseContext<unknown>, userId?: string): NextResponse {
  const { status, body } = toErrorBody(err, ctx.requestId, ctx.log);
  if (status >= 500 && !(err instanceof AppError)) captureError(err, { requestId: ctx.requestId, route: ctx.req.nextUrl.pathname, userId });
  return toResponse(status, body, ctx.requestId, { cookies: cookiesOf(err), headers: errorHeaders(err) });
}

async function run<P>(req: NextRequest, args: NextRouteArgs<P> | undefined, fn: (ctx: BaseContext<P>) => Promise<NextResponse>): Promise<NextResponse> {
  const meta = requestMeta(req.headers);
  const params = ((await args?.params) ?? {}) as P;
  const ctx = buildContext(req, params, meta);
  const started = Date.now();
  // requestId is already on ctx.log (child logger).
  const line = (status: number) => ({ method: req.method, route: req.nextUrl.pathname, status, durationMs: Date.now() - started });
  // Shutting down: refuse new work (the load balancer sees /health/ready fail and moves on).
  if (isDraining()) {
    const res = toResponse(503, { error: { code: "SERVICE_UNAVAILABLE", message: "The server is restarting. Please retry in a moment.", details: [], requestId: meta.requestId } }, meta.requestId, { headers: { "Retry-After": "5", Connection: "close" } });
    ctx.log.info(line(503), "request");
    return res;
  }
  const done = trackInFlight();
  try {
    const res = await fn(ctx);
    ctx.log.info(line(res.status), "request");
    return res;
  } catch (err) {
    const res = errorResponse(err, ctx as BaseContext<unknown>);
    ctx.log[res.status >= 500 ? "error" : "info"](line(res.status), "request");
    return res;
  } finally {
    done();
  }
}

/** A route that needs no authentication (login, refresh, health…). */
export function publicRoute<P = Record<string, never>>(handler: (ctx: BaseContext<P>) => Promise<HandlerResult>): RouteFn<P> {
  return (req, args) =>
    run(req, args, async (ctx) => respond(await handler(ctx), ctx.requestId));
}

/**
 * An authenticated route. Resolves the principal from the bearer token or the access
 * cookie (one code path), enforces CSRF for cookie-authenticated mutations, checks the
 * required permission, applies Idempotency-Key handling on POST, and strips sensitive
 * fields the caller's role may not see from the response.
 */
export function authedRoute<P = Record<string, never>>(options: AuthedOptions, handler: (ctx: AuthedContext<P>) => Promise<HandlerResult>): RouteFn<P> {
  return (req, args) =>
    run(req, args, async (base) => {
      const principal = await resolvePrincipal({
        authorization: req.headers.get("authorization"),
        accessCookie: req.cookies.get(ACCESS_COOKIE)?.value,
      });
      if (!principal) throw new UnauthenticatedError();
      if (principal.authMethod === "cookie") assertSameOrigin(req.method, req.headers);
      if (options.permission) requirePermission(principal, options.permission[0], options.permission[1]);

      // Per user (one counter for every token and device of the user).
      const e = env();
      await enforceRateLimit({ bucket: "api", subject: principal.userId, limit: e.RATE_LIMIT_API_PER_MINUTE });
      if (options.rateLimit === "exports") {
        await enforceRateLimit({ bucket: "exports", subject: principal.userId, limit: e.RATE_LIMIT_EXPORTS_PER_MINUTE }, "Too many exports or PDFs in a short time. Please wait a minute and try again.");
      }

      const ctx: AuthedContext<P> = { ...base, principal, log: base.log.child({ userId: principal.userId }) };

      const key = req.method === "POST" && options.idempotent !== false ? req.headers.get(IDEMPOTENCY_HEADER) : null;
      if (!key && req.method === "POST" && options.idempotent === "required") {
        throw new AppError("IDEMPOTENCY_KEY_REQUIRED", 400, "This request changes stock: send an Idempotency-Key header so a retry can never apply it twice.");
      }
      if (!key) return respond(await handler(ctx), ctx.requestId, (body) => filterSensitiveFields(body, principal));

      const start = await beginIdempotent({ key, userId: principal.userId, method: req.method, path: req.nextUrl.pathname, body: await ctx.text() });
      if (start.kind === "replay") {
        const res = toResponse(start.response.status, filterSensitiveFields(start.response.body, principal), ctx.requestId);
        res.headers.set("Idempotent-Replayed", "true");
        return res;
      }

      let status: number;
      let body: unknown;
      let result: HandlerResult | undefined;
      try {
        result = await handler(ctx);
        ({ status, body } = envelope(result));
      } catch (err) {
        ({ status, body } = toErrorBody(err, ctx.requestId, ctx.log));
        if (status >= 500 && !(err instanceof AppError)) captureError(err, { requestId: ctx.requestId, route: req.nextUrl.pathname, userId: principal.userId });
      }
      // Server errors are not cached so the client can retry with the same key.
      if (status >= 500) await abandonIdempotent(start.recordId);
      else await completeIdempotent(start.recordId, { status, body });
      return toResponse(status, filterSensitiveFields(body, principal), ctx.requestId, result);
    });
}
