import { z } from "@/shared/validation/zod";
import { AUTHENTICATED, dataOf, errors, IdempotencyHeaders, IdParams, json, listOf, registry } from "@/shared/openapi/registry";
import {
  CreateRoleSchema,
  CreateUserSchema,
  LoginHistoryQuerySchema,
  LoginHistorySchema,
  LoginResponseSchema,
  LoginSchema,
  MeSchema,
  RefreshSchema,
  RoleMatrixSchema,
  RoleSchema,
  SetPasswordSchema,
  UpdateRoleSchema,
  UpdateUserSchema,
  UserListQuerySchema,
  UserSchema,
  WarehouseSchema,
} from "../application/dto";

const body = (schema: z.ZodTypeAny) => ({ body: { required: true, content: { "application/json": { schema } } } });
const ADMIN = "Requires `users` = FULL.";

/* ── Auth ── */

registry.registerPath({
  method: "post",
  path: "/auth/login",
  tags: ["Auth"],
  summary: "Log in with username + password",
  description:
    "`client: \"web\"` (default) sets HttpOnly cookies `sb_at` (access) and `sb_rt` (refresh, path /api/v1/auth). " +
    "`client: \"mobile\"` returns `accessToken` + `refreshToken` in the body. After 5 failed attempts in 15 minutes the account is locked until an Admin sets a new password.",
  request: body(LoginSchema),
  responses: { 200: json(dataOf(LoginResponseSchema)), ...errors(400, 401, 403, 429) },
});

registry.registerPath({
  method: "post",
  path: "/auth/refresh",
  tags: ["Auth"],
  summary: "Rotate the refresh token and get a new access token",
  description:
    "Mobile: send `refreshToken` in the body; new tokens are returned in the body. Web: send no body; the `sb_rt` cookie is used and new cookies are set. " +
    "Every refresh invalidates the presented token. Re-using an old token revokes every token of that login (token family).",
  request: { body: { required: false, content: { "application/json": { schema: RefreshSchema } } } },
  responses: { 200: json(dataOf(LoginResponseSchema)), ...errors(400, 401, 403) },
});

registry.registerPath({
  method: "post",
  path: "/auth/logout",
  tags: ["Auth"],
  summary: "Log out (revoke this login's refresh tokens)",
  request: { body: { required: false, content: { "application/json": { schema: RefreshSchema } } } },
  responses: { 204: { description: "Logged out; auth cookies cleared" }, ...errors(400, 403) },
});

registry.registerPath({
  method: "get",
  path: "/auth/me",
  tags: ["Auth"],
  summary: "Current user, role, permissions, sensitive-data flags and warehouses",
  security: AUTHENTICATED,
  responses: { 200: json(dataOf(MeSchema)), ...errors(401) },
});

/* ── Users ── */

registry.registerPath({
  method: "get",
  path: "/users",
  tags: ["Users"],
  summary: "List users",
  description: `${ADMIN} Search (\`q\`) matches name, username, phone and email.`,
  security: AUTHENTICATED,
  request: { query: UserListQuerySchema.innerType() },
  responses: { 200: json(listOf(UserSchema)), ...errors(400, 401, 403) },
});

registry.registerPath({
  method: "post",
  path: "/users",
  tags: ["Users"],
  summary: "Create a user",
  description: `${ADMIN} Username is case-insensitive and unique; at least one warehouse is required.`,
  security: AUTHENTICATED,
  request: { headers: IdempotencyHeaders, ...body(CreateUserSchema) },
  responses: { 201: json(dataOf(UserSchema), "Created"), ...errors(400, 401, 403, 409, 422) },
});

registry.registerPath({
  method: "get",
  path: "/users/{id}",
  tags: ["Users"],
  summary: "Get a user",
  description: ADMIN,
  security: AUTHENTICATED,
  request: { params: IdParams },
  responses: { 200: json(dataOf(UserSchema)), ...errors(401, 403, 404) },
});

registry.registerPath({
  method: "patch",
  path: "/users/{id}",
  tags: ["Users"],
  summary: "Update a user (not the password)",
  description: `${ADMIN} You cannot change your own role. Send only the fields to change.`,
  security: AUTHENTICATED,
  request: { params: IdParams, ...body(UpdateUserSchema) },
  responses: { 200: json(dataOf(UserSchema)), ...errors(400, 401, 403, 404, 409, 422) },
});

for (const [action, summary, extra] of [
  ["disable", "Disable a user", "Revokes all of the user's sessions immediately. You cannot disable yourself."],
  ["enable", "Re-enable a disabled user", ""],
] as const) {
  registry.registerPath({
    method: "post",
    path: `/users/{id}/${action}`,
    tags: ["Users"],
    summary,
    description: `${ADMIN} ${extra}`.trim(),
    security: AUTHENTICATED,
    request: { params: IdParams, headers: IdempotencyHeaders },
    responses: { 200: json(dataOf(UserSchema)), ...errors(401, 403, 404, 422) },
  });
}

registry.registerPath({
  method: "post",
  path: "/users/{id}/password",
  tags: ["Users"],
  summary: "Set a user's password (Admin only)",
  description: `${ADMIN} Users cannot change their own password. Unlocks a locked account and revokes all of the user's sessions.`,
  security: AUTHENTICATED,
  request: { params: IdParams, headers: IdempotencyHeaders, ...body(SetPasswordSchema) },
  responses: { 200: json(dataOf(UserSchema)), ...errors(400, 401, 403, 404) },
});

/* ── Roles ── */

registry.registerPath({
  method: "get",
  path: "/roles",
  tags: ["Roles"],
  summary: "List roles with permissions, flags and user counts",
  description: ADMIN,
  security: AUTHENTICATED,
  responses: { 200: json(dataOf(z.array(RoleSchema))), ...errors(401, 403) },
});

registry.registerPath({
  method: "get",
  path: "/roles/matrix",
  tags: ["Roles"],
  summary: "Roles × modules permission matrix (overview grid)",
  description: ADMIN,
  security: AUTHENTICATED,
  responses: { 200: json(dataOf(RoleMatrixSchema)), ...errors(401, 403) },
});

registry.registerPath({
  method: "post",
  path: "/roles",
  tags: ["Roles"],
  summary: "Create a custom role (blank or copied from another role)",
  description: ADMIN,
  security: AUTHENTICATED,
  request: { headers: IdempotencyHeaders, ...body(CreateRoleSchema) },
  responses: { 201: json(dataOf(RoleSchema), "Created"), ...errors(400, 401, 403, 409, 422) },
});

registry.registerPath({
  method: "get",
  path: "/roles/{id}",
  tags: ["Roles"],
  summary: "Get a role",
  description: ADMIN,
  security: AUTHENTICATED,
  request: { params: IdParams },
  responses: { 200: json(dataOf(RoleSchema)), ...errors(401, 403, 404) },
});

registry.registerPath({
  method: "patch",
  path: "/roles/{id}",
  tags: ["Roles"],
  summary: "Edit a role's name, permission levels and sensitive-data flags",
  description: `${ADMIN} The Admin role is locked (422).`,
  security: AUTHENTICATED,
  request: { params: IdParams, ...body(UpdateRoleSchema) },
  responses: { 200: json(dataOf(RoleSchema)), ...errors(400, 401, 403, 404, 409, 422) },
});

registry.registerPath({
  method: "delete",
  path: "/roles/{id}",
  tags: ["Roles"],
  summary: "Delete a custom role",
  description: `${ADMIN} Blocked (422) for the Admin role and for roles that still have users.`,
  security: AUTHENTICATED,
  request: { params: IdParams },
  responses: { 204: { description: "Deleted" }, ...errors(401, 403, 404, 422) },
});

/* ── Directory ── */

registry.registerPath({
  method: "get",
  path: "/warehouses",
  tags: ["Warehouses"],
  summary: "List warehouses",
  description: "User administrators see all warehouses; other users see only the warehouses they are assigned to.",
  security: AUTHENTICATED,
  responses: { 200: json(dataOf(z.array(WarehouseSchema))), ...errors(401) },
});

registry.registerPath({
  method: "get",
  path: "/login-history",
  tags: ["Login history"],
  summary: "Login attempts (success, wrong password, locked, disabled…)",
  description: ADMIN,
  security: AUTHENTICATED,
  request: { query: LoginHistoryQuerySchema.innerType() },
  responses: { 200: json(listOf(LoginHistorySchema)), ...errors(400, 401, 403) },
});
