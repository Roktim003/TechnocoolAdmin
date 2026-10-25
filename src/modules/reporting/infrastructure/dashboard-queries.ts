import type { Prisma } from "@prisma/client";
import { ENTRY_TYPE_META, type EntryType } from "@/modules/inventory/domain/types";
import { OPEN } from "@/modules/purchasing/domain/types";
import { redis } from "@/shared/redis/redis";
import { logger } from "@/shared/logger/logger";
import { hasLevel } from "@/shared/rbac/levels";
import type { DashboardQueries } from "../application/dashboard.service";
import type { DashboardCache } from "../application/ports";
import { dhakaDay, int, isoDate, readOnly, sql, uuidArray, zeroMoney, zeroQty } from "./sql";

type D = Prisma.Decimal;

const transit = (scope: Prisma.Sql) => sql`
  SELECT it."productId", SUM(it.qty) AS qty FROM "StockInTransit" it JOIN "StockEntry" e ON e.id = it."transferEntryId"
  WHERE it.qty > 0 AND (e."warehouseId" = ANY(${scope}) OR e."toWarehouseId" = ANY(${scope})) GROUP BY 1`;

const lowBase = (scope: Prisma.Sql) => sql`
  WITH a AS (
    SELECT "productId", SUM(GREATEST("qtyOnHand" - "qtyReserved", 0)) AS available FROM "StockBalance"
    WHERE condition = 'GOOD' AND "warehouseId" = ANY(${scope}) GROUP BY 1
  ), low AS (
    SELECT p.id, p.code, p.name, u.code AS unit, COALESCE(a.available, 0) AS available, p."minStockLevel" AS minimum
    FROM "Product" p JOIN "Unit" u ON u.id = p."unitId" LEFT JOIN a ON a."productId" = p.id
    WHERE p.status = 'ACTIVE' AND p."minStockLevel" > 0 AND COALESCE(a.available, 0) < p."minStockLevel"
  )`;

/** Small read-only aggregates for the dashboard (all scoped to the viewer's warehouses). */
export const dashboardQueries: DashboardQueries = {
  stockValue: (ids) =>
    readOnly(async (db) => {
      const scope = uuidArray(ids);
      const [r] = await db.$queryRaw<{ v: D | null }[]>`
        WITH b AS (SELECT "productId", SUM("qtyOnHand") AS q FROM "StockBalance" WHERE "warehouseId" = ANY(${scope}) GROUP BY 1), t AS (${transit(scope)})
        SELECT SUM(ROUND((COALESCE(b.q, 0) + COALESCE(t.qty, 0)) * COALESCE(pc."avgCost", 0), 2)) AS v
        FROM "Product" p LEFT JOIN b ON b."productId" = p.id LEFT JOIN t ON t."productId" = p.id LEFT JOIN "ProductCost" pc ON pc."productId" = p.id`;
      return zeroMoney(r?.v);
    }),

  lowStock: (ids, limit) =>
    readOnly(async (db) => {
      const base = lowBase(uuidArray(ids));
      const [c] = await db.$queryRaw<{ n: bigint }[]>`${base} SELECT COUNT(*) AS n FROM low`;
      const top = await db.$queryRaw<{ id: string; code: string; name: string; unit: string; available: D; minimum: D }[]>`${base} SELECT * FROM low ORDER BY minimum - available DESC, code LIMIT ${limit}`;
      return { count: int(c?.n), top: top.map((t) => ({ productId: t.id, code: t.code, name: t.name, unit: t.unit, available: zeroQty(t.available), minimum: zeroQty(t.minimum) })) };
    }),

  openPos: (ids, today) =>
    readOnly(async (db) => {
      const [r] = await db.$queryRaw<{ open: bigint; overdue: bigint }[]>`
        SELECT COUNT(*) AS open, COUNT(*) FILTER (WHERE "expectedDeliveryDate" < ${today}::date) AS overdue FROM "PurchaseOrder"
        WHERE status::text = ANY(${OPEN}) AND "deliverToWarehouseId" = ANY(${uuidArray(ids)})`;
      return { open: int(r?.open), overdue: int(r?.overdue) };
    }),

  runningProjects: () => readOnly((db) => db.project.count({ where: { status: "RUNNING" } })),

  transfersToReceive: (ids) => readOnly((db) => db.stockEntry.count({ where: { type: "TRANSFER", status: "DISPATCHED", toWarehouseId: { in: ids } } })),

  byBrand: (ids, money) =>
    readOnly(async (db) => {
      const scope = uuidArray(ids);
      const rows = await db.$queryRaw<{ brand: string; v: D }[]>`
        WITH b AS (SELECT "productId", SUM("qtyOnHand") AS q FROM "StockBalance" WHERE "warehouseId" = ANY(${scope}) GROUP BY 1), t AS (${transit(scope)})
        SELECT c.name AS brand, ${money ? sql`SUM(ROUND((COALESCE(b.q, 0) + COALESCE(t.qty, 0)) * COALESCE(pc."avgCost", 0), 2))` : sql`SUM(COALESCE(b.q, 0) + COALESCE(t.qty, 0))`} AS v
        FROM "Product" p JOIN "Catalog" c ON c.id = p."catalogId"
        LEFT JOIN b ON b."productId" = p.id LEFT JOIN t ON t."productId" = p.id LEFT JOIN "ProductCost" pc ON pc."productId" = p.id
        GROUP BY c.name HAVING SUM(COALESCE(b.q, 0) + COALESCE(t.qty, 0)) <> 0 ORDER BY v DESC LIMIT 10`;
      return rows.map((r) => ({ label: r.brand, value: money ? zeroMoney(r.v) : zeroQty(r.v) }));
    }),

  inOut: (ids, from, to) =>
    readOnly(async (db) => {
      const rows = await db.$queryRaw<{ day: Date; i: D | null; o: D | null }[]>`
        WITH days AS (SELECT generate_series(${from}::date, ${to}::date, interval '1 day')::date AS day),
        m AS (
          SELECT ${dhakaDay(sql`"postedAt"`)} AS day, SUM(GREATEST("qtyChange", 0)) AS i, SUM(GREATEST(-"qtyChange", 0)) AS o
          FROM "StockMovement" WHERE "warehouseId" = ANY(${uuidArray(ids)}) AND "postedAt" >= (${from}::date - interval '1 day') GROUP BY 1
        )
        SELECT days.day, m.i, m.o FROM days LEFT JOIN m ON m.day = days.day ORDER BY days.day`;
      return rows.map((r) => ({ date: isoDate(r.day)!, inQty: zeroQty(r.i), outQty: zeroQty(r.o) }));
    }),

  topIssued: (ids, from) =>
    readOnly(async (db) => {
      const rows = await db.$queryRaw<{ code: string; v: D }[]>`
        SELECT p.code, -SUM(m."qtyChange") AS v
        FROM "StockMovement" m
        JOIN "StockEntry" e ON e.id = m."entryId"
        LEFT JOIN "StockEntry" o ON o.id = e."reversalOfId" AND e.type = 'REVERSAL'
        JOIN "Product" p ON p.id = m."productId"
        WHERE COALESCE(o.type, e.type) = 'ISSUE_TO_PROJECT' AND m."warehouseId" = ANY(${uuidArray(ids)}) AND ${dhakaDay(sql`m."postedAt"`)} >= ${from}::date
        GROUP BY p.code HAVING -SUM(m."qtyChange") > 0 ORDER BY v DESC, p.code LIMIT 10`;
      return rows.map((r) => ({ label: r.code, value: zeroQty(r.v) }));
    }),

  projectCostVsContract: (ids) =>
    readOnly(async (db) => {
      const rows = await db.$queryRaw<{ code: string; cost: D; contract: D }[]>`
        WITH mat AS (
          SELECT COALESCE(o."projectId", e."projectId") AS pid, -SUM(m."valueChange") AS cost
          FROM "StockMovement" m JOIN "StockEntry" e ON e.id = m."entryId"
          LEFT JOIN "StockEntry" o ON o.id = e."reversalOfId" AND e.type = 'REVERSAL'
          WHERE COALESCE(o.type, e.type) IN ('ISSUE_TO_PROJECT', 'RETURN_FROM_SITE') AND m."warehouseId" = ANY(${uuidArray(ids)})
          GROUP BY 1
        ), oc AS (SELECT "projectId" AS pid, SUM(amount) AS cost FROM "ProjectCost" WHERE "voidedAt" IS NULL GROUP BY 1)
        SELECT pr.code, COALESCE(mat.cost, 0) + COALESCE(oc.cost, 0) AS cost, pr."contractValue" AS contract
        FROM "Project" pr LEFT JOIN mat ON mat.pid = pr.id LEFT JOIN oc ON oc.pid = pr.id
        WHERE pr.status IN ('RUNNING', 'ON_HOLD') AND pr."contractValue" > 0
        ORDER BY pr."contractValue" DESC, pr.code LIMIT 8`;
      return rows.map((r) => ({ label: r.code, cost: zeroMoney(r.cost), contract: zeroMoney(r.contract) }));
    }),

  recentActivity: (ids, limit) =>
    readOnly(async (db) => {
      const rows = await db.stockEntry.findMany({
        where: { postedAt: { not: null }, status: { in: ["POSTED", "DISPATCHED", "RECEIVED", "REVERSED"] }, OR: [{ warehouseId: { in: ids } }, { toWarehouseId: { in: ids } }] },
        orderBy: { postedAt: "desc" },
        take: limit,
        select: { id: true, number: true, draftRef: true, type: true, postedAt: true, warehouse: { select: { code: true } }, toWarehouse: { select: { code: true } }, createdBy: { select: { name: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        number: r.number ?? r.draftRef,
        type: r.type,
        typeLabel: ENTRY_TYPE_META[r.type as EntryType].label,
        warehouse: r.toWarehouse ? `${r.warehouse.code} → ${r.toWarehouse.code}` : r.warehouse.code,
        postedAt: r.postedAt!,
        by: r.createdBy.name,
      }));
    }),

  approvals: (v, limit) =>
    readOnly(async (db) => {
      const inv = hasLevel(v.permissions.inventory, "APPROVE");
      const pur = hasLevel(v.permissions.purchasing, "APPROVE");
      const ownPo = hasLevel(v.permissions.purchasing, "FULL");
      const ids = v.warehouseIds;
      const [entries, counts, pos] = await Promise.all([
        inv
          ? db.stockEntry.findMany({ where: { status: "PENDING", warehouseId: { in: ids }, createdById: { not: v.userId } }, orderBy: { submittedAt: "asc" }, select: { id: true, number: true, draftRef: true, type: true, entryDate: true, warehouse: { select: { code: true } }, createdBy: { select: { name: true } } } })
          : [],
        inv
          ? db.stockCount.findMany({ where: { status: "SUBMITTED", warehouseId: { in: ids }, OR: [{ submittedById: null }, { submittedById: { not: v.userId } }] }, orderBy: { submittedAt: "asc" }, select: { id: true, number: true, submittedAt: true, warehouse: { select: { code: true } }, createdBy: { select: { name: true } } } })
          : [],
        pur
          ? db.purchaseOrder.findMany({ where: { status: "PENDING_APPROVAL", deliverToWarehouseId: { in: ids }, ...(ownPo ? {} : { createdById: { not: v.userId } }) }, orderBy: { submittedAt: "asc" }, select: { id: true, number: true, draftRef: true, poDate: true, deliverTo: { select: { code: true } }, createdBy: { select: { name: true } } } })
          : [],
      ]);
      const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
      const items = [
        ...entries.map((e) => ({ kind: "entry" as const, id: e.id, number: e.number ?? e.draftRef, label: ENTRY_TYPE_META[e.type as EntryType].label, warehouse: e.warehouse.code, date: day(e.entryDate), by: e.createdBy.name })),
        ...counts.map((c) => ({ kind: "count" as const, id: c.id, number: c.number, label: "Stock count", warehouse: c.warehouse.code, date: c.submittedAt ? isoDate(new Date(c.submittedAt.getTime() + 6 * 3600_000))! : "", by: c.createdBy.name })),
        ...pos.map((p) => ({ kind: "po" as const, id: p.id, number: p.number ?? p.draftRef, label: "Purchase order", warehouse: p.deliverTo.code, date: day(p.poDate), by: p.createdBy.name })),
      ].sort((a, b) => a.date.localeCompare(b.date));
      return { entries: entries.length, counts: counts.length, pos: pos.length, items: items.slice(0, limit) };
    }),

  myEntries: (userId, limit) =>
    readOnly(async (db) => {
      const rows = await db.stockEntry.findMany({ where: { createdById: userId, status: { not: "DRAFT" } }, orderBy: { updatedAt: "desc" }, take: limit, select: { id: true, number: true, draftRef: true, type: true, status: true, entryDate: true } });
      return rows.map((r) => ({ id: r.id, number: r.number ?? r.draftRef, typeLabel: ENTRY_TYPE_META[r.type as EntryType].label, status: r.status, date: r.entryDate.toISOString().slice(0, 10) }));
    }),
};

const CHANGED_KEY = "dash:changed-at";
const refreshKey = (key: string) => `${key}:refresh`;

/** Redis cache for the shared dashboard widgets; Redis errors fall back to computing. */
export const redisDashboardCache: DashboardCache = {
  async get<T>(key: string) {
    try {
      const hit = await redis().get(key);
      return hit ? (JSON.parse(hit) as T) : null;
    } catch (err) {
      logger.warn({ err }, "dashboard cache read failed");
      return null;
    }
  },
  async set(key, value, ttl) {
    try {
      await redis().multi().set(key, JSON.stringify(value), "EX", ttl).del(refreshKey(key)).exec();
    } catch (err) {
      logger.warn({ err }, "dashboard cache write failed");
    }
  },
  async clear() {
    try {
      await redis().set(CHANGED_KEY, String(Date.now()), "EX", 24 * 3600);
    } catch (err) {
      logger.warn({ err }, "dashboard cache clear failed");
    }
  },
  async changedAt() {
    try {
      return Number((await redis().get(CHANGED_KEY)) ?? 0);
    } catch {
      return Date.now(); // can't tell: treat cached widgets as stale
    }
  },
  async claimRefresh(key) {
    try {
      // Expires on its own if the refresher dies; set() removes it when the new value is stored.
      return (await redis().set(refreshKey(key), "1", "EX", 15, "NX")) === "OK";
    } catch {
      return true;
    }
  },
};
