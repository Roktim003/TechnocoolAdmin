import type { AccessTokenClaims } from "@/shared/auth/tokens";
import type { Principal } from "@/shared/auth/principal";
import { IdentityErrors } from "../domain/errors";
import { identity } from "./container";

/**
 * Turns verified token claims into a Principal using cached user + role data.
 * Permissions always come from the user's *current* role, so role edits take effect
 * immediately; a tokenVersion mismatch means the session was revoked (disable / password set).
 */
export async function loadPrincipal(claims: AccessTokenClaims, method: Principal["authMethod"]): Promise<Principal> {
  const store = identity().principalStore;
  const user = await store.getUser(claims.sub);
  if (!user || user.status !== "ACTIVE" || user.tokenVersion !== claims.tv) throw IdentityErrors.sessionRevoked();

  const role = await store.getRole(user.roleId);
  if (!role) throw IdentityErrors.sessionRevoked();

  return {
    userId: user.id,
    username: user.username,
    name: user.name,
    roleId: role.id,
    roleName: role.name,
    isAdmin: role.isLocked,
    permissions: role.permissions,
    flags: role.flags,
    warehouseIds: user.warehouseIds,
    permissionVersion: role.permissionVersion,
    authMethod: method,
  };
}

/**
 * The current permissions of a user, without a session (background jobs acting for a user,
 * e.g. a scheduled report running as its owner). Null when the user is missing or not active.
 */
export async function principalForUser(userId: string): Promise<Principal | null> {
  const store = identity().principalStore;
  const user = await store.getUser(userId);
  if (!user || user.status !== "ACTIVE") return null;
  const role = await store.getRole(user.roleId);
  if (!role) return null;
  return {
    userId: user.id,
    username: user.username,
    name: user.name,
    roleId: role.id,
    roleName: role.name,
    isAdmin: role.isLocked,
    permissions: role.permissions,
    flags: role.flags,
    warehouseIds: user.warehouseIds,
    permissionVersion: role.permissionVersion,
    authMethod: "bearer",
  };
}
