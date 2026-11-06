import type { Prisma } from "@prisma/client";
import type { Db } from "@/shared/db/prisma";
import { hasLevel, type ModuleKey, type PermissionLevel } from "@/shared/rbac/levels";
import type { NotificationStore, PushDeviceStore, RecipientDirectory } from "../application/ports";

export function prismaNotificationStore(db: Db): NotificationStore {
  return {
    async create(rows) {
      if (!rows.length) return [];
      return db.notification.createManyAndReturn({ data: rows, select: { id: true, userId: true } });
    },
    async list(userId, q) {
      const where: Prisma.NotificationWhereInput = { userId, ...(q.filters.unread ? { readAt: null } : {}), ...(q.filters.type ? { type: q.filters.type } : {}) };
      const [items, total] = await Promise.all([db.notification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: q.skip, take: q.take }), db.notification.count({ where })]);
      return { items, total };
    },
    unreadCount: (userId) => db.notification.count({ where: { userId, readAt: null } }),
    async markRead(userId, id) {
      const n = await db.notification.findFirst({ where: { id, userId } });
      if (!n) return null;
      return n.readAt ? n : db.notification.update({ where: { id }, data: { readAt: new Date() } });
    },
    async markAllRead(userId) {
      return (await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } })).count;
    },
    async preferences(userIds, type) {
      if (!userIds.length) return [];
      return db.notificationPreference.findMany({ where: { userId: { in: userIds }, ...(type ? { type } : {}) }, select: { userId: true, type: true, email: true, push: true } });
    },
    async setPreferences(userId, prefs) {
      for (const p of prefs) {
        const set = { ...(p.email !== undefined ? { email: p.email } : {}), ...(p.push !== undefined ? { push: p.push } : {}) };
        await db.notificationPreference.upsert({ where: { userId_type: { userId, type: p.type } }, create: { userId, type: p.type, ...set }, update: set });
      }
    },
    async recipients(userIds) {
      if (!userIds.length) return [];
      const users = await db.user.findMany({ where: { id: { in: userIds }, status: "ACTIVE" }, select: { id: true, name: true, email: true } });
      return users;
    },
    async createEmailLog(data) {
      return (await db.emailLog.create({ data, select: { id: true } })).id;
    },
    async updateEmailLog(id, data) {
      await db.emailLog.update({ where: { id }, data });
    },
  };
}

const DEVICE = { id: true, userId: true, platform: true, deviceName: true, appVersion: true, lastSeenAt: true, createdAt: true } as const;

export function prismaPushDeviceStore(db: Db): PushDeviceStore {
  return {
    async register(userId, data, max) {
      const existing = await db.pushDevice.findUnique({ where: { token: data.token }, select: { id: true } });
      const fields = { userId, platform: data.platform, deviceName: data.deviceName, appVersion: data.appVersion, lastSeenAt: new Date() };
      // Native INSERT … ON CONFLICT: two registrations of the same token at once can't collide.
      const device = await db.pushDevice.upsert({ where: { token: data.token }, create: { ...fields, token: data.token }, update: fields, select: DEVICE });
      const stale = await db.pushDevice.findMany({ where: { userId }, orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }], skip: max, select: { id: true } });
      if (stale.length) await db.pushDevice.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
      return { device, created: !existing };
    },
    list: (userId) => db.pushDevice.findMany({ where: { userId }, orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }], select: DEVICE }),
    async remove(userId, id) {
      return (await db.pushDevice.deleteMany({ where: { id, userId } })).count > 0;
    },
    async deviceIdsOf(userIds) {
      if (!userIds.length) return [];
      return db.pushDevice.findMany({ where: { userId: { in: userIds } }, select: { id: true, userId: true } });
    },
    device: (id) => db.pushDevice.findUnique({ where: { id }, select: { id: true, userId: true, token: true } }),
    async removeDevice(id) {
      await db.pushDevice.deleteMany({ where: { id } });
    },
  };
}

export function prismaRecipientDirectory(db: Db): RecipientDirectory {
  return {
    async withModuleLevel(module: ModuleKey, level: PermissionLevel, opts = {}) {
      const exclude = new Set((opts.exclude ?? []).filter((x): x is string => !!x));
      const users = await db.user.findMany({
        where: { status: "ACTIVE", ...(opts.warehouseId ? { warehouses: { some: { warehouseId: opts.warehouseId } } } : {}) },
        select: { id: true, role: { select: { permissions: { where: { module }, select: { level: true } } } } },
      });
      return users.filter((u) => !exclude.has(u.id) && hasLevel(u.role.permissions[0]?.level ?? "NONE", level)).map((u) => u.id);
    },
    async withFlag(flag, opts = {}) {
      const exclude = new Set((opts.exclude ?? []).filter((x): x is string => !!x));
      const users = await db.user.findMany({
        where: { status: "ACTIVE", role: { [flag]: true } },
        select: { id: true, role: { select: { permissions: opts.module ? { where: { module: opts.module }, select: { level: true } } : false } } },
      });
      return users.filter((u) => !exclude.has(u.id) && (!opts.module || hasLevel(u.role.permissions?.[0]?.level ?? "NONE", opts.level ?? "VIEW"))).map((u) => u.id);
    },
    async withRoles(roleIds) {
      if (!roleIds.length) return [];
      return (await db.user.findMany({ where: { status: "ACTIVE", roleId: { in: roleIds } }, select: { id: true } })).map((u) => u.id);
    },
  };
}
