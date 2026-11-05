import { Prisma } from "@prisma/client";
import { holdingPercent } from "@/modules/overheads/domain/rules";
import { averageStockValues } from "@/modules/overheads/infrastructure/prisma-overheads.store";
import { dhakaDate, monthLabel, resolveMonth } from "../../domain/schedule";
import type { ChartSpec, ReportRow } from "../../domain/types";
import { seesOverheads } from "../../domain/visibility";
import type { ParsedParams, RunContext } from "../../application/ports";
import { defineReport, moneyCol, moneyTotal, percentCol, rowsOnly, str, text } from "../columns";
import { int, isoDate, money, orderBy, sql, uuidArray, zeroMoney, type Sql } from "../sql";
import { P } from "./common";

type D = Prisma.Decimal;
const dec = (v: D | null | undefined) => v ?? new Prisma.Decimal(0);

/*
 * Overheads in reports: store charge and holding cost (per warehouse) and the established cost
 * (company-wide) are entered as amounts in the register ("WarehouseCost") and charged to projects
 * as project cost lines. They never change stock value. Every figure here needs overhead access
 * (overheads ≥ VIEW + seeCost): the reports require it as a whole, and each column too.
 */

const CATEGORY_COLUMNS = [
  { category: "STORE_CHARGE", key: "storeCharge", label: "Store charge" },
  { category: "HOLDING", key: "holding", label: "Holding cost" },
  { category: "ESTABLISHMENT", key: "establishment", label: "Established cost" },
] as const;

/**
 * What was actually spent on overheads per month and category: non-voided register lines; store
 * charge / holding only for the given warehouses, the established cost (company lines) always.
 * Columns: month (date), category (text), amount.
 */
export function overheadSpent(scope: string[], fromMonth: string, toMonth: string): Sql {
  return sql`
    SELECT month, category::text AS category, SUM(amount) AS amount
    FROM "WarehouseCost"
    WHERE "voidedAt" IS NULL AND month >= ${fromMonth}::date AND month <= ${toMonth}::date
      AND ("warehouseId" IS NULL OR "warehouseId" = ANY(${uuidArray(scope)}))
    GROUP BY 1, 2`;
}

/**
 * What was charged to projects per month and overhead category: non-voided project cost lines of
 * the overhead categories. A line with a period (periodFrom–periodTo) is spread evenly over the
 * period's months (rounded to 2 decimals, the last month taking the rounding remainder); a line
 * without one counts in the month of its date. Columns: month (date), category (text), amount.
 */
export function overheadCharged(fromMonth: string, toMonth: string): Sql {
  return sql`
    SELECT s.month, s.category, SUM(s.amount) AS amount FROM (
      SELECT g.month, c.category,
             CASE WHEN g.month = c.m1 THEN c.amount - ROUND(c.amount / c.n, 2) * (c.n - 1) ELSE ROUND(c.amount / c.n, 2) END AS amount
      FROM (
        SELECT x.*, ((EXTRACT(YEAR FROM x.m1) - EXTRACT(YEAR FROM x.m0)) * 12 + EXTRACT(MONTH FROM x.m1) - EXTRACT(MONTH FROM x.m0) + 1)::int AS n
        FROM (
          SELECT y.category, y.amount, y.m0, GREATEST(y.m1, y.m0) AS m1 FROM (
            SELECT pc.category::text AS category, pc.amount,
                   date_trunc('month', COALESCE(pc."periodFrom", pc.date)::timestamp)::date AS m0,
                   date_trunc('month', COALESCE(pc."periodTo", pc."periodFrom", pc.date)::timestamp)::date AS m1
            FROM "ProjectCost" pc
            WHERE pc."voidedAt" IS NULL AND pc.category IN ('STORE_CHARGE', 'HOLDING', 'ESTABLISHMENT')
          ) y
        ) x
        WHERE x.m1 >= ${fromMonth}::date AND x.m0 <= ${toMonth}::date
      ) c
      CROSS JOIN LATERAL (SELECT gs::date AS month FROM generate_series(c.m0::timestamp, c.m1::timestamp, interval '1 month') gs) g
      WHERE g.month >= ${fromMonth}::date AND g.month <= ${toMonth}::date
    ) s
    GROUP BY 1, 2`;
}

/** The report's month range (both ends; the params layer fills defaults and checks the order). */
function range(p: ParsedParams, ctx: RunContext) {
  const to = str(p, "monthTo") ?? resolveMonth("thisMonth", ctx.now)!;
  const from = str(p, "monthFrom") ?? to;
  return { from, to };
}

const months = (from: string, to: string) => sql`SELECT gs::date AS month FROM generate_series(${from}::timestamp, ${to}::timestamp, interval '1 month') gs`;

/* ───────────────────────── 16. Warehouse holding cost ───────────────────────── */

const HOLDING_CHART: ChartSpec = { type: "bar", title: "Store charge + holding cost by month", valueType: "money", requires: "overheads" };

export const warehouseHoldingCost = defineReport({
  meta: {
    id: "warehouse-holding-cost",
    number: 16,
    title: "Warehouse holding cost",
    group: "Stock",
    description:
      "Per month and warehouse: store charge and holding cost actually spent (overhead register, voided lines excluded), their total, the average stock value (mean of each day's closing value from the ledger, days up to today) and holding cost as a % of it. Overheads never change stock value. Needs overhead access.",
    landscape: false,
  },
  requires: "overheads",
  params: [P.monthFrom(), P.monthTo(), P.warehouse],
  sortFields: ["month", "warehouse", "holding", "total"],
  defaultSort: "month,warehouse",
  columns: () => [
    text("month", "Month", { sortKey: "month", width: 10 }),
    text("warehouse", "Warehouse", { sortKey: "warehouse", width: 20 }),
    moneyCol("storeChargeCost", "Store charge", "overheads"),
    moneyCol("holdingCost", "Holding cost", "overheads", { sortKey: "holding" }),
    moneyCol("overheadCost", "Total", "overheads", { sortKey: "total" }),
    moneyCol("averageStockValue", "Average stock value", "overheads", { width: 18 }),
    percentCol("holdingPercent", "Holding % of stock value", "overheads", { decimals: 2, negativeRed: false, width: 14 }),
  ],
  totals: [moneyTotal("storeChargeCost", "Store charge", "overheads"), moneyTotal("holdingCost", "Holding cost", "overheads"), moneyTotal("overheadCost", "Total", "overheads")],
  chart: (f) => (seesOverheads(f) ? HOLDING_CHART : null),
  async query(db, p, req, ctx) {
    const { from, to } = range(p, ctx);
    const scope = uuidArray(ctx.scope);
    const base = sql`
      WITH m AS (${months(from, to)}),
      wh AS (SELECT id, code, name FROM "Warehouse" WHERE id = ANY(${scope})),
      wc AS (
        SELECT "warehouseId" AS wid, month,
               SUM(CASE WHEN category = 'STORE_CHARGE' THEN amount ELSE 0 END) AS store,
               SUM(CASE WHEN category = 'HOLDING' THEN amount ELSE 0 END) AS holding
        FROM "WarehouseCost"
        WHERE "voidedAt" IS NULL AND "warehouseId" = ANY(${scope}) AND month >= ${from}::date AND month <= ${to}::date
        GROUP BY 1, 2
      ),
      base AS (
        SELECT m.month, wh.id AS wid, wh.code, wh.name, COALESCE(wc.store, 0) AS store, COALESCE(wc.holding, 0) AS holding,
               COALESCE(wc.store, 0) + COALESCE(wc.holding, 0) AS total
        FROM m CROSS JOIN wh LEFT JOIN wc ON wc.wid = wh.id AND wc.month = m.month
      )`;
    const sort = orderBy(req.sort, { month: sql`month`, warehouse: sql`code`, holding: sql`holding`, total: sql`total` }, sql`month, code`);
    type Row = { month: Date; wid: string; code: string; name: string; store: D; holding: D; total: D };
    const rows = await db.$queryRaw<Row[]>`${base} SELECT * FROM base ORDER BY ${sort} LIMIT ${req.pageSize} OFFSET ${req.offset}`;
    // The same average stock value as the overhead register's monthly summary.
    const avg = new Map((await averageStockValues(db, from, to, ctx.scope, dhakaDate(ctx.now))).map((a) => [`${a.month}|${a.warehouseId}`, a.averageStockValue]));
    const out: ReportRow[] = rows.map((r) => {
      const month = isoDate(r.month)!;
      const average = avg.get(`${month}|${r.wid}`) ?? "0.00";
      const holding = money(r.holding)!;
      return {
        month: monthLabel(month),
        warehouse: r.name,
        storeChargeCost: money(r.store),
        holdingCost: holding,
        overheadCost: money(r.total),
        averageStockValue: average,
        holdingPercent: holdingPercent(holding, average),
      };
    });
    if (!req.summary) return rowsOnly(out);
    const [s] = await db.$queryRaw<{ n: bigint; store: D | null; holding: D | null; total: D | null }[]>`${base}
      SELECT COUNT(*) AS n, SUM(store) AS store, SUM(holding) AS holding, SUM(total) AS total FROM base`;
    const byMonth = await db.$queryRaw<{ month: Date; total: D }[]>`${base} SELECT month, SUM(total) AS total FROM base GROUP BY month ORDER BY month`;
    return {
      rows: out,
      total: int(s?.n),
      totals: { storeChargeCost: zeroMoney(s?.store), holdingCost: zeroMoney(s?.holding), overheadCost: zeroMoney(s?.total) },
      chart: { ...HOLDING_CHART, points: byMonth.map((b) => ({ label: monthLabel(isoDate(b.month)!), values: [zeroMoney(b.total)] })) },
    };
  },
});

/* ───────────────────────── 17. Overheads: spent vs charged to projects ───────────────────────── */

const SPENT_COLUMNS = [
  ...CATEGORY_COLUMNS.flatMap((c) => [
    moneyCol(`${c.key}Spent`, `${c.label}: spent`, "overheads"),
    moneyCol(`${c.key}Charged`, `${c.label}: charged`, "overheads"),
    moneyCol(`${c.key}Difference`, `${c.label}: difference`, "overheads", { negativeRed: true }),
  ]),
  moneyCol("totalSpent", "Total spent", "overheads"),
  moneyCol("totalCharged", "Total charged", "overheads"),
  moneyCol("totalDifference", "Total difference", "overheads", { negativeRed: true }),
];

export const overheadsSpentVsCharged = defineReport({
  meta: {
    id: "overheads-spent-vs-charged",
    number: 17,
    title: "Overheads: spent vs charged to projects",
    group: "Projects",
    description:
      "Per month and overhead (store charge, holding, established cost): what was actually spent (overhead register; store charge and holding for your warehouses, the established cost company-wide), what was charged to projects (project overhead lines; a line with a period is spread evenly over its months, the last month taking the rounding remainder) and the difference (spent − charged). Voided lines excluded. Information only; needs overhead access.",
    landscape: true,
  },
  requires: "overheads",
  params: [P.monthFrom(), P.monthTo()],
  sortFields: ["month"],
  defaultSort: "month",
  columns: () => [text("month", "Month", { sortKey: "month", width: 10 }), ...SPENT_COLUMNS],
  totals: SPENT_COLUMNS.map((c) => moneyTotal(c.key, c.label, "overheads")),
  async query(db, p, req, ctx) {
    const { from, to } = range(p, ctx);
    const pivot = (src: Sql) => sql`
      SELECT month,
             SUM(CASE WHEN category = 'STORE_CHARGE' THEN amount ELSE 0 END) AS store,
             SUM(CASE WHEN category = 'HOLDING' THEN amount ELSE 0 END) AS holding,
             SUM(CASE WHEN category = 'ESTABLISHMENT' THEN amount ELSE 0 END) AS established
      FROM (${src}) x GROUP BY month`;
    const base = sql`
      WITH m AS (${months(from, to)}),
      sp AS (${pivot(overheadSpent(ctx.scope, from, to))}),
      ch AS (${pivot(overheadCharged(from, to))}),
      base AS (
        SELECT m.month,
               COALESCE(sp.store, 0) AS s_store, COALESCE(ch.store, 0) AS c_store,
               COALESCE(sp.holding, 0) AS s_holding, COALESCE(ch.holding, 0) AS c_holding,
               COALESCE(sp.established, 0) AS s_est, COALESCE(ch.established, 0) AS c_est
        FROM m LEFT JOIN sp ON sp.month = m.month LEFT JOIN ch ON ch.month = m.month
      )`;
    type Vals = { s_store: D | null; c_store: D | null; s_holding: D | null; c_holding: D | null; s_est: D | null; c_est: D | null };
    /** Spent, charged and difference (spent − charged) per category and in total. */
    const values = (v: Vals): Record<string, string> => {
      const pairs = { storeCharge: [v.s_store, v.c_store], holding: [v.s_holding, v.c_holding], establishment: [v.s_est, v.c_est] } as const;
      const out: Record<string, string> = {};
      let spent = dec(null);
      let charged = dec(null);
      for (const [k, [s, c]] of Object.entries(pairs)) {
        out[`${k}Spent`] = zeroMoney(s);
        out[`${k}Charged`] = zeroMoney(c);
        out[`${k}Difference`] = zeroMoney(dec(s).minus(dec(c)));
        spent = spent.plus(dec(s));
        charged = charged.plus(dec(c));
      }
      out.totalSpent = zeroMoney(spent);
      out.totalCharged = zeroMoney(charged);
      out.totalDifference = zeroMoney(spent.minus(charged));
      return out;
    };
    const sort = orderBy(req.sort, { month: sql`month` }, sql`month`);
    const rows = await db.$queryRaw<(Vals & { month: Date })[]>`${base} SELECT * FROM base ORDER BY ${sort} LIMIT ${req.pageSize} OFFSET ${req.offset}`;
    const out: ReportRow[] = rows.map((r) => ({ month: monthLabel(isoDate(r.month)!), ...values(r) }));
    if (!req.summary) return rowsOnly(out);
    const [s] = await db.$queryRaw<(Vals & { n: bigint })[]>`${base}
      SELECT COUNT(*) AS n, SUM(s_store) AS s_store, SUM(c_store) AS c_store, SUM(s_holding) AS s_holding, SUM(c_holding) AS c_holding, SUM(s_est) AS s_est, SUM(c_est) AS c_est FROM base`;
    return { rows: out, total: int(s?.n), totals: s ? values(s) : {}, chart: null };
  },
});
