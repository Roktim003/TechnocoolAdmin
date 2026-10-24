import type { PrismaClient } from "@prisma/client";
import { logger } from "@/shared/logger/logger";
import { redis } from "@/shared/redis/redis";
import { emptyPermissionMap, type PermissionMap, type SensitiveFlags } from "@/shared/rbac/levels";
import type { PrincipalCache } from "../application/ports";
import type { UserStatus } from "../domain/types";

export interface CachedUser {
  id: string;
  username: string;
  name: string;
  roleId: string;
  status: UserStatus;
  tokenVersion: number;
  warehouseIds: string[];
}

export interface CachedRole {
  id: string;
  name: string;
  isLocked: boolean;
  permissionVersion: number;
  permissions: PermissionMap;
  flags: SensitiveFlags;
}

const USER_TTL_SECONDS = 300;
const ROLE_TTL_SECONDS = 3600;
const userKey = (id: string) => `auth:user:${id}`;
const roleKey = (id: string) => `rbac:role:${id}`;

/**
 * Per-request auth data (user status/scope and role permissions) cached in Redis.
 * Services invalidate entries after every change, so permission edits apply on the next request.
 * Redis errors fall back to the database instead of failing the request.
 */
export class PrincipalStore implements PrincipalCache {
  constructor(private readonly db: PrismaClient) {}

  private async cached<T>(key: string, ttl: number, load: () => Promise<T | null>): Promise<T | null> {
    try {
      const hit = await redis().get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch (err) {
      logger.warn({ err, key }, "principal cache read failed");
    }
    const value = await load();
    if (value) {
      try {
        await redis().set(key, JSON.stringify(value), "EX", ttl);
      } catch (err) {
        logger.warn({ err, key }, "principal cache write failed");
      }
    }
    return value;
  }

  getUser(id: string): Promise<CachedUser | null> {
    return this.cached(userKey(id), USER_TTL_SECONDS, async () => {
      const u = await this.db.user.findUnique({
        where: { id },
        select: { id: true, username: true, name: true, roleId: true, status: true, tokenVersion: true, warehouses: { select: { warehouseId: true } } },
      });
      return u ? { ...u, warehouseIds: u.warehouses.map((w) => w.warehouseId) } : null;
    });
  }

  getRole(id: string): Promise<CachedRole | null> {
    return this.cached(roleKey(id), ROLE_TTL_SECONDS, async () => {
      const r = await this.db.role.findUnique({ where: { id }, include: { permissions: true } });
      if (!r) return null;
      const permissions = emptyPermissionMap();
      for (const p of r.permissions) permissions[p.module] = p.level;
      return {
        id: r.id,
        name: r.name,
        isLocked: r.isLocked,
        permissionVersion: r.permissionVersion,
        permissions,
        flags: { seeCost: r.seeCost, seeProfit: r.seeProfit, seeMargin: r.seeMargin },
      };
    });
  }

  private async del(key: string) {
    try {
      await redis().del(key);
    } catch (err) {
      // A stale entry would outlive a permission change, so make this loud.
      logger.error({ err, key }, "principal cache invalidation failed");
    }
  }

  invalidateUser(userId: string) {
    return this.del(userKey(userId));
  }

  invalidateRole(roleId: string) {
    return this.del(roleKey(roleId));
  }
}
