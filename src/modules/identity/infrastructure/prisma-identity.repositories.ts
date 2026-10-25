import type { Prisma, PermissionLevel as PrismaLevel, ModuleKey as PrismaModule } from "@prisma/client";
import type { Db } from "@/shared/db/prisma";
import { toOrderBy } from "@/shared/pagination/list-query";
import { emptyPermissionMap, MODULE_KEYS, type PermissionMap } from "@/shared/rbac/levels";
import { dateRangeWhere } from "@/shared/time/dates";
import { AuditService } from "@/modules/audit/application/audit.service";
import { prismaAuditRepository } from "@/modules/audit/infrastructure/prisma-audit.repository";
import type {
  IdentityRepos,
  LoginHistoryRepository,
  RefreshTokenRepository,
  RoleRepository,
  UserRepository,
  WarehouseRepository,
} from "../application/ports";
import type { Role, UserDetail } from "../domain/types";

/* ─────────────── users ─────────────── */

const userInclude = {
  role: { select: { id: true, name: true, isLocked: true } },
  warehouses: { include: { warehouse: { select: { id: true, code: true, name: true } } }, orderBy: { warehouse: { code: "asc" } } },
} satisfies Prisma.UserInclude;

type UserRow = Prisma.UserGetPayload<{ include: typeof userInclude }>;

function toUser(row: UserRow): UserDetail {
  const { passwordHash: _hash, warehouses, ...rest } = row;
  return { ...rest, warehouses: warehouses.map((w) => w.warehouse) };
}

function userRepository(db: Db): UserRepository {
  return {
    async findById(id) {
      const row = await db.user.findUnique({ where: { id }, include: userInclude });
      return row ? toUser(row) : null;
    },

    async findCredentials(username) {
      const row = await db.user.findUnique({ where: { username }, include: userInclude });
      return row ? { user: toUser(row), passwordHash: row.passwordHash } : null;
    },

    async usernameExists(username, exceptId) {
      const n = await db.user.count({ where: { username, ...(exceptId ? { id: { not: exceptId } } : {}) } });
      return n > 0;
    },

    async list(query) {
      const f = query.filters;
      const where: Prisma.UserWhereInput = {
        ...(f.status ? { status: f.status === "active" ? "ACTIVE" : "DISABLED" } : {}),
        ...(f.roleId ? { roleId: f.roleId } : {}),
        ...(f.warehouseId ? { warehouses: { some: { warehouseId: f.warehouseId } } } : {}),
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: "insensitive" } },
                { username: { contains: query.q, mode: "insensitive" } },
                { phone: { contains: query.q } },
                { email: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        db.user.findMany({
          where,
          include: userInclude,
          orderBy: [
            ...toOrderBy(query.sort, { lastLoginAt: (dir) => ({ lastLoginAt: { sort: dir, nulls: "last" } }) }),
            { id: "asc" },
          ] as Prisma.UserOrderByWithRelationInput[],
          skip: query.skip,
          take: query.take,
        }),
        db.user.count({ where }),
      ]);
      return { items: rows.map(toUser), total };
    },

    async create(data) {
      const { warehouseIds, ...fields } = data;
      const row = await db.user.create({
        data: { ...fields, warehouses: { create: warehouseIds.map((warehouseId) => ({ warehouseId })) } },
        include: userInclude,
      });
      return toUser(row);
    },

    async update(id, data) {
      const { warehouseIds, ...fields } = data;
      const row = await db.user.update({
        where: { id },
        data: {
          ...fields,
          ...(warehouseIds ? { warehouses: { deleteMany: {}, create: warehouseIds.map((warehouseId) => ({ warehouseId })) } } : {}),
        },
        include: userInclude,
      });
      return toUser(row);
    },

    async setStatus(id, status) {
      const row = await db.user.update({
        where: { id },
        data:
          status === "DISABLED"
            ? { status, disabledAt: new Date(), tokenVersion: { increment: 1 } }
            : { status, disabledAt: null },
        include: userInclude,
      });
      return toUser(row);
    },

    async revokeSessions(id) {
      await db.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });
    },

    async setPassword(id, passwordHash) {
      const row = await db.user.update({
        where: { id },
        data: { passwordHash, lockedAt: null, passwordChangedAt: new Date(), tokenVersion: { increment: 1 } },
        include: userInclude,
      });
      return toUser(row);
    },

    async lock(id, at) {
      await db.user.update({ where: { id }, data: { lockedAt: at } });
    },

    async recordLogin(id, at) {
      await db.user.update({ where: { id }, data: { lastLoginAt: at } });
    },

    countActiveAdmins(exceptUserId) {
      return db.user.count({ where: { status: "ACTIVE", role: { isLocked: true }, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) } });
    },
  };
}

/* ─────────────── roles ─────────────── */

const roleInclude = { permissions: true, _count: { select: { users: true } } } satisfies Prisma.RoleInclude;
type RoleRow = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;

function toRole(row: RoleRow): Role {
  const permissions = emptyPermissionMap();
  for (const p of row.permissions) permissions[p.module] = p.level;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isLocked: row.isLocked,
    flags: { seeCost: row.seeCost, seeProfit: row.seeProfit, seeMargin: row.seeMargin },
    permissions,
    permissionVersion: row.permissionVersion,
    userCount: row._count.users,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** System roles first (Admin), then by name. */
const roleOrder: Prisma.RoleOrderByWithRelationInput[] = [{ isLocked: "desc" }, { createdAt: "asc" }, { name: "asc" }];

function roleRepository(db: Db): RoleRepository {
  return {
    async findById(id) {
      const row = await db.role.findUnique({ where: { id }, include: roleInclude });
      return row ? toRole(row) : null;
    },

    async nameExists(nameKey, exceptId) {
      const n = await db.role.count({ where: { nameKey, ...(exceptId ? { id: { not: exceptId } } : {}) } });
      return n > 0;
    },

    async list() {
      const rows = await db.role.findMany({ include: roleInclude, orderBy: roleOrder });
      return rows.map(toRole);
    },

    async create(data) {
      const row = await db.role.create({
        data: {
          name: data.name,
          nameKey: data.nameKey,
          description: data.description,
          ...data.flags,
          permissions: { create: MODULE_KEYS.map((m) => ({ module: m as PrismaModule, level: data.permissions[m] as PrismaLevel })) },
        },
        include: roleInclude,
      });
      return toRole(row);
    },

    async update(id, data) {
      const perms = Object.entries(data.permissions ?? {}).filter(([, level]) => level !== undefined) as [keyof PermissionMap, PrismaLevel][];
      for (const [module, level] of perms) {
        await db.rolePermission.upsert({
          where: { roleId_module: { roleId: id, module } },
          create: { roleId: id, module, level },
          update: { level },
        });
      }
      const row = await db.role.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.nameKey !== undefined ? { nameKey: data.nameKey } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.flags ?? {}),
          permissionVersion: { increment: 1 },
        },
        include: roleInclude,
      });
      return toRole(row);
    },

    async delete(id) {
      await db.role.delete({ where: { id } });
    },
  };
}

/* ─────────────── warehouses ─────────────── */

function warehouseRepository(db: Db): WarehouseRepository {
  return {
    list(opts = {}) {
      return db.warehouse.findMany({
        where: { ...(opts.ids ? { id: { in: opts.ids } } : {}), ...(opts.activeOnly ? { isActive: true } : {}) },
        orderBy: { code: "asc" },
      });
    },
  };
}

/* ─────────────── refresh tokens ─────────────── */

function refreshTokenRepository(db: Db): RefreshTokenRepository {
  const select = { id: true, userId: true, familyId: true, client: true, expiresAt: true, revokedAt: true } as const;
  return {
    create(data) {
      return db.refreshToken.create({ data, select });
    },
    findByHash(tokenHash) {
      return db.refreshToken.findUnique({ where: { tokenHash }, select });
    },
    async markRotated(id, replacedById) {
      // Conditional update: under concurrent refreshes only one caller wins the row.
      const { count } = await db.refreshToken.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: "rotated", replacedById },
      });
      return count === 1;
    },
    async revokeFamily(familyId, reason) {
      const { count } = await db.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
      return count;
    },
    async revokeAllForUser(userId, reason) {
      const { count } = await db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
      return count;
    },
  };
}

/* ─────────────── login history ─────────────── */

function loginHistoryRepository(db: Db): LoginHistoryRepository {
  return {
    async record(entry) {
      await db.loginHistory.create({ data: entry });
    },
    async list(query) {
      const f = query.filters;
      const where: Prisma.LoginHistoryWhereInput = {
        userId: f.userId,
        result: f.result,
        createdAt: dateRangeWhere(f.from, f.to),
        ...(query.q
          ? {
              OR: [
                { usernameAttempted: { contains: query.q, mode: "insensitive" } },
                { ip: { contains: query.q } },
                { userAgent: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        db.loginHistory.findMany({
          where,
          orderBy: [...toOrderBy(query.sort), { id: "asc" }],
          skip: query.skip,
          take: query.take,
          include: { user: { select: { id: true, name: true, username: true } } },
        }),
        db.loginHistory.count({ where }),
      ]);
      return { items, total };
    },
  };
}

export function createIdentityRepos(db: Db): IdentityRepos {
  return {
    users: userRepository(db),
    roles: roleRepository(db),
    warehouses: warehouseRepository(db),
    refreshTokens: refreshTokenRepository(db),
    loginHistory: loginHistoryRepository(db),
    audit: new AuditService(prismaAuditRepository(db)),
  };
}
