import { z, emptyToUndefined } from "@/shared/validation/zod";
import { listQuerySchema } from "@/shared/pagination/list-query";
import { DateRangeFilters } from "@/shared/time/dates";
import { MODULE_KEYS, PERMISSION_LEVELS } from "@/shared/rbac/levels";
import { PASSWORD_MIN_LENGTH, USERNAME_PATTERN } from "../domain/rules";
import { isCommonPassword } from "../domain/common-passwords";

/* ───────────────────────────── shared pieces ───────────────────────────── */

export const ModuleKeySchema = z.enum(MODULE_KEYS).openapi("ModuleKey");
export const PermissionLevelSchema = z.enum(PERMISSION_LEVELS).openapi("PermissionLevel", { description: "Ordered: NONE < VIEW < CREATE < APPROVE < FULL" });

export const PermissionMapSchema = z
  .object(Object.fromEntries(MODULE_KEYS.map((m) => [m, PermissionLevelSchema])) as Record<(typeof MODULE_KEYS)[number], typeof PermissionLevelSchema>)
  .openapi("PermissionMap");

export const FlagsSchema = z
  .object({
    seeCost: z.boolean().openapi({ description: "May see cost fields" }),
    seeProfit: z.boolean().openapi({ description: "May see profit fields" }),
    seeMargin: z.boolean().openapi({ description: "May see contract value & margin fields" }),
  })
  .openapi("SensitiveFlags");

const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(128, "Password must be at most 128 characters.")
  .refine((p) => !isCommonPassword(p), "This password is too common. Choose one that is harder to guess.")
  .openapi({ example: "Mango-Rain-42", description: "At least 10 characters, not a common password" });

const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_PATTERN, "Username must be 3–32 characters: letters, digits, '.', '_' or '-'.")
  .openapi({ description: "Case-insensitive; stored lower-case", example: "rahim.store" });

const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().optional());

const WarehouseIdsSchema = z
  .array(z.string().uuid())
  .min(1, "Select at least one warehouse.")
  .max(50)
  .transform((ids) => [...new Set(ids)])
  .openapi({ description: "At least one warehouse id" });

/* ───────────────────────────── auth ───────────────────────────── */

export const LoginSchema = z
  .object({
    username: z.string().trim().min(1, "Username is required.").max(64).openapi({ example: "admin" }),
    password: z.string().min(1, "Password is required.").max(128).openapi({ example: "ChangeMe123!" }),
    client: z.enum(["web", "mobile"]).default("web").openapi({ description: "`mobile` returns tokens in the body; `web` sets HttpOnly cookies" }),
  })
  .openapi("LoginRequest");

export const RefreshSchema = z
  .object({
    refreshToken: z.string().min(16).max(256).optional().openapi({ description: "Mobile: the refresh token. Web: omit; the HttpOnly cookie is used." }),
  })
  .openapi("RefreshRequest");

/* ───────────────────────────── users ───────────────────────────── */

export const CreateUserSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(100).openapi({ example: "Rahim Uddin" }),
    username: UsernameSchema,
    phone: optionalText(20).openapi({ example: "+8801711000000" }),
    email: z.preprocess((v) => (v === "" ? null : v), z.string().trim().email("Enter a valid email.").max(200).nullable().optional()).openapi({ example: "rahim@example.com" }),
    roleId: z.string().uuid(),
    warehouseIds: WarehouseIdsSchema,
    password: PasswordSchema,
  })
  .openapi("CreateUserRequest");

export const UpdateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    username: UsernameSchema.optional(),
    phone: optionalText(20),
    email: z.preprocess((v) => (v === "" ? null : v), z.string().trim().email("Enter a valid email.").max(200).nullable().optional()),
    roleId: z.string().uuid().optional(),
    warehouseIds: WarehouseIdsSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update." })
  .openapi("UpdateUserRequest");

export const SetPasswordSchema = z.object({ password: PasswordSchema }).openapi("SetPasswordRequest");

const StatusFilter = z.enum(["active", "disabled"]);

export const UserListQuerySchema = listQuerySchema({
  sortFields: ["name", "username", "createdAt", "lastLoginAt", "status"],
  defaultSort: "name",
  filters: {
    status: emptyToUndefined(StatusFilter).openapi({ description: "active | disabled" }),
    roleId: emptyToUndefined(z.string().uuid()),
    warehouseId: emptyToUndefined(z.string().uuid()),
  },
});
export type UserListFilters = { status?: "active" | "disabled"; roleId?: string; warehouseId?: string };

/* ───────────────────────────── roles ───────────────────────────── */

const RoleNameSchema = z.string().trim().min(2, "Role name must be at least 2 characters.").max(50).openapi({ example: "Site Engineer" });

export const CreateRoleSchema = z
  .object({
    name: RoleNameSchema,
    description: optionalText(200),
    copyFromRoleId: z.string().uuid().optional().openapi({ description: "Start with the permissions and flags of this role; omit for a blank role (all NONE)" }),
  })
  .openapi("CreateRoleRequest");

export const UpdateRoleSchema = z
  .object({
    name: RoleNameSchema.optional(),
    description: optionalText(200),
    permissions: z.object(Object.fromEntries(MODULE_KEYS.map((m) => [m, PermissionLevelSchema.optional()]))).strict().optional().openapi({ description: "Only the modules you send are changed" }),
    flags: FlagsSchema.partial().strict().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update." })
  .openapi("UpdateRoleRequest");

/* ───────────────────────────── login history ───────────────────────────── */

export const LOGIN_RESULTS = ["SUCCESS", "WRONG_PASSWORD", "LOCKED", "DISABLED", "UNKNOWN_USER", "RATE_LIMITED"] as const;

export const LoginHistoryQuerySchema = listQuerySchema({
  sortFields: ["createdAt", "result"],
  defaultSort: "-createdAt",
  filters: {
    userId: emptyToUndefined(z.string().uuid()),
    result: emptyToUndefined(z.preprocess((v) => (typeof v === "string" ? v.toUpperCase() : v), z.enum(LOGIN_RESULTS))).openapi({ description: LOGIN_RESULTS.join(" | ") }),
    ...DateRangeFilters,
  },
});
export type LoginHistoryFilters = { userId?: string; result?: (typeof LOGIN_RESULTS)[number]; from?: Date; to?: Date };

/* ───────────────────────────── response DTOs ───────────────────────────── */

export const WarehouseSchema = z
  .object({ id: z.string().uuid(), code: z.string().openapi({ example: "A" }), name: z.string().openapi({ example: "Warehouse A" }), isActive: z.boolean() })
  .openapi("Warehouse");

const WarehouseSummarySchema = WarehouseSchema.pick({ id: true, code: true, name: true });

export const UserSchema = z
  .object({
    id: z.string().uuid(),
    username: z.string(),
    name: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    status: StatusFilter,
    isLocked: z.boolean().openapi({ description: "Locked after too many failed logins; cleared when an Admin sets a password" }),
    role: z.object({ id: z.string().uuid(), name: z.string() }),
    warehouses: z.array(WarehouseSummarySchema),
    lastLoginAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("User");

export const RoleSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    isLocked: z.boolean().openapi({ description: "True for the built-in Admin role" }),
    permissions: PermissionMapSchema,
    flags: FlagsSchema,
    userCount: z.number().int(),
    permissionVersion: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("Role");

export const RoleMatrixSchema = z
  .object({
    modules: z.array(z.object({ key: ModuleKeySchema, label: z.string() })),
    roles: z.array(RoleSchema.pick({ id: true, name: true, isLocked: true, userCount: true, permissions: true, flags: true })),
  })
  .openapi("RoleMatrix");

export const MeSchema = z
  .object({
    user: UserSchema.pick({ id: true, username: true, name: true, phone: true, email: true, lastLoginAt: true }),
    role: z.object({ id: z.string().uuid(), name: z.string(), isLocked: z.boolean() }),
    permissions: PermissionMapSchema,
    flags: FlagsSchema,
    warehouses: z.array(WarehouseSummarySchema),
  })
  .openapi("Me");

export const LoginResponseSchema = z
  .object({
    me: MeSchema,
    accessTokenExpiresIn: z.number().int().openapi({ description: "Seconds until the access token expires" }),
    tokenType: z.literal("Bearer").optional().openapi({ description: "Mobile only" }),
    accessToken: z.string().optional().openapi({ description: "Mobile only. Send as `Authorization: Bearer <token>`" }),
    refreshToken: z.string().optional().openapi({ description: "Mobile only. Opaque; store securely; rotated on every refresh" }),
    refreshTokenExpiresAt: z.string().datetime().optional().openapi({ description: "Mobile only" }),
  })
  .openapi("LoginResponse");

export const LoginHistorySchema = z
  .object({
    id: z.string().uuid(),
    usernameAttempted: z.string(),
    result: z.enum(LOGIN_RESULTS),
    client: z.enum(["web", "mobile"]).nullable(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    createdAt: z.string().datetime(),
    user: z.object({ id: z.string().uuid(), name: z.string(), username: z.string() }).nullable(),
  })
  .openapi("LoginHistoryEntry");

export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;
export type UserDto = z.infer<typeof UserSchema>;
export type RoleDto = z.infer<typeof RoleSchema>;
export type MeDto = z.infer<typeof MeSchema>;
export type WarehouseDto = z.infer<typeof WarehouseSchema>;
export type LoginHistoryDto = z.infer<typeof LoginHistorySchema>;
export type RoleMatrixDto = z.infer<typeof RoleMatrixSchema>;
