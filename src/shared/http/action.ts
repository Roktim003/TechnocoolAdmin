import "server-only";
import { cookies, headers } from "next/headers";
import { env } from "@/shared/config/env";
import { ACCESS_COOKIE } from "@/shared/auth/cookies";
import { resolvePrincipal } from "@/shared/auth/resolver";
import type { Principal, PermissionRequirement } from "@/shared/auth/principal";
import { AppError, UnauthenticatedError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger/logger";
import { requirePermission } from "@/shared/rbac/guards";
import { captureError } from "@/shared/monitoring/sentry";
import { enforceRateLimit } from "./rate-limit";
import { requestMeta, type RequestMeta } from "./route";

/** What a Server Action returns to the browser: never a stack trace, never a raw object. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export interface ActionContext extends RequestMeta {
  principal: Principal;
}

/**
 * Wraps every Server Action except login. The principal comes from the access cookie through
 * the same resolver as the API (token version, disabled users, idle timeout), then the same
 * permission check and rate limit run, and the action calls the same application services —
 * which apply warehouse scope and the other rules themselves. Next.js checks the Origin of
 * Server Action POSTs (CSRF). A test fails if a "use server" file exports anything else.
 */
export function authedAction<A extends unknown[], R>(options: { permission?: PermissionRequirement }, fn: (ctx: ActionContext, ...args: A) => Promise<R>): (...args: A) => Promise<ActionResult<R>> {
  return async (...args: A) => {
    const meta = requestMeta(await headers());
    try {
      const jar = await cookies();
      const principal = await resolvePrincipal({ accessCookie: jar.get(ACCESS_COOKIE)?.value });
      if (!principal) throw new UnauthenticatedError();
      if (options.permission) requirePermission(principal, options.permission[0], options.permission[1]);
      await enforceRateLimit({ bucket: "api", subject: principal.userId, limit: env().RATE_LIMIT_API_PER_MINUTE });
      return { ok: true, data: await fn({ ...meta, principal }, ...args) };
    } catch (err) {
      if (err instanceof AppError) return { ok: false, error: { code: err.code, message: err.message } };
      logger.error({ err, requestId: meta.requestId }, "server action failed");
      captureError(err, { requestId: meta.requestId });
      return { ok: false, error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } };
    }
  };
}
