import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { ZodTypeAny, z } from "zod";
import { env } from "@/shared/config/env";
import { logger, type Logger } from "@/shared/logger/logger";
import { ACCESS_COOKIE, type CookieOp } from "@/shared/auth/cookies";
import { assertSameOrigin } from "@/shared/auth/csrf";
import { resolvePrincipal } from "@/shared/auth/resolver";
import type { Principal, PermissionRequirement } from "@/shared/auth/principal";
import { AppError, UnauthenticatedError, ValidationError } from "@/shared/errors/app-error";
import { requirePermission } from "@/shared/rbac/guards";
import { filterSensitiveFields } from "@/shared/rbac/sensitive-fields";
import type { PageMeta } from "@/shared/pagination/list-query";
import { abandonIdempotent, beginIdempotent, completeIdempotent, IDEMPOTENCY_HEADER } from "@/shared/idempotency/idempotency";
import { toErrorBody } from "./errors";

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

function buildContext<P>(req: NextRequest, params: P, meta: RequestMeta): BaseContext<P> {
  let textCache: Promise<string> | undefined;
  const text = () => (textCache ??= req.text());
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
      if (!req.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
        throw new ValidationError("Request body must be multipart/form-data.");
      }
      try {
        return await req.formData();
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

async function run<P>(req: NextRequest, args: NextRouteArgs<P> | undefined, fn: (ctx: BaseContext<P>) => Promise<NextResponse>): Promise<NextResponse> {
  const meta = requestMeta(req.headers);
  const params = ((await args?.params) ?? {}) as P;
  const ctx = buildContext(req, params, meta);
  const started = Date.now();
  try {
    const res = await fn(ctx);
    ctx.log.info({ method: req.method, path: req.nextUrl.pathname, status: res.status, ms: Date.now() - started }, "request");
    return res;
  } catch (err) {
    const { status, body } = toErrorBody(err, meta.requestId, ctx.log);
    ctx.log[status >= 500 ? "error" : "info"]({ method: req.method, path: req.nextUrl.pathname, status, ms: Date.now() - started }, "request");
    return toResponse(status, body, meta.requestId, { cookies: cookiesOf(err) });
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
      }
      // Server errors are not cached so the client can retry with the same key.
      if (status >= 500) await abandonIdempotent(start.recordId);
      else await completeIdempotent(start.recordId, { status, body });
      return toResponse(status, filterSensitiveFields(body, principal), ctx.requestId, result);
    });
}
