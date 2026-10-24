import type { ModuleKey, PermissionLevel, PermissionMap, SensitiveFlags } from "@/shared/rbac/levels";

/** The authenticated caller, resolved once per request from a cookie or bearer token. */
export interface Principal {
  userId: string;
  username: string;
  name: string;
  roleId: string;
  roleName: string;
  /** True for the built-in, locked Admin role. */
  isAdmin: boolean;
  permissions: PermissionMap;
  flags: SensitiveFlags;
  warehouseIds: string[];
  permissionVersion: number;
  authMethod: "cookie" | "bearer";
}

export type PermissionRequirement = readonly [ModuleKey, PermissionLevel];
