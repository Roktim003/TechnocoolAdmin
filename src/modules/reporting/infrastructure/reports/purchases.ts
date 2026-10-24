import type { Prisma } from "@prisma/client";
import { PRICED } from "@/modules/purchasing/domain/types";
import { dhakaDate } from "../../domain/schedule";
import type { ReportRow, TagStyle } from "../../domain/types";
import { bool, countCol, countTotal, date, dateCol, defineReport, moneyCol, moneyTotal, OVERDUE_TAGS, percentCol, PO_STATUS_TAGS, qtyCol, qtyTotal, str, tagCol, text, rowsOnly } from "../columns";
import { fixed, int, isoDate, like, money, orderBy, qty, sql, uuidArray, where, zeroMoney, zeroQty } from "../sql";
import { P } from "./common";

type D = Prisma.Decimal;
const OPEN_STATUSES = ["APPROVED", "SENT", "PARTLY_RECEIVED"];
const SUPPLIER_TYPE_TAGS: Record<string, TagStyle> = { LOCAL: { label: "Local", kind: "blue" }, FOREIGN: { label: "Foreign", kind: "purple" } };
const SOURCE_TAGS: Record<string, TagStyle> = { PO: { label: "PO", kind: "blue" }, GRN: { label: "GRN (landed)", kind: "green" } };

/* ───────────────────────── 6. Open POs & pending deliveries ───────────────────────── */

export const openPos = defineReport({
  meta: { id: "open-pos", number: 6, title: "Open POs & pending deliveries", group: "Purchases", description: "Every line of an approved, sent or partly received purchase order that still has quantity to come, with what's received, waiting for verification, and still due.", landscape: true },
  params: [P.supplier, P.warehouse, { key: "overdueOnly", label: "Overdue only", kind: "boolean" }, P.q("PO number, product code or name")],
  sortFields: ["po", "supplier", "expected", "remaining"],
  defaultSort: "expected",
  columns: () => [
    text("poNumber", "PO", { sortKey: "po", link: true, width: 16 }),
    text("supplier", "Supplier", { sortKey: "supplier", width: 26 }),
    text("productCode", "Product code", { width: 18 }),
    text("productName", "Product", { width: 28 }),
    qtyCol("ordered", "Ordered"),
    qtyCol("received", "Received"),
    qtyCol("pendingReceipt", "Pending receipt"),
    qtyCol("remaining", "Remaining", { sortKey: "remaining" }),
    dateCol("expected", "Expected", { sortKey: "expected" }),
    tagCol("overdue", "Delivery", OVERDUE_TAGS, { width: 10 }),
    tagCol("status", "PO status", PO_STATUS_TAGS),
  ],
  totals: [countTotal("lines", "Open lines"), qtyTotal("remaining", "Quantity still due"), countTotal("overdueLines", "Overdue lines")],
  async query(db, p, req, ctx) {
    const today = dhakaDate(ctx.now);
    const q = str(p, "q");
    const cond = where([
      sql`po.status::text = ANY(${OPEN_STATUSES})`,
      sql`l.qty - l."receivedQty" > 0`,
      sql`po."deliverToWarehouseId" = ANY(${uuidArray(ctx.scope)})`,
      str(p, "supplierId") ? sql`po."supplierId" = ${str(p, "supplierId")}::uuid` : null,
      bool(p, "overdueOnly") ? sql`po."expectedDeliveryDate" < ${today}::date` : null,
      q ? sql`(po.number ILIKE ${like(q)} OR p.code ILIKE ${like(q)} OR p.name ILIKE ${like(q)})` : null,
    ]);
    const fromSql = sql`
      FROM "PurchaseOrderLine" l
      JOIN "PurchaseOrder" po ON po.id = l."poId"
      JOIN "Supplier" s ON s.id = po."supplierId"
      JOIN "Product" p ON p.id = l."productId"
      WHERE ${cond}`;
    const sort = orderBy(req.sort, { po: sql`po.number`, supplier: sql`s.name`, expected: sql`po."expectedDeliveryDate"`, remaining: sql`(l.qty - l."receivedQty" - l."pendingReceiptQty")` }, sql`po.number, l."lineNo"`);
    type Row = { poId: string; number: string | null; supplier: string; code: string; name: string; qty: D; received: D; pending: D; expected: Date | null; status: string };
    const rows = await db.$queryRaw<Row[]>`
      SELECT po.id AS "poId", po.number, s.name AS supplier, p.code, p.name, l.qty, l."receivedQty" AS received, l."pendingReceiptQty" AS pending,
             po."expectedDeliveryDate" AS expected, po.status::text AS status
      ${fromSql} ORDER BY ${sort} LIMIT ${req.pageSize} OFFSET ${req.offset}`;
    const out: ReportRow[] = rows.map((r) => {
      const exp = isoDate(r.expected);
      return {
        poNumber: r.number ?? "—",
        supplier: r.supplier,
        productCode: r.code,
        productName: r.name,
        ordered: qty(r.qty),
        received: qty(r.received),
        pendingReceipt: qty(r.pending),
        remaining: qty(r.qty.minus(r.received).minus(r.pending)),
        expected: exp,
        overdue: !exp ? "NO_DATE" : exp < today ? "OVERDUE" : "ON_TIME",
        status: r.status,
        _links: { poNumber: `/purchases/${r.poId}` },
      };
    });
    if (!req.summary) return rowsOnly(out);
    const [s] = await db.$queryRaw<{ n: bigint; rem: D | null; late: bigint }[]>`
      SELECT COUNT(*) AS n, SUM(l.qty - l."receivedQty" - l."pendingReceiptQty") AS rem,
             COUNT(*) FILTER (WHERE po."expectedDeliveryDate" < ${today}::date) AS late ${fromSql}`;
    return { rows: out, total: int(s?.n), totals: { lines: int(s?.n), remaining: zeroQty(s?.rem), overdueLines: int(s?.late) }, chart: null };
  },
});

/* ───────────────────────── 7. Purchases by supplier ───────────────────────── */

export const purchasesBySupplier = defineReport({
  meta: {
    id: "purchases-by-supplier",
    number: 7,
    title: "Purchases by supplier",
    group: "Purchases",
    description: "Per supplier in a date range: approved POs (by PO date) and their value in BDT, and posted GRNs (by entry date) at landed cost, split into imported and local.",
    landscape: true,
  },
  params: [P.dateFrom(), P.dateTo(), P.supplier, P.warehouse],
  sortFields: ["supplier", "poCount", "ordered", "received"],
  defaultSort: "-received",
  columns: () => [
    text("supplierCode", "Code", { width: 10 }),
    text("supplier", "Supplier", { sortKey: "supplier", link: true, width: 30 }),
    tagCol("type", "Type", SUPPLIER_TYPE_TAGS, { width: 10 }),
    countCol("poCount", "POs", { sortKey: "poCount" }),
    moneyCol("orderedValueBdt", "Ordered value (BDT)", "seeCost", { sortKey: "ordered" }),
    countCol("grnCount", "GRNs"),
    moneyCol("importedValueBdt", "Received — imported"),
    moneyCol("localValueBdt", "Received — local"),
    moneyCol("receivedValueBdt", "Received at landed cost", "seeCost", { sortKey: "received" }),
  ],
  totals: [countTotal("poCount", "Approved POs"), moneyTotal("orderedValueBdt", "Ordered value"), moneyTotal("importedValueBdt", "Imported"), moneyTotal("localValueBdt", "Local"), moneyTotal("receivedValueBdt", "Total received")],
  chart: (f) => (f.seeCost ? { type: "hbar", title: "Received value by supplier", valueType: "money", requires: "seeCost" } : { type: "hbar", title: "Approved POs by supplier", valueType: "number", requires: "none" }),
  async query(db, p, req, ctx) {
    const from = date(p, "dateFrom");
    const to = date(p, "dateTo");
    const scope = uuidArray(ctx.scope);
    // PO dates and entry dates are calendar dates: compare them with the Dhaka days of the bounds.
    const fromDay = from ? dhakaDate(from) : null;
    const toDay = to ? dhakaDate(to) : null;
    const supplier = str(p, "supplierId");
    const base = sql`
      WITH po AS (
        SELECT "supplierId", COUNT(*) AS n, SUM("totalBdt") AS ordered FROM "PurchaseOrder"
        WHERE status::text = ANY(${PRICED}) AND "deliverToWarehouseId" = ANY(${scope})
          ${fromDay ? sql`AND "poDate" >= ${fromDay}::date` : sql``} ${toDay ? sql`AND "poDate" <= ${toDay}::date` : sql``}
        GROUP BY 1
      ), grn AS (
        SELECT "supplierId", COUNT(*) AS n,
               SUM(CASE WHEN type = 'GRN_IMPORT' THEN "costTotal" ELSE 0 END) AS imported,
               SUM(CASE WHEN type = 'GRN_LOCAL' THEN "costTotal" ELSE 0 END) AS local
        FROM "StockEntry"
        WHERE type IN ('GRN_IMPORT', 'GRN_LOCAL') AND status = 'POSTED' AND "supplierId" IS NOT NULL AND "warehouseId" = ANY(${scope})
          ${fromDay ? sql`AND "entryDate" >= ${fromDay}::date` : sql``} ${toDay ? sql`AND "entryDate" <= ${toDay}::date` : sql``}
        GROUP BY 1
      ), base AS (
        SELECT s.id, s.code, s.name, s.type::text AS type, COALESCE(po.n, 0) AS "poCount", COALESCE(po.ordered, 0) AS ordered,
               COALESCE(grn.n, 0) AS "grnCount", COALESCE(grn.imported, 0) AS imported, COALESCE(grn.local, 0) AS local,
               COALESCE(grn.imported, 0) + COALESCE(grn.local, 0) AS received
        FROM "Supplier" s LEFT JOIN po ON po."supplierId" = s.id LEFT JOIN grn ON grn."supplierId" = s.id
        WHERE (po.n IS NOT NULL OR grn.n IS NOT NULL) ${supplier ? sql`AND s.id = ${supplier}::uuid` : sql``}
      )`;
    const sort = orderBy(req.sort, { supplier: sql`name`, poCount: sql`"poCount"`, ordered: sql`ordered`, received: sql`received` }, sql`name`);
    type Row = { id: string; code: string; name: string; type: string; poCount: bigint; ordered: D; grnCount: bigint; imported: D; local: D; received: D };
    const rows = await db.$queryRaw<Row[]>`${base} SELECT * FROM base ORDER BY ${sort} LIMIT ${req.pageSize} OFFSET ${req.offset}`;
    const out: ReportRow[] = rows.map((r) => ({
      supplierCode: r.code,
      supplier: r.name,
      type: r.type,
      poCount: int(r.poCount),
      orderedValueBdt: money(r.ordered),
      grnCount: int(r.grnCount),
      importedValueBdt: money(r.imported),
      localValueBdt: money(r.local),
      receivedValueBdt: money(r.received),
      _links: { supplier: `/purchases/suppliers/${r.id}` },
    }));
    if (!req.summary) return rowsOnly(out);
    const [s] = await db.$queryRaw<{ n: bigint; pos: D | null; ordered: D | null; imported: D | null; local: D | null; received: D | null }[]>`${base}
      SELECT COUNT(*) AS n, SUM("poCount") AS pos, SUM(ordered) AS ordered, SUM(imported) AS imported, SUM(local) AS local, SUM(received) AS received FROM base`;
    const seeCost = ctx.viewer.flags.seeCost;
    const top = await db.$queryRaw<{ name: string; v: D }[]>`${base} SELECT name, ${seeCost ? sql`received` : sql`"poCount"::numeric`} AS v FROM base ORDER BY v DESC, name LIMIT 10`;
    return {
      rows: out,
      total: int(s?.n),
      totals: { poCount: int(s?.pos), orderedValueBdt: zeroMoney(s?.ordered), importedValueBdt: zeroMoney(s?.imported), localValueBdt: zeroMoney(s?.local), receivedValueBdt: zeroMoney(s?.received) },
      chart: {
        type: "hbar",
        title: seeCost ? "Received value by supplier" : "Approved POs by supplier",
        valueType: seeCost ? "money" : "number",
        requires: seeCost ? "seeCost" : "none",
        points: top.filter((t) => !t.v.isZero()).map((t) => ({ label: t.name, values: [seeCost ? zeroMoney(t.v) : int(t.v)] })),
      },
    };
  },
});

/* ───────────────────────── 8. Price history ───────────────────────── */

export const priceHistory = defineReport({
  meta: {
    id: "price-history",
    number: 8,
    title: "Price history",
    group: "Purchases",
    description: "Purchase prices per product over time: unit prices on approved POs (in the PO currency and BDT at the PO rate) and landed unit costs on posted GRNs, with the change against the previous price.",
    landscape: true,
  },
  params: [P.product, P.supplier, P.brand, P.dateFrom("-90d"), P.dateTo(), P.q("Product code or name")],
  sortFields: ["product", "date", "supplier"],
  defaultSort: "product,-date",
  columns: () => [
    text("productCode", "Product code", { sortKey: "product", width: 18 }),
    text("productName", "Product", { width: 28 }),
    dateCol("date", "Date", { sortKey: "date" }),
    tagCol("source", "Source", SOURCE_TAGS, { width: 12 }),
    text("document", "Document", { link: true, width: 16 }),
    text("supplier", "Supplier", { sortKey: "supplier", width: 26 }),
    text("currency", "Currency", { width: 8 }),
    moneyCol("unitPriceForeign", "Unit price", "seeCost", { width: 14 }),
    moneyCol("unitPriceBdt", "Unit price (BDT)"),
    percentCol("priceChangePercent", "Change vs previous", "seeCost"),
  ],
  totals: [countTotal("prices", "Price points")],
  chart: (f) => (f.seeCost ? { type: "line", title: "BDT unit price over time", valueType: "money", requires: "seeCost", series: ["BDT unit price"] } : null),
  async query(db, p, req, ctx) {
    const from = date(p, "dateFrom");
    const to = date(p, "dateTo");
    const fromDay = from ? dhakaDate(from) : null;
    const toDay = to ? dhakaDate(to) : null;
    const scope = uuidArray(ctx.scope);
    const q = str(p, "q");
    const productId = str(p, "productId");
    const base = sql`
      WITH pts AS (
        SELECT 'PO' AS source, po."poDate" AS day, po.number AS doc, po.id AS "docId", l."productId", po."supplierId", po.currency::text AS currency,
               l."unitPrice" AS price, ROUND(l."unitPrice" * po."exchangeRate", 4) AS bdt, l.id AS lid
        FROM "PurchaseOrderLine" l JOIN "PurchaseOrder" po ON po.id = l."poId"
        WHERE po.status::text = ANY(${PRICED}) AND po."deliverToWarehouseId" = ANY(${scope})
        UNION ALL
        SELECT 'GRN', e."entryDate", e.number, e.id, l."productId", e."supplierId", e.currency::text,
               l."unitPrice", COALESCE(l."landedUnitCost", l."unitCostBdt"), l.id
        FROM "StockEntryLine" l JOIN "StockEntry" e ON e.id = l."entryId"
        WHERE e.type IN ('GRN_IMPORT', 'GRN_LOCAL') AND e.status = 'POSTED' AND e."warehouseId" = ANY(${scope})
      ), hist AS (
        SELECT pts.*, LAG(bdt) OVER (PARTITION BY "productId" ORDER BY day, source DESC, doc, lid) AS prev FROM pts
      ), base AS (
        SELECT h.*, p.code, p.name AS pname, s.name AS supplier,
               CASE WHEN h.prev IS NULL OR h.prev = 0 THEN NULL ELSE ROUND((h.bdt - h.prev) / h.prev * 100, 1) END AS change
        FROM hist h JOIN "Product" p ON p.id = h."productId" LEFT JOIN "Supplier" s ON s.id = h."supplierId"
        WHERE ${where([
          fromDay ? sql`h.day >= ${fromDay}::date` : null,
          toDay ? sql`h.day <= ${toDay}::date` : null,
          productId ? sql`h."productId" = ${productId}::uuid` : null,
          str(p, "supplierId") ? sql`h."supplierId" = ${str(p, "supplierId")}::uuid` : null,
          str(p, "catalogId") ? sql`p."catalogId" = ${str(p, "catalogId")}::uuid` : null,
          q ? sql`(p.code ILIKE ${like(q)} OR p.name ILIKE ${like(q)})` : null,
        ])}
      )`;
    const sort = orderBy(req.sort, { product: sql`code`, date: sql`day`, supplier: sql`supplier` }, sql`day DESC, doc, lid`);
    type Row = { source: string; day: Date; doc: string | null; docId: string; code: string; pname: string; supplier: string | null; currency: string; price: D; bdt: D; change: D | null };
    const rows = await db.$queryRaw<Row[]>`${base} SELECT * FROM base ORDER BY ${sort} LIMIT ${req.pageSize} OFFSET ${req.offset}`;
    const out: ReportRow[] = rows.map((r) => ({
      productCode: r.code,
      productName: r.pname,
      date: isoDate(r.day),
      source: r.source,
      document: r.doc ?? "—",
      supplier: r.supplier ?? "—",
      currency: r.currency,
      unitPriceForeign: fixed(r.price, 2),
      unitPriceBdt: fixed(r.bdt, 2),
      priceChangePercent: r.change === null ? null : fixed(r.change, 1),
      _links: { document: r.source === "PO" ? `/purchases/${r.docId}` : `/stock/${r.docId}` },
    }));
    if (!req.summary) return rowsOnly(out);
    const [s] = await db.$queryRaw<{ n: bigint }[]>`${base} SELECT COUNT(*) AS n FROM base`;
    // A price line only makes sense for one product.
    const line = productId ? await db.$queryRaw<{ day: Date; bdt: D }[]>`${base} SELECT day, bdt FROM base ORDER BY day, source DESC, doc, lid LIMIT 200` : [];
    return {
      rows: out,
      total: int(s?.n),
      totals: { prices: int(s?.n) },
      chart: productId && line.length ? { type: "line", title: "BDT unit price over time", valueType: "money", requires: "seeCost", series: ["BDT unit price"], points: line.map((l) => ({ label: isoDate(l.day)!, values: [fixed(l.bdt, 2)!] })) } : null,
    };
  },
});
