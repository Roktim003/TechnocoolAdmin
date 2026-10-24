import { Prisma } from "@prisma/client";
import type { SensitiveFlags } from "@/shared/rbac/levels";
import type { WarehouseRef } from "../../application/ports";
import type { ReportRow } from "../../domain/types";
import { bool, countTotal, dateCol, defineReport, ENTRY_TYPE_TAGS, moneyCol, moneyTotal, qtyCol, qtyTotal, SERIAL_STATUS_TAGS, str, tagCol, text, date, rowsOnly } from "../columns";
import { dhakaDay, int, isoDate, like, money, orderBy, qty, sql, uuidArray, where, zeroMoney, zeroQty, type Sql } from "../sql";
import { P } from "./common";

type D = Prisma.Decimal;
const whKey = (w: WarehouseRef) => `wh_${w.code.replace(/[^A-Za-z0-9]/g, "_")}`;

/** Product filters shared by the stock reports (brand, category, free text on code / name / model). */
function productConds(p: Record<string, unknown>, alias = sql`p`): (Sql | null)[] {
  const q = typeof p.q === "string" ? p.q : undefined;
  return [
    typeof p.catalogId === "string" ? sql`${alias}."catalogId" = ${p.catalogId}::uuid` : null,
    typeof p.categoryId === "string" ? sql`${alias}."categoryId" = ${p.categoryId}::uuid` : null,
    typeof p.productId === "string" ? sql`${alias}.id = ${p.productId}::uuid` : null,
    q ? sql`(${alias}.code ILIKE ${like(q)} OR ${alias}.name ILIKE ${like(q)} OR ${alias}.model ILIKE ${like(q)})` : null,
  ];
}

/* ───────────────────────── 1. Stock summary ───────────────────────── */

export const stockSummary = defineReport({
  meta: { id: "stock-summary", number: 1, title: "Stock summary", group: "Stock", description: "Quantity on hand per product and warehouse (good stock), damaged, reserved, available, in transit and value at average cost.", landscape: true },
  params: [P.warehouse, P.brand, P.category, P.q("Code, name or model"), { key: "includeZero", label: "Include products with zero stock", kind: "boolean" }],
  sortFields: ["code", "name", "brand", "category", "total", "available", "value"],
  defaultSort: "code",
  columns: (warehouses) => [
    text("code", "Code", { sortKey: "code", link: true, width: 18 }),
    text("name", "Product", { sortKey: "name", width: 32 }),
    text("brand", "Brand", { sortKey: "brand", width: 14 }),
    text("category", "Category", { sortKey: "category", width: 14 }),
    ...warehouses.map((w) => qtyCol(whKey(w), w.name)),
    qtyCol("damaged", "Damaged"),
    qtyCol("reserved", "Reserved"),
    qtyCol("available", "Available", { sortKey: "available", negativeRed: true }),
    qtyCol("inTransit", "In transit"),
    qtyCol("total", "Total", { sortKey: "total" }),
    moneyCol("avgCost", "Avg cost"),
    moneyCol("stockValue", "Value", "seeCost", { sortKey: "value" }),
  ],
  totals: [countTotal("products", "Products"), qtyTotal("total", "Total quantity"), moneyTotal("stockValue", "Stock value")],
  chart: (f: SensitiveFlags) => (f.seeCost ? { type: "bar", title: "Stock value by brand", valueType: "money", requires: "seeCost" } : { type: "bar", title: "Stock quantity by brand", valueType: "number", requires: "none" }),
  async query(db, p, req, ctx) {
    const scope = uuidArray(ctx.scope);
    const base = sql`
      WITH b AS (
        SELECT "productId",
               SUM(CASE WHEN condition = 'GOOD' THEN "qtyOnHand" ELSE 0 END) AS good,
               SUM(CASE WHEN condition = 'DAMAGED' THEN "qtyOnHand" ELSE 0 END) AS damaged,
               SUM(CASE WHEN condition = 'GOOD' THEN "qtyReserved" ELSE 0 END) AS reserved
        FROM "StockBalance" WHERE "warehouseId" = ANY(${scope}) GROUP BY 1
      ), t AS (
        SELECT it."productId", SUM(it.qty) AS qty FROM "StockInTransit" it
        JOIN "StockEntry" e ON e.id = it."transferEntryId"
        WHERE it.qty > 0 AND (e."warehouseId" = ANY(${scope}) OR e."toWarehouseId" = ANY(${scope}))
        GROUP BY 1
      ), base AS (
        SELECT p.id, p.code, p.name, c.name AS brand, cat.name AS category, u.code AS unit,
               COALESCE(b.good, 0) AS good, COALESCE(b.damaged, 0) AS damaged, COALESCE(b.reserved, 0) AS reserved,
               COALESCE(b.good, 0) - COALESCE(b.reserved, 0) AS available,
               COALESCE(t.qty, 0) AS "inTransit",
               COALESCE(b.good, 0) + COALESCE(b.damaged, 0) + COALESCE(t.qty, 0) AS total,
               COALESCE(pc."avgCost", 0) AS "avgCost",
               ROUND((COALESCE(b.good, 0) + COALESCE(b.damaged, 0) + COALESCE(t.qty, 0)) * COALESCE(pc."avgCost", 0), 2) AS value
        FROM "Product" p
        JOIN "Catalog" c ON c.id = p."catalogId"
        JOIN "Category" cat ON cat.id = p."categoryId"
        JOIN "Unit" u ON u.id = p."unitId"
        LEFT JOIN b ON b."productId" = p.id
        LEFT JOIN t ON t."productId" = p.id
        LEFT JOIN "ProductCost" pc ON pc."productId" = p.id
        WHERE ${where(productConds(p))}
      )`;
    const filter = bool(p, "includeZero") ? sql`(total <> 0 OR id IN (SELECT id FROM "Product" WHERE status = 'ACTIVE'))` : sql`total <> 0`;
    const sort = orderBy(req.sort, { code: sql`code`, name: sql`name`, brand: sql`brand`, category: sql`category`, total: sql`total`, available: sql`available`, value: sql`value` }, sql`id`);
    type Row = { id: string; code: string; name: string; brand: string; category: string; unit: string; good: D; damaged: D; reserved: D; available: D; inTransit: D; total: D; avgCost: D; value: D };
    const rows = await db.$queryRaw<Row[]>`${base} SELECT * FROM base WHERE ${filter} ORDER BY ${sort} LIMIT ${req.pageSize} OFFSET ${req.offset}`;

    const per = rows.length
      ? await db.$queryRaw<{ productId: string; warehouseId: string; good: D }[]>`
          SELECT "productId", "warehouseId", "qtyOnHand" AS good FROM "StockBalance"
          WHERE condition = 'GOOD' AND "productId" = ANY(${uuidArray(rows.map((r) => r.id))}) AND "warehouseId" = ANY(${scope})`
      : [];
    const scoped = ctx.warehouses.filter((w) => ctx.scope.includes(w.id));
    const out: ReportRow[] = rows.map((r) => ({
      code: r.code,
      name: r.name,
      brand: r.brand,
      category: r.category,
      ...Object.fromEntries(ctx.warehouses.map((w) => [whKey(w), scoped.includes(w) ? zeroQty(per.find((x) => x.productId === r.id && x.warehouseId === w.id)?.good) : null])),
      damaged: qty(r.damaged),
      reserved: qty(r.reserved),
      available: qty(r.available),
      inTransit: qty(r.inTransit),
      total: qty(r.total),
      avgCost: money(r.avgCost),
      stockValue: money(r.value),
      _id: r.id,
      _links: { code: `/stock/products/${r.id}` },
    }));
    if (!req.summary) return rowsOnly(out);

    const [sum] = await db.$queryRaw<{ n: bigint; total: D | null; value: D | null }[]>`${base} SELECT COUNT(*) AS n, SUM(total) AS total, SUM(value) AS value FROM base WHERE ${filter}`;
    const money_ = ctx.viewer.flags.seeCost;
    const brands = await db.$queryRaw<{ brand: string; v: D }[]>`${base} SELECT brand, ${money_ ? sql`SUM(value)` : sql`SUM(total)`} AS v FROM base WHERE ${filter} GROUP BY brand HAVING ${money_ ? sql`SUM(value)` : sql`SUM(total)`} <> 0 ORDER BY v DESC LIMIT 12`;
    return {
      rows: out,
      total: int(sum?.n),
      totals: { products: int(sum?.n), total: zeroQty(sum?.total), stockValue: zeroMoney(sum?.value) },
      chart: {
        type: "bar",
        title: money_ ? "Stock value by brand" : "Stock quantity by brand",
        valueType: money_ ? "money" : "number",
        requires: money_ ? "seeCost" : "none",
        points: brands.map((b) => ({ label: b.brand, values: [money_ ? zeroMoney(b.v) : zeroQty(b.v)] })),
      },
    };
  },
});

/* ───────────────────────── 2. Stock movement ───────────────────────── */

export const stockMovement = defineReport({
  meta: { id: "stock-movement", number: 2, title: "Stock movement", group: "Stock", description: "Every posted ledger line in a date range: what came in and went out, with the unit cost and value at posting.", landscape: true },
  params: [P.dateFrom(), P.dateTo(), P.warehouse, P.brand, P.category, P.product, { key: "type", label: "Entry type", kind: "select", options: Object.entries(ENTRY_TYPE_TAGS).map(([value, t]) => ({ value, label: t.label })) }],
  sortFields: ["date", "entryNo", "product", "inQty", "outQty"],
  defaultSort: "-date",
  columns: () => [
    dateCol("date", "Date", { sortKey: "date" }),
    text("entryNo", "Entry no.", { sortKey: "entryNo", link: true, width: 16 }),
    { ...tagCol("type", "Type", ENTRY_TYPE_TAGS), width: 26 },
    text("warehouse", "Warehouse", { width: 10 }),
    text("productCode", "Product code", { sortKey: "product", width: 18 }),
    text("productName", "Product", { width: 30 }),
    qtyCol("inQty", "In", { sortKey: "inQty" }),
    qtyCol("outQty", "Out", { sortKey: "outQty" }),
    moneyCol("unitCost", "Unit cost"),
    moneyCol("valueChange", "Value", "seeCost", { negativeRed: true }),
  ],
  totals: [qtyTotal("inQty", "In qty"), qtyTotal("outQty", "Out qty"), qtyTotal("netQty", "Net qty"), moneyTotal("valueChange", "Net value")],
  async query(db, p, req, ctx) {
    const from = date(p, "dateFrom");
    const to = date(p, "dateTo");
    const type = str(p, "type");
    const cond = where([
      sql`m."warehouseId" = ANY(${uuidArray(ctx.scope)})`,
      from ? sql`m."postedAt" >= ${from}` : null,
      to ? sql`m."postedAt" <= ${to}` : null,
      type ? sql`e.type = ${type}::"StockEntryType"` : null,
      ...productConds(p),
    ]);
    const fromSql = sql`
      FROM "StockMovement" m
      JOIN "StockEntry" e ON e.id = m."entryId"
      JOIN "Product" p ON p.id = m."productId"
      JOIN "Warehouse" w ON w.id = m."warehouseId"
      LEFT JOIN "Warehouse" fw ON fw.id = e."warehouseId"
      LEFT JOIN "Warehouse" tw ON tw.id = e."toWarehouseId"
      WHERE ${cond}`;
    const sort = orderBy(req.sort, { date: sql`m.seq`, entryNo: sql`e.number`, product: sql`p.code`, inQty: sql`GREATEST(m."qtyChange", 0)`, outQty: sql`GREATEST(-m."qtyChange", 0)` }, sql`m.seq DESC`);
    type Row = { seq: bigint; day: Date; entryId: string; entryNo: string | null; type: string; wcode: string; fcode: string | null; tcode: string | null; code: string; name: string; qtyChange: D; unitCost: D; valueChange: D };
    const rows = await db.$queryRaw<Row[]>`
      SELECT m.seq, ${dhakaDay(sql`m."postedAt"`)} AS day, e.id AS "entryId", e.number AS "entryNo", e.type::text AS type,
             w.code AS wcode, fw.code AS fcode, tw.code AS tcode, p.code, p.name, m."qtyChange", m."unitCost", m."valueChange"
      ${fromSql} ORDER BY ${sort} LIMIT ${req.pageSize} OFFSET ${req.offset}`;
    const out: ReportRow[] = rows.map((r) => ({
      date: isoDate(r.day),
      entryNo: r.entryNo ?? "—",
      type: r.type,
      warehouse: r.type === "TRANSFER" && r.tcode ? `${r.fcode} → ${r.tcode}` : r.wcode,
      productCode: r.code,
      productName: r.name,
      inQty: r.qtyChange.gt(0) ? qty(r.qtyChange) : "0.000",
      outQty: r.qtyChange.lt(0) ? qty(r.qtyChange.neg()) : "0.000",
      unitCost: money(r.unitCost),
      valueChange: money(r.valueChange),
      _links: { entryNo: `/stock/${r.entryId}` },
    }));
    if (!req.summary) return rowsOnly(out);
    const [s] = await db.$queryRaw<{ n: bigint; i: D | null; o: D | null; v: D | null }[]>`
      SELECT COUNT(*) AS n, SUM(GREATEST(m."qtyChange", 0)) AS i, SUM(GREATEST(-m."qtyChange", 0)) AS o, SUM(m."valueChange") AS v ${fromSql}`;
    const i = s?.i ?? new Prisma.Decimal(0);
    const o = s?.o ?? new Prisma.Decimal(0);
    return { rows: out, total: int(s?.n), totals: { inQty: zeroQty(i), outQty: zeroQty(o), netQty: zeroQty(new Prisma.Decimal(i).minus(o)), valueChange: zeroMoney(s?.v) }, chart: null };
  },
});

/* ───────────────────────── 3. Stock aging (FIFO) ───────────────────────── */

const BUCKETS = [
  { key: "0to30", label: "0–30 days", max: 30 },
  { key: "31to90", label: "31–90 days", max: 90 },
  { key: "91to180", label: "91–180 days", max: 180 },
  { key: "180plus", label: "180+ days", max: null },
] as const;

export const stockAging = defineReport({
  meta: {
    id: "stock-aging",
    number: 3,
    title: "Stock aging",
    group: "Stock",
    description: "Stock on hand aged by receipt date (FIFO: what's left is assumed to be the most recent receipts), per warehouse, in 0–30 / 31–90 / 91–180 / 180+ day buckets. Value at average cost.",
    landscape: true,
  },
  params: [P.warehouse, P.brand, P.category, P.q("Code, name or model"), { key: "asOf", label: "Age as of", kind: "date", default: "today" }],
  sortFields: ["code", "name", "total", "oldest", "age180plus"],
  defaultSort: "code",
  columns: () => [
    text("code", "Code", { sortKey: "code", link: true, width: 18 }),
    text("name", "Product", { sortKey: "name", width: 30 }),
    text("brand", "Brand", { width: 14 }),
    ...BUCKETS.map((b) => qtyCol(`qtyAge${b.key}`, b.label, b.key === "180plus" ? { sortKey: "age180plus" } : {})),
    qtyCol("totalQty", "Total", { sortKey: "total" }),
    dateCol("oldestReceipt", "Oldest receipt", { sortKey: "oldest" }),
    ...BUCKETS.map((b) => moneyCol(`valueAge${b.key}`, `Value ${b.label}`)),
    moneyCol("totalValue", "Total value"),
  ],
  totals: [...BUCKETS.map((b) => qtyTotal(`qtyAge${b.key}`, `Qty ${b.label}`)), ...BUCKETS.map((b) => moneyTotal(`valueAge${b.key}`, `Value ${b.label}`)), moneyTotal("totalValue", "Total value")],
  chart: (f) => ({ type: "donut", title: f.seeCost ? "Stock value by age" : "Stock quantity by age", valueType: f.seeCost ? "money" : "number", requires: f.seeCost ? "seeCost" : "none" }),
  async query(db, p, req, ctx) {
    const asOf = str(p, "asOf") ?? isoDate(new Date(ctx.now.getTime() + 6 * 3600_000))!;
    const scope = uuidArray(ctx.scope);
    // Per product + warehouse: walk receipts newest-first and allocate the on-hand quantity to them.
    const base = sql`
      WITH onhand AS (
        SELECT "productId", "warehouseId", SUM("qtyOnHand") AS qty FROM "StockBalance"
        WHERE "warehouseId" = ANY(${scope}) GROUP BY 1, 2 HAVING SUM("qtyOnHand") > 0
      ), receipts AS (
        SELECT m."productId", m."warehouseId", ${dhakaDay(sql`m."postedAt"`)} AS day, m."qtyChange" AS qty,
               SUM(m."qtyChange") OVER (PARTITION BY m."productId", m."warehouseId" ORDER BY m.seq DESC) AS cum
        FROM "StockMovement" m
        JOIN onhand o ON o."productId" = m."productId" AND o."warehouseId" = m."warehouseId"
        WHERE m."qtyChange" > 0
      ), received AS (
        SELECT "productId", "warehouseId", SUM(qty) AS qty FROM receipts GROUP BY 1, 2
      ), layers AS (
        SELECT r."productId", r.day, LEAST(r.qty, GREATEST(o.qty - (r.cum - r.qty), 0)) AS alloc
        FROM receipts r JOIN onhand o ON o."productId" = r."productId" AND o."warehouseId" = r."warehouseId"
        UNION ALL
        -- on hand not explained by any receipt (should not happen): treated as the oldest stock
        SELECT o."productId", NULL::date, o.qty - COALESCE(rc.qty, 0)
        FROM onhand o LEFT JOIN received rc ON rc."productId" = o."productId" AND rc."warehouseId" = o."warehouseId"
      ), aged AS (
        SELECT "productId", alloc, day, CASE WHEN day IS NULL THEN 100000 ELSE (${asOf}::date - day) END AS age FROM layers WHERE alloc > 0
      ), base AS (
        SELECT p.id, p.code, p.name, c.name AS brand, COALESCE(pc."avgCost", 0) AS avg,
               SUM(CASE WHEN age <= 30 THEN alloc ELSE 0 END) AS b1,
               SUM(CASE WHEN age > 30 AND age <= 90 THEN alloc ELSE 0 END) AS b2,
               SUM(CASE WHEN age > 90 AND age <= 180 THEN alloc ELSE 0 END) AS b3,
               SUM(CASE WHEN age > 180 THEN alloc ELSE 0 END) AS b4,
               SUM(alloc) AS total, MIN(day) AS oldest
        FROM aged a
        JOIN "Product" p ON p.id = a."productId"
        JOIN "Catalog" c ON c.id = p."catalogId"
        LEFT JOIN "ProductCost" pc ON pc."productId" = p.id
        WHERE ${where(productConds(p))}
        GROUP BY p.id, p.code, p.name, c.name, pc."avgCost"
      )`;
    const sort = orderBy(req.sort, { code: sql`code`, name: sql`name`, total: sql`total`, oldest: sql`oldest`, age180plus: sql`b4` }, sql`id`);
    type Row = { id: string; code: string; name: string; brand: string; avg: D; b1: D; b2: D; b3: D; b4: D; total: D; oldest: Date | null };
    const rows = await db.$queryRaw<Row[]>`${base} SELECT * FROM base ORDER BY ${sort} LIMIT ${req.pageSize} OFFSET ${req.offset}`;
    const v = (q: D, avg: D) => money(q.times(avg));
    const out: ReportRow[] = rows.map((r) => {
      const qs = [r.b1, r.b2, r.b3, r.b4];
      return {
        code: r.code,
        name: r.name,
        brand: r.brand,
        ...Object.fromEntries(BUCKETS.map((b, i) => [`qtyAge${b.key}`, qty(qs[i])])),
        totalQty: qty(r.total),
        oldestReceipt: isoDate(r.oldest),
        ...Object.fromEntries(BUCKETS.map((b, i) => [`valueAge${b.key}`, v(qs[i]!, r.avg)])),
        totalValue: v(r.total, r.avg),
        _links: { code: `/stock/products/${r.id}` },
      };
    });
    if (!req.summary) return rowsOnly(out);
    const [s] = await db.$queryRaw<{ n: bigint; b1: D | null; b2: D | null; b3: D | null; b4: D | null; v1: D | null; v2: D | null; v3: D | null; v4: D | null }[]>`${base}
      SELECT COUNT(*) AS n, SUM(b1) AS b1, SUM(b2) AS b2, SUM(b3) AS b3, SUM(b4) AS b4,
             SUM(ROUND(b1 * avg, 2)) AS v1, SUM(ROUND(b2 * avg, 2)) AS v2, SUM(ROUND(b3 * avg, 2)) AS v3, SUM(ROUND(b4 * avg, 2)) AS v4 FROM base`;
    const qtys = [s?.b1, s?.b2, s?.b3, s?.b4];
    const vals = [s?.v1, s?.v2, s?.v3, s?.v4];
    const totalValue = vals.reduce<D>((a, x) => a.plus(x ?? 0), new Prisma.Decimal(0));
    const seeCost = ctx.viewer.flags.seeCost;
    return {
      rows: out,
      total: int(s?.n),
      totals: { ...Object.fromEntries(BUCKETS.map((b, i) => [`qtyAge${b.key}`, zeroQty(qtys[i])])), ...Object.fromEntries(BUCKETS.map((b, i) => [`valueAge${b.key}`, zeroMoney(vals[i])])), totalValue: zeroMoney(totalValue) },
      chart: {
        type: "donut",
        title: seeCost ? "Stock value by age" : "Stock quantity by age",
        valueType: seeCost ? "money" : "number",
        requires: seeCost ? "seeCost" : "none",
        points: BUCKETS.map((b, i) => ({ label: b.label, values: [seeCost ? zeroMoney(vals[i]) : zeroQty(qtys[i])] })),
      },
    };
  },
});

/* ───────────────────────── 4. Low stock ───────────────────────── */

export const lowStock = defineReport({
  meta: { id: "low-stock", number: 4, title: "Low stock", group: "Stock", description: "Active products whose available good stock (on hand − reserved) in your warehouses is below the minimum level, with a suggested order of 2 × minimum − available.", landscape: false },
  params: [P.warehouse, P.brand, P.category, P.q("Code, name or model")],
  sortFields: ["code", "name", "shortBy", "available"],
  defaultSort: "-shortBy",
  columns: () => [
    text("code", "Code", { sortKey: "code", link: true, width: 18 }),
    text("name", "Product", { sortKey: "name", width: 30 }),
    text("brand", "Brand", { width: 14 }),
    text("unit", "Unit", { width: 8 }),
    qtyCol("available", "Available", { sortKey: "available" }),
    qtyCol("minimum", "Minimum"),
    qtyCol("shortBy", "Short by", { sortKey: "shortBy", negativeRed: true }),
    qtyCol("suggestedQty", "Suggested order"),
  ],
  totals: [countTotal("products", "Products below minimum"), qtyTotal("shortBy", "Total short")],
  rowAction: { kind: "createPo", label: "Create PO", requires: ["purchasing", "CREATE"] },
  async query(db, p, req, ctx) {
    const base = sql`
      WITH a AS (
        SELECT "productId", SUM(GREATEST("qtyOnHand" - "qtyReserved", 0)) AS available
        FROM "StockBalance" WHERE condition = 'GOOD' AND "warehouseId" = ANY(${uuidArray(ctx.scope)}) GROUP BY 1
      ), base AS (
        SELECT p.id, p.code, p.name, c.name AS brand, u.code AS unit, COALESCE(a.available, 0) AS available, p."minStockLevel" AS minimum,
               p."minStockLevel" - COALESCE(a.available, 0) AS "shortBy",
               GREATEST(p."minStockLevel" * 2 - COALESCE(a.available, 0), 0) AS suggested
        FROM "Product" p
        JOIN "Catalog" c ON c.id = p."catalogId"
        JOIN "Unit" u ON u.id = p."unitId"
        LEFT JOIN a ON a."productId" = p.id
        WHERE p.status = 'ACTIVE' AND p."minStockLevel" > 0 AND COALESCE(a.available, 0) < p."minStockLevel" AND ${where(productConds(p))}
      )`;
    const sort = orderBy(req.sort, { code: sql`code`, name: sql`name`, shortBy: sql`"shortBy"`, available: sql`available` }, sql`code`);
    type Row = { id: string; code: string; name: string; brand: string; unit: string; available: D; minimum: D; shortBy: D; suggested: D };
    const rows = await db.$queryRaw<Row[]>`${base} SELECT * FROM base ORDER BY ${sort} LIMIT ${req.pageSize} OFFSET ${req.offset}`;
    const out: ReportRow[] = rows.map((r) => ({
      code: r.code,
      name: r.name,
      brand: r.brand,
      unit: r.unit,
      available: qty(r.available),
      minimum: qty(r.minimum),
      shortBy: qty(r.shortBy),
      suggestedQty: qty(r.suggested),
      _id: r.id,
      _links: { code: `/stock/products/${r.id}` },
    }));
    if (!req.summary) return rowsOnly(out);
    const [s] = await db.$queryRaw<{ n: bigint; short: D | null }[]>`${base} SELECT COUNT(*) AS n, SUM("shortBy") AS short FROM base`;
    return { rows: out, total: int(s?.n), totals: { products: int(s?.n), shortBy: zeroQty(s?.short) }, chart: null };
  },
});

/* ───────────────────────── 5. Serial number lookup ───────────────────────── */

export const serialLookup = defineReport({
  meta: { id: "serial-lookup", number: 5, title: "Serial number lookup", group: "Stock", description: "Find a unit by (part of) its serial number: its status, where it is now (warehouse, project, customer, supplier or written off) and the last entry that moved it.", landscape: false },
  params: [P.q("Serial number (part of it is enough)", "Serial"), { key: "status", label: "Status", kind: "select", options: Object.entries(SERIAL_STATUS_TAGS).map(([value, t]) => ({ value, label: t.label })) }, P.warehouse, P.product],
  sortFields: ["serial", "product", "date"],
  defaultSort: "serial",
  columns: () => [
    text("serial", "Serial", { sortKey: "serial", link: true, width: 22 }),
    text("productCode", "Product code", { sortKey: "product", width: 18 }),
    text("productName", "Product", { width: 28 }),
    tagCol("status", "Status", SERIAL_STATUS_TAGS),
    text("location", "Current location", { width: 30 }),
    text("lastEntry", "Last entry", { link: true, width: 16 }),
    dateCol("lastDate", "Date", { sortKey: "date" }),
  ],
  totals: [countTotal("serials", "Serial numbers")],
  rowAction: { kind: "link", label: "Serial history" },
  async query(db, p, req, ctx) {
    const scope = uuidArray(ctx.scope);
    const q = str(p, "q");
    const status = str(p, "status");
    const cond = where([
      // In one of your warehouses now, or last moved out of one of them.
      sql`(s."warehouseId" = ANY(${scope}) OR (s."warehouseId" IS NULL AND (lm."fromWarehouseId" = ANY(${scope}) OR e."warehouseId" = ANY(${scope}))))`,
      q ? sql`s.serial LIKE ${like(q.trim().toUpperCase())}` : null,
      status ? sql`s.status = ${status}::"SerialStatus"` : null,
      str(p, "productId") ? sql`s."productId" = ${str(p, "productId")}::uuid` : null,
    ]);
    const fromSql = sql`
      FROM "SerialNumber" s
      JOIN "Product" p ON p.id = s."productId"
      LEFT JOIN LATERAL (SELECT sm."entryId", sm.at, sm."fromWarehouseId", sm."toWarehouseId" FROM "SerialMovement" sm WHERE sm."serialId" = s.id ORDER BY sm.seq DESC LIMIT 1) lm ON TRUE
      LEFT JOIN "StockEntry" e ON e.id = lm."entryId"
      LEFT JOIN "Warehouse" w ON w.id = s."warehouseId"
      LEFT JOIN "Warehouse" fw ON fw.id = e."warehouseId"
      LEFT JOIN "Warehouse" tw ON tw.id = e."toWarehouseId"
      LEFT JOIN "Project" pr ON pr.id = s."projectId"
      LEFT JOIN "Customer" cu ON cu.id = s."customerId"
      LEFT JOIN "Supplier" su ON su.id = s."supplierId"
      WHERE ${cond}`;
    const sort = orderBy(req.sort, { serial: sql`s.serial`, product: sql`p.code`, date: sql`lm.at` }, sql`s.id`);
    type Row = { id: string; serial: string; code: string; name: string; status: string; wname: string | null; fcode: string | null; tcode: string | null; prcode: string | null; prname: string | null; cuname: string | null; suname: string | null; entryId: string | null; entryNo: string | null; at: Date | null };
    const rows = await db.$queryRaw<Row[]>`
      SELECT s.id, s.serial, p.code, p.name, s.status::text AS status, w.name AS wname, fw.code AS fcode, tw.code AS tcode,
             pr.code AS prcode, pr.name AS prname, cu.name AS cuname, su.name AS suname, e.id AS "entryId", e.number AS "entryNo", lm.at
      ${fromSql} ORDER BY ${sort} LIMIT ${req.pageSize} OFFSET ${req.offset}`;
    const location = (r: Row) => {
      switch (r.status) {
        case "ISSUED":
          return r.prcode ? `Project ${r.prcode} · ${r.prname}` : "At a project site";
        case "SOLD":
          return r.cuname ? `Customer · ${r.cuname}` : "Sold";
        case "RETURNED_TO_SUPPLIER":
          return r.suname ? `Supplier · ${r.suname}` : "Returned to supplier";
        case "WRITTEN_OFF":
          return "Written off";
        case "IN_TRANSIT":
          return r.fcode && r.tcode ? `In transit ${r.fcode} → ${r.tcode}` : "In transit";
        default:
          return r.wname ?? "—";
      }
    };
    const out: ReportRow[] = rows.map((r) => ({
      serial: r.serial,
      productCode: r.code,
      productName: r.name,
      status: r.status,
      location: location(r),
      lastEntry: r.entryNo ?? "—",
      lastDate: r.at ? isoDate(new Date(r.at.getTime() + 6 * 3600_000)) : null,
      _links: { serial: `/serials?q=${encodeURIComponent(r.serial)}`, ...(r.entryId ? { lastEntry: `/stock/${r.entryId}` } : {}), _action: `/serials?q=${encodeURIComponent(r.serial)}` },
    }));
    if (!req.summary) return rowsOnly(out);
    const [s] = await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n ${fromSql}`;
    return { rows: out, total: int(s?.n), totals: { serials: int(s?.n) }, chart: null };
  },
});
