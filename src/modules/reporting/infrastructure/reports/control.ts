import { Prisma } from "@prisma/client";
import { ENTRY_TYPE_META, ENTRY_TYPES } from "@/modules/inventory/domain/types";
import { summarizeChanges } from "../../domain/changes";
import { dhakaDate } from "../../domain/schedule";
import type { ReportRow, TagStyle } from "../../domain/types";
import { hiddenFieldNames } from "../../domain/visibility";
import { countCol, countTotal, date, dateCol, defineReport, moneyCol, moneyTotal, str, tagCol, text, rowsOnly } from "../columns";
import { dhakaDay, int, isoDate, like, money, orderBy, sql, uuidArray, where, zeroMoney } from "../sql";
import { P } from "./common";

type D = Prisma.Decimal;

/* ───────────────────────── 13. Pending verification ───────────────────────── */

const PENDING_KINDS = [
  { value: "entry", label: "Stock entries waiting for verification" },
  { value: "count", label: "Stock counts waiting for approval" },
  { value: "po", label: "Purchase orders waiting for approval" },
  { value: "transfer", label: "Transfers waiting for receipt" },
];

const PENDING_TYPE_TAGS: Record<string, TagStyle> = {
  ...Object.fromEntries(ENTRY_TYPES.map((t) => [t, { label: ENTRY_TYPE_META[t].label, kind: "yellow" as const }])),
  STOCK_COUNT: { label: "Stock count", kind: "purple" },
  PURCHASE_ORDER: { label: "Purchase order", kind: "blue" },
  TRANSFER_RECEIPT: { label: "Transfer to receive", kind: "green" },
};

const PENDING_LINKS: Record<string, (id: string) => string> = {
  entry: (id) => `/stock/${id}`,
  transfer: (id) => `/stock/${id}`,
  count: (id) => `/stock/counts/${id}`,
  po: (id) => `/purchases/${id}`,
};

export const pendingVerification = defineReport({
  meta: {
    id: "pending",
    number: 13,
    title: "Pending verification",
    group: "Control",
    description: "Everything waiting for someone: stock entries pending verification, stock counts submitted for approval, purchase orders awaiting approval and transfers dispatched but not yet received, with how long each has waited.",
    landscape: true,
  },
  params: [{ key: "kind", label: "What", kind: "select", options: PENDING_KINDS }, P.warehouse],
  sortFields: ["waiting", "date", "number"],
  defaultSort: "-waiting",
  columns: () => [
    text("number", "Number", { sortKey: "number", link: true, width: 18 }),
    { ...tagCol("type", "Type", PENDING_TYPE_TAGS), width: 28 },
    dateCol("date", "Date", { sortKey: "date" }),
    text("createdBy", "Created by", { width: 20 }),
    text("warehouse", "Warehouse", { width: 12 }),
    countCol("items", "Items"),
    moneyCol("pendingValue", "Value"),
    countCol("waitingDays", "Waiting (days)", { sortKey: "waiting" }),
  ],
  totals: [countTotal("records", "Waiting"), moneyTotal("pendingValue", "Value")],
  chart: () => ({ type: "bar", title: "Waiting by type", valueType: "number", requires: "none" }),
  async query(db, p, req, ctx) {
    const scope = uuidArray(ctx.scope);
    const kind = str(p, "kind");
    const lines = (table: string, fk: string, id: Prisma.Sql) => sql`(SELECT COUNT(*) FROM ${Prisma.raw(`"${table}"`)} x WHERE x.${Prisma.raw(`"${fk}"`)} = ${id})`;
    const base = sql`
      WITH items AS (
        SELECT 'entry' AS kind, e.id, COALESCE(e.number, e."draftRef") AS number, e.type::text AS type, e."entryDate" AS day, u.name AS "by", w.code AS warehouse,
               ${lines("StockEntryLine", "entryId", sql`e.id`)} AS items, e."costTotal" AS value, COALESCE(e."submittedAt", e."createdAt") AS since
        FROM "StockEntry" e JOIN "User" u ON u.id = e."createdById" JOIN "Warehouse" w ON w.id = e."warehouseId"
        WHERE e.status = 'PENDING' AND e."warehouseId" = ANY(${scope})
        UNION ALL
        SELECT 'count', c.id, c.number, 'STOCK_COUNT', ${dhakaDay(sql`COALESCE(c."submittedAt", c."createdAt")`)}, COALESCE(su.name, u.name), w.code,
               ${lines("StockCountLine", "countId", sql`c.id`)}, NULL::numeric, COALESCE(c."submittedAt", c."createdAt")
        FROM "StockCount" c JOIN "User" u ON u.id = c."createdById" LEFT JOIN "User" su ON su.id = c."submittedById" JOIN "Warehouse" w ON w.id = c."warehouseId"
        WHERE c.status = 'SUBMITTED' AND c."warehouseId" = ANY(${scope})
        UNION ALL
        SELECT 'po', po.id, COALESCE(po.number, po."draftRef"), 'PURCHASE_ORDER', po."poDate", u.name, w.code,
               ${lines("PurchaseOrderLine", "poId", sql`po.id`)}, po."totalBdt", COALESCE(po."submittedAt", po."createdAt")
        FROM "PurchaseOrder" po JOIN "User" u ON u.id = po."createdById" JOIN "Warehouse" w ON w.id = po."deliverToWarehouseId"
        WHERE po.status = 'PENDING_APPROVAL' AND po."deliverToWarehouseId" = ANY(${scope})
        UNION ALL
        SELECT 'transfer', e.id, COALESCE(e.number, e."draftRef"), 'TRANSFER_RECEIPT', e."entryDate", u.name, fw.code || ' → ' || tw.code,
               ${lines("StockEntryLine", "entryId", sql`e.id`)}, e."costTotal", COALESCE(e."dispatchedAt", e."postedAt", e."createdAt")
        FROM "StockEntry" e JOIN "User" u ON u.id = e."createdById" JOIN "Warehouse" fw ON fw.id = e."warehouseId" JOIN "Warehouse" tw ON tw.id = e."toWarehouseId"
        WHERE e.type = 'TRANSFER' AND e.status = 'DISPATCHED' AND (e."toWarehouseId" = ANY(${scope}) OR e."warehouseId" = ANY(${scope}))
      ), base AS (
        SELECT items.*, (${dhakaDate(ctx.now)}::date - ${dhakaDay(sql`since`)}) AS waiting FROM items ${kind ? sql`WHERE kind = ${kind}` : sql``}
      )`;
    const sort = orderBy(req.sort, { waiting: sql`waiting`, date: sql`day`, number: sql`number` }, sql`number`);
    type Row = { kind: string; id: string; number: string; type: string; day: Date; by: string; warehouse: string; items: bigint; value: D | null; waiting: number };
    const rows = await db.$queryRaw<Row[]>`${base} SELECT * FROM base ORDER BY ${sort} LIMIT ${req.pageSize} OFFSET ${req.offset}`;
    const out: ReportRow[] = rows.map((r) => ({
      number: r.number,
      type: r.type,
      date: isoDate(r.day),
      createdBy: r.by,
      warehouse: r.warehouse,
      items: int(r.items),
      pendingValue: money(r.value),
      waitingDays: int(r.waiting),
      _links: { number: PENDING_LINKS[r.kind]!(r.id), _action: PENDING_LINKS[r.kind]!(r.id) },
    }));
    if (!req.summary) return rowsOnly(out);
    const [s] = await db.$queryRaw<{ n: bigint; value: D | null }[]>`${base} SELECT COUNT(*) AS n, SUM(value) AS value FROM base`;
    const byKind = await db.$queryRaw<{ kind: string; n: bigint }[]>`${base} SELECT kind, COUNT(*) AS n FROM base GROUP BY kind`;
    return {
      rows: out,
      total: int(s?.n),
      totals: { records: int(s?.n), pendingValue: zeroMoney(s?.value) },
      chart: {
        type: "bar",
        title: "Waiting by type",
        valueType: "number",
        requires: "none",
        points: PENDING_KINDS.map((k) => ({ label: k.label.replace(/ waiting.*$/, ""), values: [int(byKind.find((b) => b.kind === k.value)?.n)] })),
      },
    };
  },
  rowAction: { kind: "link", label: "Open" },
});

/* ───────────────────────── 14. Audit log ───────────────────────── */

/** How to show / link the record an audit row is about. */
const RECORDS: Record<string, { table: string; label: string; link?: (id: string) => string }> = {
  StockEntry: { table: `SELECT id::text, COALESCE(number, "draftRef") AS label FROM "StockEntry"`, label: "Stock entry", link: (id) => `/stock/${id}` },
  StockCount: { table: `SELECT id::text, number AS label FROM "StockCount"`, label: "Stock count", link: (id) => `/stock/counts/${id}` },
  PurchaseOrder: { table: `SELECT id::text, COALESCE(number, "draftRef") AS label FROM "PurchaseOrder"`, label: "Purchase order", link: (id) => `/purchases/${id}` },
  Project: { table: `SELECT id::text, code AS label FROM "Project"`, label: "Project", link: (id) => `/projects/${id}` },
  Product: { table: `SELECT id::text, code AS label FROM "Product"`, label: "Product", link: (id) => `/catalog/${id}` },
  Supplier: { table: `SELECT id::text, code AS label FROM "Supplier"`, label: "Supplier", link: (id) => `/purchases/suppliers/${id}` },
  Customer: { table: `SELECT id::text, name AS label FROM "Customer"`, label: "Customer" },
  User: { table: `SELECT id::text, username AS label FROM "User"`, label: "User", link: () => `/users` },
  Role: { table: `SELECT id::text, name AS label FROM "Role"`, label: "Role", link: () => `/users?tab=roles` },
  Warehouse: { table: `SELECT id::text, code AS label FROM "Warehouse"`, label: "Warehouse" },
};

export const auditLog = defineReport({
  meta: { id: "audit-log", number: 14, title: "Audit log", group: "Control", description: "Who changed what and when: every audited action with the record it touched and a before → after summary of the key fields (cost, profit and margin fields only if you may see them).", landscape: true },
  params: [{ ...P.dateFrom("-7d") }, P.dateTo(), P.user, { key: "entityType", label: "Record type", kind: "text", placeholder: "e.g. StockEntry, PurchaseOrder, Project" }, { key: "action", label: "Action", kind: "text", placeholder: "e.g. approve, stock_entry.post" }],
  sortFields: ["at", "user", "action"],
  defaultSort: "-at",
  columns: () => [
    dateCol("at", "Date / time", { sortKey: "at", withTime: true, width: 18 }),
    text("user", "User", { sortKey: "user", width: 20 }),
    text("action", "Action", { sortKey: "action", width: 26 }),
    text("recordType", "Record type", { width: 16 }),
    text("record", "Record", { link: true, width: 18 }),
    text("changes", "Changes", { width: 60 }),
  ],
  totals: [countTotal("events", "Events")],
  async query(db, p, req, ctx) {
    const from = date(p, "dateFrom");
    const to = date(p, "dateTo");
    const action = str(p, "action");
    const cond = where([
      from ? sql`a."createdAt" >= ${from}` : null,
      to ? sql`a."createdAt" <= ${to}` : null,
      str(p, "userId") ? sql`a."userId" = ${str(p, "userId")}::uuid` : null,
      str(p, "entityType") ? sql`a."entityType" = ${str(p, "entityType")}` : null,
      action ? sql`a.action ILIKE ${like(action)}` : null,
    ]);
    const fromSql = sql`FROM "AuditLog" a LEFT JOIN "User" u ON u.id = a."userId" WHERE ${cond}`;
    const sort = orderBy(req.sort, { at: sql`a."createdAt"`, user: sql`u.name`, action: sql`a.action` }, sql`a.id`);
    type Row = { id: string; at: Date; user: string | null; action: string; entityType: string; entityId: string | null; before: unknown; after: unknown };
    const rows = await db.$queryRaw<Row[]>`
      SELECT a.id, a."createdAt" AS at, u.name AS "user", a.action, a."entityType", a."entityId", a.before, a.after
      ${fromSql} ORDER BY ${sort} LIMIT ${req.pageSize} OFFSET ${req.offset}`;

    // Record numbers for this page only, one query per record type.
    const labels = new Map<string, string>();
    for (const [type, def] of Object.entries(RECORDS)) {
      const ids = [...new Set(rows.filter((r) => r.entityType === type && r.entityId).map((r) => r.entityId!))];
      if (!ids.length) continue;
      const found = await db.$queryRawUnsafe<{ id: string; label: string }[]>(`SELECT * FROM (${def.table}) t WHERE t.id = ANY($1::text[])`, ids);
      for (const f of found) labels.set(`${type}:${f.id}`, f.label);
    }
    const hidden = hiddenFieldNames(ctx.viewer.flags);
    const out: ReportRow[] = rows.map((r) => {
      const def = RECORDS[r.entityType];
      const label = r.entityId ? (labels.get(`${r.entityType}:${r.entityId}`) ?? (r.entityType === "Report" ? r.entityId : r.entityId.slice(0, 8))) : "—";
      const link = def?.link && r.entityId ? def.link(r.entityId) : undefined;
      return {
        at: r.at.toISOString(),
        user: r.user ?? "System",
        action: r.action,
        recordType: def?.label ?? r.entityType,
        record: label,
        changes: summarizeChanges(r.before, r.after, hidden),
        ...(link ? { _links: { record: link } } : {}),
      };
    });
    if (!req.summary) return rowsOnly(out);
    const [s] = await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n ${fromSql}`;
    return { rows: out, total: int(s?.n), totals: { events: int(s?.n) }, chart: null };
  },
});
