import { Prisma } from "@prisma/client";
import type { Db } from "@/shared/db/prisma";
import { toOrderBy } from "@/shared/pagination/list-query";
import { dateRangeWhere } from "@/shared/time/dates";
import type { AuditRepository } from "../application/audit.service";

const json = (v: unknown) => (v === null || v === undefined ? Prisma.JsonNull : (v as Prisma.InputJsonValue));

export function prismaAuditRepository(db: Db): AuditRepository {
  return {
    async insert(row) {
      await db.auditLog.create({
        data: { ...row, before: json(row.before), after: json(row.after) },
      });
    },

    async list(query) {
      const f = query.filters;
      const where: Prisma.AuditLogWhereInput = {
        userId: f.userId,
        entityType: f.entityType,
        entityId: f.entityId,
        action: f.action,
        createdAt: dateRangeWhere(f.from, f.to),
        ...(query.q
          ? {
              OR: [
                { action: { contains: query.q, mode: "insensitive" } },
                { entityType: { contains: query.q, mode: "insensitive" } },
                { entityId: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        db.auditLog.findMany({
          where,
          orderBy: [...toOrderBy(query.sort), { id: "asc" }],
          skip: query.skip,
          take: query.take,
          include: { user: { select: { id: true, name: true, username: true } } },
        }),
        db.auditLog.count({ where }),
      ]);
      return { items, total };
    },
  };
}
