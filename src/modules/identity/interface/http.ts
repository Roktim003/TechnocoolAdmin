import type { ActorContext } from "@/modules/audit/application/audit.service";
import { authCookies, clearAuthCookies, REFRESH_COOKIE } from "@/shared/auth/cookies";
import { assertSameOrigin } from "@/shared/auth/csrf";
import { NotFoundError } from "@/shared/errors/app-error";
import { authedRoute, publicRoute, withResponseCookies, type AuthedContext, type BaseContext } from "@/shared/http/route";
import { pageMeta } from "@/shared/pagination/list-query";
import { UuidSchema } from "@/shared/validation/zod";
import { IdentityErrors } from "../domain/errors";
import {
  CreateRoleSchema,
  CreateUserSchema,
  LoginHistoryQuerySchema,
  LoginSchema,
  RefreshSchema,
  SetPasswordSchema,
  UpdateRoleSchema,
  UpdateUserSchema,
  UserListQuerySchema,
} from "../application/dto";
import { identity } from "./container";
import { toLoginHistoryDto, toLoginResponse, toMeDto, toRoleDto, toRoleMatrixDto, toUserDto, toWarehouseDto } from "./mappers";

/*
 * Thin HTTP adapters: parse + validate → call the service → map. No business rules here.
 */

type IdParams = { id: string };

const USERS_ADMIN = { permission: ["users", "FULL"] } as const;

function actor(ctx: AuthedContext<unknown>): ActorContext {
  return { actorId: ctx.principal.userId, ip: ctx.ip, requestId: ctx.requestId };
}

function idParam(ctx: BaseContext<IdParams>, entity: string): string {
  const parsed = UuidSchema.safeParse(ctx.params.id);
  if (!parsed.success) throw new NotFoundError(entity);
  return parsed.data;
}

function reqInfo(ctx: BaseContext<unknown>) {
  return { ip: ctx.ip, userAgent: ctx.userAgent, requestId: ctx.requestId };
}

/** Refresh token from the JSON body (mobile) or the HttpOnly cookie (web, CSRF-checked). */
async function presentedRefreshToken(ctx: BaseContext<unknown>): Promise<{ token?: string; viaCookie: boolean }> {
  const body = await ctx.body(RefreshSchema);
  if (body.refreshToken) return { token: body.refreshToken, viaCookie: false };
  const cookie = ctx.req.cookies.get(REFRESH_COOKIE)?.value;
  if (cookie) assertSameOrigin(ctx.req.method, ctx.req.headers);
  return { token: cookie, viaCookie: !!cookie };
}

export const authHandlers = {
  login: publicRoute(async (ctx) => {
    const input = await ctx.body(LoginSchema);
    // Browsers always send Origin on cross-site POSTs; reject logins posted from foreign sites.
    if (ctx.req.headers.get("origin")) assertSameOrigin(ctx.req.method, ctx.req.headers);
    const session = await identity().auth.login(input, reqInfo(ctx));
    return {
      data: toLoginResponse(session),
      cookies: session.client === "web" ? authCookies(session) : undefined,
    };
  }),

  refresh: publicRoute(async (ctx) => {
    const { token, viaCookie } = await presentedRefreshToken(ctx);
    if (!token) throw IdentityErrors.refreshInvalid();
    try {
      const session = await identity().auth.refresh(token, reqInfo(ctx));
      // Tokens presented in the body are returned in the body, whatever the original client.
      const asMobile = !viaCookie ? { ...session, client: "mobile" as const } : session;
      return { data: toLoginResponse(asMobile), cookies: viaCookie ? authCookies(session) : undefined };
    } catch (err) {
      // Clear dead cookies so the browser stops retrying with them.
      throw viaCookie ? withResponseCookies(err, clearAuthCookies()) : err;
    }
  }),

  logout: publicRoute(async (ctx) => {
    const { token } = await presentedRefreshToken(ctx);
    await identity().auth.logout(token);
    return { status: 204, cookies: clearAuthCookies() };
  }),

  me: authedRoute({}, async (ctx) => {
    const { user, role } = await identity().auth.me(ctx.principal);
    return { data: toMeDto(user, role) };
  }),
};

export const userHandlers = {
  list: authedRoute(USERS_ADMIN, async (ctx) => {
    const query = ctx.query(UserListQuerySchema);
    const { items, total } = await identity().users.list(query);
    return { data: items.map(toUserDto), meta: pageMeta(total, query.page, query.pageSize) };
  }),

  create: authedRoute(USERS_ADMIN, async (ctx) => {
    const input = await ctx.body(CreateUserSchema);
    const user = await identity().users.create(actor(ctx), input);
    return { status: 201, data: toUserDto(user), headers: { Location: `/api/v1/users/${user.id}` } };
  }),

  get: authedRoute<IdParams>(USERS_ADMIN, async (ctx) => {
    return { data: toUserDto(await identity().users.get(idParam(ctx, "User"))) };
  }),

  update: authedRoute<IdParams>(USERS_ADMIN, async (ctx) => {
    const id = idParam(ctx, "User");
    const input = await ctx.body(UpdateUserSchema);
    return { data: toUserDto(await identity().users.update(actor(ctx), id, input)) };
  }),

  disable: authedRoute<IdParams>(USERS_ADMIN, async (ctx) => {
    return { data: toUserDto(await identity().users.disable(actor(ctx), idParam(ctx, "User"))) };
  }),

  enable: authedRoute<IdParams>(USERS_ADMIN, async (ctx) => {
    return { data: toUserDto(await identity().users.enable(actor(ctx), idParam(ctx, "User"))) };
  }),

  setPassword: authedRoute<IdParams>(USERS_ADMIN, async (ctx) => {
    const id = idParam(ctx, "User");
    const { password } = await ctx.body(SetPasswordSchema);
    return { data: toUserDto(await identity().users.setPassword(actor(ctx), id, password)) };
  }),
};

export const roleHandlers = {
  list: authedRoute(USERS_ADMIN, async () => {
    return { data: (await identity().roles.list()).map(toRoleDto) };
  }),

  matrix: authedRoute(USERS_ADMIN, async () => {
    return { data: toRoleMatrixDto(await identity().roles.list()) };
  }),

  create: authedRoute(USERS_ADMIN, async (ctx) => {
    const input = await ctx.body(CreateRoleSchema);
    const role = await identity().roles.create(actor(ctx), input);
    return { status: 201, data: toRoleDto(role), headers: { Location: `/api/v1/roles/${role.id}` } };
  }),

  get: authedRoute<IdParams>(USERS_ADMIN, async (ctx) => {
    return { data: toRoleDto(await identity().roles.get(idParam(ctx, "Role"))) };
  }),

  update: authedRoute<IdParams>(USERS_ADMIN, async (ctx) => {
    const id = idParam(ctx, "Role");
    const input = await ctx.body(UpdateRoleSchema);
    return { data: toRoleDto(await identity().roles.update(actor(ctx), id, input)) };
  }),

  delete: authedRoute<IdParams>(USERS_ADMIN, async (ctx) => {
    await identity().roles.delete(actor(ctx), idParam(ctx, "Role"));
    return { status: 204 };
  }),
};

export const directoryHandlers = {
  warehouses: authedRoute({}, async (ctx) => {
    return { data: (await identity().directory.listWarehouses(ctx.principal)).map(toWarehouseDto) };
  }),

  loginHistory: authedRoute(USERS_ADMIN, async (ctx) => {
    const query = ctx.query(LoginHistoryQuerySchema);
    const { items, total } = await identity().directory.listLoginHistory(query);
    return { data: items.map(toLoginHistoryDto), meta: pageMeta(total, query.page, query.pageSize) };
  }),
};
