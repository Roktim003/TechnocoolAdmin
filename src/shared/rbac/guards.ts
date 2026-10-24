import { ForbiddenError } from "@/shared/errors/app-error";
import type { Principal } from "@/shared/auth/principal";
import { hasLevel, MODULE_LABELS, type ModuleKey, type PermissionLevel } from "./levels";

export function hasPermission(principal: Principal, module: ModuleKey, minLevel: PermissionLevel): boolean {
  return hasLevel(principal.permissions[module], minLevel);
}

/** Throws 403 unless the caller has at least `minLevel` on `module`. */
export function requirePermission(principal: Principal, module: ModuleKey, minLevel: PermissionLevel): void {
  if (!hasPermission(principal, module, minLevel)) {
    throw new ForbiddenError(`This action requires ${minLevel} access to ${MODULE_LABELS[module]}.`);
  }
}

/** Throws 403 unless the caller meets at least one of the requirements (e.g. purchasing VIEW or inventory VIEW). */
export function requireAnyPermission(principal: Principal, options: readonly (readonly [ModuleKey, PermissionLevel])[]): void {
  if (!options.some(([m, l]) => hasPermission(principal, m, l))) {
    throw new ForbiddenError(`This action requires ${options.map(([m, l]) => `${l} access to ${MODULE_LABELS[m]}`).join(" or ")}.`);
  }
}

export function canAccessWarehouse(principal: Principal, warehouseId: string): boolean {
  return principal.warehouseIds.includes(warehouseId);
}

/** Throws 403 unless the caller is scoped to `warehouseId`. */
export function requireWarehouse(principal: Principal, warehouseId: string): void {
  if (!canAccessWarehouse(principal, warehouseId)) {
    throw new ForbiddenError("You do not have access to this warehouse.");
  }
}
