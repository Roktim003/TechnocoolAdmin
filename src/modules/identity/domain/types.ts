import type { PermissionMap, SensitiveFlags } from "@/shared/rbac/levels";

export type UserStatus = "ACTIVE" | "DISABLED";
export type ClientType = "web" | "mobile";
export type LoginResult = "SUCCESS" | "WRONG_PASSWORD" | "LOCKED" | "DISABLED" | "UNKNOWN_USER" | "RATE_LIMITED";

export interface WarehouseSummary {
  id: string;
  code: string;
  name: string;
}

export interface Warehouse extends WarehouseSummary {
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  username: string;
  name: string;
  phone: string | null;
  email: string | null;
  roleId: string;
  status: UserStatus;
  lockedAt: Date | null;
  disabledAt: Date | null;
  tokenVersion: number;
  lastLoginAt: Date | null;
  passwordChangedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDetail extends User {
  role: { id: string; name: string; isLocked: boolean };
  warehouses: WarehouseSummary[];
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  isLocked: boolean;
  flags: SensitiveFlags;
  permissions: PermissionMap;
  permissionVersion: number;
  userCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  client: ClientType;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface LoginHistoryEntry {
  id: string;
  userId: string | null;
  usernameAttempted: string;
  result: LoginResult;
  client: ClientType | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  user: { id: string; name: string; username: string } | null;
}
