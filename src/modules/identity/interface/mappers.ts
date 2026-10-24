import { MODULE_KEYS, MODULE_LABELS } from "@/shared/rbac/levels";
import type { LoginHistoryEntry, Role, UserDetail, Warehouse } from "../domain/types";
import type { Session } from "../application/auth.service";
import type { LoginHistoryDto, MeDto, RoleDto, RoleMatrixDto, UserDto, WarehouseDto } from "../application/dto";

const iso = (d: Date) => d.toISOString();
const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);

export function toUserDto(u: UserDetail): UserDto {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    phone: u.phone,
    email: u.email,
    status: u.status === "ACTIVE" ? "active" : "disabled",
    isLocked: u.lockedAt !== null,
    role: { id: u.role.id, name: u.role.name },
    warehouses: u.warehouses,
    lastLoginAt: isoOrNull(u.lastLoginAt),
    createdAt: iso(u.createdAt),
    updatedAt: iso(u.updatedAt),
  };
}

export function toRoleDto(r: Role): RoleDto {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    isLocked: r.isLocked,
    permissions: r.permissions,
    flags: r.flags,
    userCount: r.userCount,
    permissionVersion: r.permissionVersion,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

export function toRoleMatrixDto(roles: Role[]): RoleMatrixDto {
  return {
    modules: MODULE_KEYS.map((key) => ({ key, label: MODULE_LABELS[key] })),
    roles: roles.map((r) => ({ id: r.id, name: r.name, isLocked: r.isLocked, userCount: r.userCount, permissions: r.permissions, flags: r.flags })),
  };
}

export function toMeDto(user: UserDetail, role: Role): MeDto {
  return {
    user: { id: user.id, username: user.username, name: user.name, phone: user.phone, email: user.email, lastLoginAt: isoOrNull(user.lastLoginAt) },
    role: { id: role.id, name: role.name, isLocked: role.isLocked },
    permissions: role.permissions,
    flags: role.flags,
    warehouses: user.warehouses,
  };
}

export function toLoginResponse(s: Session) {
  const base = { me: toMeDto(s.user, s.role), accessTokenExpiresIn: s.accessTokenExpiresIn };
  if (s.client !== "mobile") return base;
  return {
    ...base,
    tokenType: "Bearer" as const,
    accessToken: s.accessToken,
    refreshToken: s.refreshToken,
    refreshTokenExpiresAt: s.refreshTokenExpiresAt.toISOString(),
  };
}

export function toWarehouseDto(w: Warehouse): WarehouseDto {
  return { id: w.id, code: w.code, name: w.name, isActive: w.isActive };
}

export function toLoginHistoryDto(h: LoginHistoryEntry): LoginHistoryDto {
  return {
    id: h.id,
    usernameAttempted: h.usernameAttempted,
    result: h.result,
    client: h.client,
    ip: h.ip,
    userAgent: h.userAgent,
    createdAt: iso(h.createdAt),
    user: h.user,
  };
}

