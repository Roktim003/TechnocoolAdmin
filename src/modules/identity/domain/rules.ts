import { emptyPermissionMap, type PermissionMap, type SensitiveFlags } from "@/shared/rbac/levels";
import { IdentityErrors } from "./errors";
import type { Role, User } from "./types";

/** Passwords set by an Admin: at least this long and not on the common-password list. */
export const PASSWORD_MIN_LENGTH = 10;
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

/** Usernames are case-insensitive: they are stored and compared lower-cased. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Role names are unique ignoring case and surrounding whitespace. */
export function roleNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function assertCanDisable(actorId: string, target: Pick<User, "id">): void {
  if (actorId === target.id) throw IdentityErrors.cannotDisableSelf();
}

export function assertCanChangeRole(actorId: string, target: Pick<User, "id" | "roleId">, newRoleId: string | undefined): void {
  if (newRoleId && newRoleId !== target.roleId && actorId === target.id) throw IdentityErrors.cannotChangeOwnRole();
}

/** Prevents the system from ending up with no active Admin. */
export function assertNotLastAdmin(isAdminTarget: boolean, otherActiveAdmins: number): void {
  if (isAdminTarget && otherActiveAdmins === 0) throw IdentityErrors.lastAdmin();
}

export function assertRoleEditable(role: Pick<Role, "isLocked">): void {
  if (role.isLocked) throw IdentityErrors.roleLocked();
}

export function assertRoleDeletable(role: Pick<Role, "isLocked" | "userCount">): void {
  assertRoleEditable(role);
  if (role.userCount > 0) throw IdentityErrors.roleInUse(role.userCount);
}

/** Login lockout: the account locks once failures within the window reach the limit. */
export function shouldLock(failuresInWindow: number, maxFailures: number): boolean {
  return failuresInWindow >= maxFailures;
}

/** Permissions for a new role: copied from a template role, or all NONE. */
export function initialPermissions(template?: Pick<Role, "permissions" | "flags">): { permissions: PermissionMap; flags: SensitiveFlags } {
  if (template) return { permissions: { ...template.permissions }, flags: { ...template.flags } };
  return { permissions: emptyPermissionMap(), flags: { seeCost: false, seeProfit: false, seeMargin: false } };
}
