import { Prisma, type PrismaClient } from "@prisma/client";
import type { Db } from "@/shared/db/prisma";
import { publishDataChange } from "@/shared/events/change-events";
import { toOrderBy } from "@/shared/pagination/list-query";
import { AuditService } from "@/modules/audit/application/audit.service";
import { prismaAuditRepository } from "@/modules/audit/infrastructure/prisma-audit.repository";
import type { OverheadsStore, OverheadsUnitOfWork, WarehouseCostRecord } from "../application/ports";

const ref = { select: { id: true, name: true } } as const;
const include = { warehouse: { select: { id: true, code: true, name: true } }, createdBy: ref, updatedBy: ref, voidedBy: ref } satisfies Prisma.WarehouseCostInclude;
type Row = Prisma.WarehouseCostGetPayload<{ include: typeof include }>;

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const dateOnly = (v: Date) => v.toISOString().slice(0, 10);

const toRecord = (r: Row, attachmentCount: number): WarehouseCostRecord => ({
  id: r.id,
  scope: r.scope,
  warehouse: r.warehouse,
  category: r.category,
  month: dateOnly(r.month),
  amount: r.amount.toFixed(2),
  description: r.description,
  vendorOrPayee: r.vendorOrPayee,
  referenceNo: r.referenceNo,
  createdBy: r.createdBy,
  updatedBy: r.updatedBy,
  voidedAt: r.voidedAt,
  voidedBy: r.voidedBy,
  voidReason: r.voidReason,
  attachmentCount,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

/** Dhaka midnight of a YYYY-MM-DD day, as the UTC instant the ledger stores. */
const dhakaMidnight = (s: string) => new Date(day(s).getTime() - 6 * 3600 * 1000);

/**
 * Average stock value per warehouse and month: the mean of each day's closing stock value
 * (Σ valueChange of the warehouse's ledger up to the end of that Dhaka day), over the month's
 * days up to today. Exported for the reports (Warehouse holding cost).
 */
export async function averageStockValues(db: Db, from: string, to: string, warehouseIds: string[], today: string) {
  if (!warehouseIds.length || from > today) return [];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(ty, tm, 0)).toISOString().slice(0, 10);
  const end = lastDay < today ? lastDay : today;
  const endNext = new Date(day(end).getTime() + 86_400_000).toISOString().slice(0, 10);
  const ids = Prisma.join(warehouseIds.map((id) => Prisma.sql`${id}::uuid`));
  const rows = await db.$queryRaw<{ warehouseId: string; month: Date; avg: Prisma.Decimal | null }[]>`
    WITH opening AS (
      SELECT m."warehouseId" AS wid, SUM(m."valueChange") AS v
      FROM "StockMovement" m
      WHERE m."warehouseId" IN (${ids}) AND m."postedAt" < ${dhakaMidnight(from)}
      GROUP BY 1
    ),
    daily AS (
      SELECT m."warehouseId" AS wid, ((m."postedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Dhaka')::date AS day, SUM(m."valueChange") AS v
      FROM "StockMovement" m
      WHERE m."warehouseId" IN (${ids}) AND m."postedAt" >= ${dhakaMidnight(from)} AND m."postedAt" < ${dhakaMidnight(endNext)}
      GROUP BY 1, 2
    ),
    grid AS (
      SELECT w.id AS wid, g::date AS day
      FROM "Warehouse" w CROSS JOIN generate_series(${from}::date, ${end}::date, interval '1 day') g
      WHERE w.id IN (${ids})
    ),
    closing AS (
      SELECT g.wid, g.day, COALESCE(o.v, 0) + SUM(COALESCE(dl.v, 0)) OVER (PARTITION BY g.wid ORDER BY g.day) AS value
      FROM grid g
      LEFT JOIN daily dl ON dl.wid = g.wid AND dl.day = g.day
      LEFT JOIN opening o ON o.wid = g.wid
    )
    SELECT wid AS "warehouseId", date_trunc('month', day)::date AS month, ROUND(AVG(value), 2) AS avg
    FROM closing
    GROUP BY 1, 2`;
  return rows.map((r) => ({ warehouseId: r.warehouseId, month: dateOnly(r.month), averageStockValue: (r.avg ?? new Prisma.Decimal(0)).toFixed(2) }));
}

export function prismaOverheadsStore(db: Db): OverheadsStore {
  const counts = async (ids: string[]) => {
    if (!ids.length) return new Map<string, number>();
    const g = await db.attachment.groupBy({ by: ["entityId"], where: { entityType: "WarehouseCost", entityId: { in: ids } }, _count: { _all: true } });
    return new Map(g.map((x) => [x.entityId, x._count._all]));
  };
  const load = async (id: string) => {
    const r = await db.warehouseCost.findUnique({ where: { id }, include });
    return r ? toRecord(r, (await counts([id])).get(id) ?? 0) : null;
  };

  return {
    audit: new AuditService(prismaAuditRepository(db)),
    async list(q, warehouseIds) {
      const f = q.filters;
      const where: Prisma.WarehouseCostWhereInput = {
        AND: [
          // Warehouse lines only for warehouses in scope; company lines for everyone with access.
          { OR: [{ warehouseId: null }, { warehouseId: { in: warehouseIds } }] },
          ...(f.scope ? [{ scope: f.scope }] : []),
          ...(f.warehouseId ? [{ warehouseId: f.warehouseId }] : []),
          ...(f.category ? [{ category: f.category }] : []),
          ...(f.monthFrom || f.monthTo ? [{ month: { ...(f.monthFrom ? { gte: day(f.monthFrom) } : {}), ...(f.monthTo ? { lte: day(f.monthTo) } : {}) } }] : []),
          ...(f.includeVoided ? [] : [{ voidedAt: null }]),
          ...(q.q ? [{ OR: (["description", "vendorOrPayee", "referenceNo"] as const).map((k) => ({ [k]: { contains: q.q, mode: "insensitive" as const } })) }] : []),
        ],
      };
      const [rows, total, sum] = await Promise.all([
        db.warehouseCost.findMany({ where, include, orderBy: [...toOrderBy(q.sort), { createdAt: "desc" }] as Prisma.WarehouseCostOrderByWithRelationInput[], skip: q.skip, take: q.take }),
        db.warehouseCost.count({ where }),
        db.warehouseCost.aggregate({ where: { AND: [where, { voidedAt: null }] }, _sum: { amount: true } }),
      ]);
      const c = await counts(rows.map((r) => r.id));
      return { items: rows.map((r) => toRecord(r, c.get(r.id) ?? 0)), total, totalAmount: (sum._sum.amount ?? new Prisma.Decimal(0)).toFixed(2) };
    },
    get: load,
    async lock(id) {
      const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "WarehouseCost" WHERE id = ${id}::uuid FOR UPDATE`;
      return rows.length ? load(id) : null;
    },
    async create(data) {
      return (await db.warehouseCost.create({ data: { ...data, month: day(data.month) }, select: { id: true } })).id;
    },
    async update(id, data) {
      await db.warehouseCost.update({ where: { id }, data: { ...data, month: day(data.month) } });
    },
    async void(id, data) {
      await db.warehouseCost.update({ where: { id }, data: { ...data, voidedAt: new Date() } });
    },
    async auditRows(id) {
      const rows = await db.auditLog.findMany({ where: { entityType: "WarehouseCost", entityId: id }, include: { user: ref }, orderBy: { createdAt: "asc" } });
      return rows.map((r) => ({ id: r.id, action: r.action, at: r.createdAt, by: r.user, before: (r.before as Record<string, unknown> | null) ?? null, after: (r.after as Record<string, unknown> | null) ?? null }));
    },
    warehouse: (id) => db.warehouse.findUnique({ where: { id }, select: { id: true, code: true, name: true, isActive: true } }),
    warehouses: (ids) => db.warehouse.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    async monthlyCosts(from, to, warehouseIds) {
      const g = await db.warehouseCost.groupBy({
        by: ["month", "warehouseId", "category"],
        where: { voidedAt: null, month: { gte: day(from), lte: day(to) }, OR: [{ warehouseId: null }, { warehouseId: { in: warehouseIds } }] },
        _sum: { amount: true },
      });
      return g.map((r) => ({ month: dateOnly(r.month), warehouseId: r.warehouseId, category: r.category, amount: (r._sum.amount ?? new Prisma.Decimal(0)).toFixed(2) }));
    },
    averageStockValues: (from, to, ids, today) => averageStockValues(db, from, to, ids, today),
    attachments: (entityId) => db.attachment.findMany({ where: { entityType: "WarehouseCost", entityId }, include: { uploadedBy: ref }, orderBy: { createdAt: "asc" } }),
    attachment: (id) => db.attachment.findUnique({ where: { id }, include: { uploadedBy: ref } }),
    addAttachment: (data) => db.attachment.create({ data, include: { uploadedBy: ref } }),
    async deleteAttachment(id) {
      await db.attachment.delete({ where: { id } });
    },
  };
}

export function prismaOverheadsUnitOfWork(client: PrismaClient): OverheadsUnitOfWork {
  return {
    store: prismaOverheadsStore(client),
    transaction: async (fn) => {
      const result = await client.$transaction((tx) => fn(prismaOverheadsStore(tx)), { timeout: 30_000, maxWait: 15_000 });
      await publishDataChange("overheads");
      return result;
    },
  };
}
