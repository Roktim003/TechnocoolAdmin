import type { Prisma } from "@prisma/client";
import { dhakaDate } from "../../domain/schedule";
import type { ReportRow, TagStyle } from "../../domain/types";
import { countCol, countTotal, date, dateCol, defineReport, ENTRY_STATUS_TAGS, moneyCol, moneyTotal, percentCol, str, tagCol, text, rowsOnly } from "../columns";
import { fixed, int, isoDate, like, money, orderBy, sql, uuidArray, where, zeroMoney } from "../sql";
import { P } from "./common";

type D = Prisma.Decimal;

/** Entry-date range as calendar days (entry dates are DATE columns). */
function dayRange(col: Prisma.Sql, from?: Date, to?: Date) {
  return [from ? sql`${col} >= ${dhakaDate(from)}::date` : null, to ? sql`${col} <= ${dhakaDate(to)}::date` : null];
}

/* ───────────────────────── 11. Sales report ───────────────────────── */

export const salesReport = defineReport({
  meta: {
    id: "sales",
    number: 11,
    title: "Sales report",
    group: "Sales & losses",
    description: "Posted sales in a date range: sales excluding VAT (after discount), VAT, total including VAT, cost of goods at posting and — with profit access — profit and margin %. Reversed sales are excluded.",
    landscape: true,
  },
  params: [P.dateFrom(), P.dateTo(), P.customer, P.warehouse, P.q("Invoice no. or customer")],
  sortFields: ["date", "invoice", "customer", "sales", "profit"],
  defaultSort: "-date",
  columns: () => [
    dateCol("date", "Date", { sortKey: "date" }),
    text("invoiceNo", "Invoice no.", { sortKey: "invoice", link: true, width: 16 }),
    text("customer", "Customer", { sortKey: "customer", width: 28 }),
    text("warehouse", "Warehouse", { width: 10 }),
    countCol("items", "Items"),
    moneyCol("salesExVat", "Sales ex VAT", "none", { sortKey: "sales" }),
    moneyCol("vatAmount", "VAT", "none"),
    moneyCol("salesInclVat", "Incl. VAT", "none"),
    moneyCol("costTotal", "Cost"),
    moneyCol("profit", "Profit", "seeProfit", { sortKey: "profit", negativeRed: true }),
    percentCol("profitPercent", "Margin %", "seeProfit"),
  ],
  totals: [
    countTotal("invoices", "Invoices"),
    moneyTotal("salesExVat", "Sales ex VAT", "none"),
    moneyTotal("vatAmount", "VAT", "none"),
    moneyTotal("salesInclVat", "Sales incl. VAT", "none"),
    moneyTotal("costTotal", "Cost of goods"),
    moneyTotal("profit", "Profit", "seeProfit"),
    { key: "profitPercent", label: "Margin %", type: "number", requires: "seeProfit", decimals: 1, percent: true },
  ],
  chart: () => ({ type: "hbar", title: "Sales by customer (top 10, ex VAT)", valueType: "money", requires: "none" }),
  async query(db, p, req, ctx) {
    const q = str(p, "q");
    const cond = where([
      sql`e.type = 'SALE' AND e.status = 'POSTED'`,
      sql`e."warehouseId" = ANY(${uuidArray(ctx.scope)})`,
      ...dayRange(sql`e."entryDate"`, date(p, "dateFrom"), date(p, "dateTo")),
      str(p, "customerId") ? sql`e."customerId" = ${str(p, "customerId")}::uuid` : null,
      q ? sql`(e.number ILIKE ${like(q)} OR c.name ILIKE ${like(q)})` : null,
    ]);
    const base = sql`
      WITH base AS (
        SELECT e.id, e."entryDate" AS day, e.number, COALESCE(c.name, 'Walk-in customer') AS customer, w.code AS warehouse,
               (SELECT COUNT(*) FROM "StockEntryLine" l WHERE l."entryId" = e.id) AS items,
               e.subtotal - e."discountAmount" AS ex, e."vatAmount" AS vat, e."grandTotal" AS incl, e."costTotal" AS cost,
               e.subtotal - e."discountAmount" - e."costTotal" AS profit
        FROM "StockEntry" e
        JOIN "Warehouse" w ON w.id = e."warehouseId"
        LEFT JOIN "Customer" c ON c.id = e."customerId"
        WHERE ${cond}
      )`;
    const sort = orderBy(req.sort, { date: sql`day`, invoice: sql`number`, customer: sql`customer`, sales: sql`ex`, profit: sql`profit` }, sql`number DESC`);
    type Row = { id: string; day: Date; number: string; customer: string; warehouse: string; items: bigint; ex: D; vat: D; incl: D; cost: D; profit: D };
    const pct = (profit: D | null | undefined, ex: D | null | undefined) => (ex && !ex.isZero() && profit ? fixed(profit.div(ex).times(100), 1) : null);
    const rows = await db.$queryRaw<Row[]>`${base} SELECT * FROM base ORDER BY ${sort} LIMIT ${req.pageSize} OFFSET ${req.offset}`;
    const out: ReportRow[] = rows.map((r) => ({
      date: isoDate(r.day),
      invoiceNo: r.number,
      customer: r.customer,
      warehouse: r.warehouse,
      items: int(r.items),
      salesExVat: money(r.ex),
      vatAmount: money(r.vat),
      salesInclVat: money(r.incl),
      costTotal: money(r.cost),
      profit: money(r.profit),
      profitPercent: pct(r.profit, r.ex),
      _links: { invoiceNo: `/stock/${r.id}` },
    }));
    if (!req.summary) return rowsOnly(out);
    const [s] = await db.$queryRaw<{ n: bigint; ex: D | null; vat: D | null; incl: D | null; cost: D | null; profit: D | null }[]>`${base}
      SELECT COUNT(*) AS n, SUM(ex) AS ex, SUM(vat) AS vat, SUM(incl) AS incl, SUM(cost) AS cost, SUM(profit) AS profit FROM base`;
    const top = await db.$queryRaw<{ customer: string; v: D }[]>`${base} SELECT customer, SUM(ex) AS v FROM base GROUP BY customer ORDER BY v DESC, customer LIMIT 10`;
    return {
      rows: out,
      total: int(s?.n),
      totals: { invoices: int(s?.n), salesExVat: zeroMoney(s?.ex), vatAmount: zeroMoney(s?.vat), salesInclVat: zeroMoney(s?.incl), costTotal: zeroMoney(s?.cost), profit: zeroMoney(s?.profit), profitPercent: pct(s?.profit, s?.ex) },
      chart: { type: "hbar", title: "Sales by customer (top 10, ex VAT)", valueType: "money", requires: "none", points: top.map((t) => ({ label: t.customer, values: [zeroMoney(t.v)] })) },
    };
  },
});

/* ───────────────────────── 12. Damage & loss ───────────────────────── */

const LOSS_TYPE_TAGS: Record<string, TagStyle> = { DAMAGE_WRITE_OFF: { label: "Write-off", kind: "red" }, STOCK_ADJUSTMENT: { label: "Count loss", kind: "yellow" } };
const COUNT_LOSS = "Stock count shortage";

export const damageLoss = defineReport({
  meta: {
    id: "damage-loss",
    number: 12,
    title: "Damage & loss",
    group: "Sales & losses",
    description: "Damage / loss write-offs and the loss lines of stock-count adjustments in a date range, with the value at cost and the status. Pending write-offs are listed too (value as calculated when submitted).",
    landscape: false,
  },
  params: [P.dateFrom(), P.dateTo(), P.warehouse, { key: "status", label: "Status", kind: "select", options: [{ value: "POSTED", label: "Posted" }, { value: "PENDING", label: "Pending" }] }, P.q("Entry no. or reason")],
  sortFields: ["date", "entry", "value"],
  defaultSort: "-date",
  columns: () => [
    dateCol("date", "Date", { sortKey: "date" }),
    text("entryNo", "Entry", { sortKey: "entry", link: true, width: 16 }),
    tagCol("type", "Type", LOSS_TYPE_TAGS, { width: 12 }),
    text("reason", "Reason", { width: 32 }),
    text("warehouse", "Warehouse", { width: 10 }),
    countCol("items", "Items"),
    moneyCol("lossValue", "Value", "seeCost", { sortKey: "value" }),
    tagCol("status", "Status", ENTRY_STATUS_TAGS, { width: 10 }),
  ],
  totals: [countTotal("entries", "Entries"), countTotal("items", "Lines"), moneyTotal("lossValue", "Loss value")],
  chart: (f) => (f.seeCost ? { type: "hbar", title: "Loss by reason", valueType: "money", requires: "seeCost" } : { type: "hbar", title: "Losses by reason (entries)", valueType: "number", requires: "none" }),
  async query(db, p, req, ctx) {
    const q = str(p, "q");
    const status = str(p, "status");
    const base = sql`
      WITH base AS (
        SELECT e.id, e."entryDate" AS day, COALESCE(e.number, e."draftRef") AS number, e.type::text AS type, e.status::text AS status, w.code AS warehouse,
               COALESCE(NULLIF(btrim(e.reason), ''), CASE WHEN e.type = 'STOCK_ADJUSTMENT' THEN ${COUNT_LOSS} ELSE '(no reason)' END) AS reason,
               CASE WHEN e.type = 'STOCK_ADJUSTMENT' THEN ${COUNT_LOSS} ELSE COALESCE(NULLIF(btrim(e.reason), ''), '(no reason)') END AS "group",
               COUNT(l.id) AS items, SUM(l."costAmount") AS value
        FROM "StockEntry" e
        JOIN "StockEntryLine" l ON l."entryId" = e.id
        JOIN "Warehouse" w ON w.id = e."warehouseId"
        WHERE ${where([
          sql`(e.type = 'DAMAGE_WRITE_OFF' OR (e.type = 'STOCK_ADJUSTMENT' AND l."adjustDirection" = 'LOSS'))`,
          status ? sql`e.status = ${status}::"StockEntryStatus"` : sql`e.status IN ('POSTED', 'PENDING')`,
          sql`e."warehouseId" = ANY(${uuidArray(ctx.scope)})`,
          ...dayRange(sql`e."entryDate"`, date(p, "dateFrom"), date(p, "dateTo")),
          q ? sql`(e.number ILIKE ${like(q)} OR e.reason ILIKE ${like(q)})` : null,
        ])}
        GROUP BY e.id, w.code
      )`;
    const sort = orderBy(req.sort, { date: sql`day`, entry: sql`number`, value: sql`value` }, sql`number DESC`);
    type Row = { id: string; day: Date; number: string; type: string; status: string; warehouse: string; reason: string; items: bigint; value: D };
    const rows = await db.$queryRaw<Row[]>`${base} SELECT * FROM base ORDER BY ${sort} LIMIT ${req.pageSize} OFFSET ${req.offset}`;
    const out: ReportRow[] = rows.map((r) => ({
      date: isoDate(r.day),
      entryNo: r.number,
      type: r.type,
      reason: r.reason,
      warehouse: r.warehouse,
      items: int(r.items),
      lossValue: money(r.value),
      status: r.status,
      _links: { entryNo: `/stock/${r.id}` },
    }));
    if (!req.summary) return rowsOnly(out);
    const [s] = await db.$queryRaw<{ n: bigint; items: D | null; value: D | null }[]>`${base} SELECT COUNT(*) AS n, SUM(items) AS items, SUM(value) AS value FROM base`;
    const seeCost = ctx.viewer.flags.seeCost;
    const groups = await db.$queryRaw<{ group: string; v: D }[]>`${base} SELECT "group", ${seeCost ? sql`SUM(value)` : sql`COUNT(*)::numeric`} AS v FROM base GROUP BY "group" ORDER BY v DESC, "group" LIMIT 12`;
    return {
      rows: out,
      total: int(s?.n),
      totals: { entries: int(s?.n), items: int(s?.items), lossValue: zeroMoney(s?.value) },
      chart: {
        type: "hbar",
        title: seeCost ? "Loss by reason" : "Losses by reason (entries)",
        valueType: seeCost ? "money" : "number",
        requires: seeCost ? "seeCost" : "none",
        points: groups.map((g) => ({ label: g.group, values: [seeCost ? zeroMoney(g.v) : int(g.v)] })),
      },
    };
  },
});
