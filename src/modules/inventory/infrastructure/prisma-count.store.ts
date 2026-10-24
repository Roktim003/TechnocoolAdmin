import type { Prisma } from "@prisma/client";
import type { Db } from "@/shared/db/prisma";
import { toOrderBy } from "@/shared/pagination/list-query";
import type { CountFilters, CountLineRecord, CountRecord, CountStore, CountSummary } from "../application/count.service";

const q3 = (v: Prisma.Decimal | null | undefined) => (v === null || v === undefined ? null : v.toFixed(3));
const ref = { select: { id: true, name: true } } as const;

const countInclude = {
  warehouse: { select: { id: true, code: true, name: true, isActive: true } },
  createdBy: ref,
  submittedBy: ref,
  approvedBy: ref,
  adjustmentEntry: { select: { id: true, number: true } },
  lines: {
    include: {
      product: { select: { id: true, code: true, name: true, barcode: true, model: true, trackSerial: true, unit: { select: { code: true } } } },
      countedBy: ref,
      serials: { orderBy: { serial: "asc" } },
    },
    orderBy: [{ product: { code: "asc" } }, { condition: "asc" }],
  },
} satisfies Prisma.StockCountInclude;

type CountRow = Prisma.StockCountGetPayload<{ include: typeof countInclude }>;
type LineRow = CountRow["lines"][number];

function toLine(l: LineRow): CountLineRecord {
  return {
    id: l.id,
    product: { id: l.product.id, code: l.product.code, name: l.product.name, unitCode: l.product.unit.code, barcode: l.product.barcode, model: l.product.model, trackSerial: l.product.trackSerial },
    condition: l.condition,
    systemQty: q3(l.systemQty),
    countedQty: q3(l.countedQty),
    notCounted: l.notCounted,
    countedBy: l.countedBy,
    countedAt: l.countedAt,
    recountRequested: l.recountRequested,
    note: l.note,
    serials: l.serials.map((s) => ({ serial: s.serial, result: s.result })),
  };
}

function toCount(r: CountRow): CountRecord {
  return {
    id: r.id,
    number: r.number,
    warehouse: r.warehouse,
    scope: r.scope,
    scopeIds: r.scopeIds,
    blindCount: r.blindCount,
    status: r.status,
    notes: r.notes,
    startedAt: r.startedAt,
    submittedAt: r.submittedAt,
    approvedAt: r.approvedAt,
    cancelledAt: r.cancelledAt,
    recountRequestedAt: r.recountRequestedAt,
    createdBy: r.createdBy,
    submittedBy: r.submittedBy,
    approvedBy: r.approvedBy,
    adjustmentEntry: r.adjustmentEntry,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    lines: r.lines.map(toLine),
  };
}

export function prismaCountStore(db: Db): CountStore {
  const get = async (id: string) => {
    const r = await db.stockCount.findUnique({ where: { id }, include: countInclude });
    return r ? toCount(r) : null;
  };
  const s: CountStore = {
    async create(data, lines) {
      const c = await db.stockCount.create({ data: { ...data, lines: { create: lines } }, select: { id: true } });
      return c.id;
    },
    get,
    async lock(id, mode = "update") {
      const rows =
        mode === "update"
          ? await db.$queryRaw<{ id: string }[]>`SELECT id FROM "StockCount" WHERE id = ${id}::uuid FOR UPDATE`
          : await db.$queryRaw<{ id: string }[]>`SELECT id FROM "StockCount" WHERE id = ${id}::uuid FOR SHARE`;
      return rows.length ? get(id) : null;
    },
    async list(q, warehouseIds) {
      const f = q.filters as CountFilters;
      const where: Prisma.StockCountWhereInput = {
        warehouseId: f.warehouseId ? { in: warehouseIds.includes(f.warehouseId) ? [f.warehouseId] : [] } : { in: warehouseIds },
        ...(f.status ? { status: f.status } : {}),
        ...(f.active ? { status: { in: ["COUNTING", "SUBMITTED"] } } : {}),
        ...(q.q ? { OR: [{ number: { contains: q.q, mode: "insensitive" } }, { notes: { contains: q.q, mode: "insensitive" } }] } : {}),
      };
      const [rows, total] = await Promise.all([
        db.stockCount.findMany({
          where,
          include: { warehouse: { select: { id: true, code: true, name: true, isActive: true } }, createdBy: ref, adjustmentEntry: { select: { id: true, number: true } }, _count: { select: { lines: true } } },
          orderBy: [...toOrderBy(q.sort), { id: "asc" }],
          skip: q.skip,
          take: q.take,
        }),
        db.stockCount.count({ where }),
      ]);
      const counted = rows.length
        ? await db.stockCountLine.groupBy({ by: ["countId"], where: { countId: { in: rows.map((r) => r.id) }, OR: [{ countedQty: { not: null } }, { notCounted: true }] }, _count: { _all: true } })
        : [];
      const countedBy = new Map(counted.map((c) => [c.countId, c._count._all]));
      return {
        items: rows.map(
          (r): CountSummary => ({
            id: r.id,
            number: r.number,
            warehouse: r.warehouse,
            scope: r.scope,
            blindCount: r.blindCount,
            status: r.status,
            createdBy: r.createdBy,
            startedAt: r.startedAt,
            submittedAt: r.submittedAt,
            approvedAt: r.approvedAt,
            createdAt: r.createdAt,
            lineCount: r._count.lines,
            countedCount: countedBy.get(r.id) ?? 0,
            adjustmentEntry: r.adjustmentEntry,
          }),
        ),
        total,
      };
    },
    async update(id, data) {
      await db.stockCount.update({ where: { id }, data });
    },
    async replaceLines(id, lines) {
      await db.stockCountLine.deleteMany({ where: { countId: id } });
      await db.stockCountLine.createMany({ data: lines.map((l) => ({ ...l, countId: id })) });
    },
    async addLines(id, lines) {
      await db.stockCountLine.createMany({ data: lines.map((l) => ({ ...l, countId: id })), skipDuplicates: true });
    },
    async lockLine(countId, lineId) {
      const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "StockCountLine" WHERE id = ${lineId}::uuid AND "countId" = ${countId}::uuid FOR UPDATE`;
      if (!rows.length) return null;
      const l = await db.stockCountLine.findUnique({ where: { id: lineId }, include: countInclude.lines.include });
      return l ? toLine(l) : null;
    },
    async updateLine(lineId, data) {
      await db.stockCountLine.update({ where: { id: lineId }, data });
    },
    async setLineSerials(lineId, serials) {
      await db.stockCountSerial.deleteMany({ where: { lineId } });
      if (serials.length) await db.stockCountSerial.createMany({ data: serials.map((x) => ({ ...x, lineId })) });
    },
    async flagRecount(countId, lineIds) {
      return (await db.stockCountLine.updateMany({ where: { countId, id: { in: lineIds } }, data: { recountRequested: true } })).count;
    },
    async scopeProducts(warehouseId, scope, ids) {
      const scoped: Prisma.ProductWhereInput =
        scope === "CATALOG" ? { catalogId: { in: ids } } : scope === "CATEGORY" ? { categoryId: { in: ids } } : scope === "SELECTED_PRODUCTS" ? { id: { in: ids } } : {};
      const rows = await db.product.findMany({
        where: {
          AND: [
            scoped,
            scope === "SELECTED_PRODUCTS" ? {} : { OR: [{ status: "ACTIVE" }, { balances: { some: { warehouseId, qtyOnHand: { gt: 0 } } } }] },
          ],
        },
        select: { id: true },
        orderBy: { code: "asc" },
      });
      return rows.map((r) => r.id);
    },
    async onHand(warehouseId, productIds) {
      if (!productIds.length) return new Map();
      const rows = await db.stockBalance.findMany({ where: { warehouseId, productId: { in: productIds } }, select: { productId: true, condition: true, qtyOnHand: true } });
      return new Map(rows.map((r) => [`${r.productId}|${r.condition}`, r.qtyOnHand.toFixed(3)]));
    },
    async expectedSerials(warehouseId, productIds) {
      if (!productIds.length) return new Map();
      const rows = await db.serialNumber.findMany({ where: { warehouseId, productId: { in: productIds }, status: { in: ["IN_STOCK", "RESERVED", "DAMAGED"] } }, select: { productId: true, serial: true, status: true, reservedEntryId: true } });
      const out = new Map<string, string[]>();
      for (const r of rows) {
        // RESERVED serials are still on the shelf, in the condition they were reserved from (good stock unless damaged).
        const k = `${r.productId}|${r.status === "DAMAGED" ? "DAMAGED" : "GOOD"}`;
        out.set(k, [...(out.get(k) ?? []), r.serial]);
      }
      return out;
    },
    async avgCosts(productIds) {
      if (!productIds.length) return new Map();
      const rows = await db.productCost.findMany({ where: { productId: { in: productIds } }, select: { productId: true, avgCost: true } });
      return new Map(rows.map((r) => [r.productId, r.avgCost.toFixed(4)]));
    },
  };
  return s;
}
