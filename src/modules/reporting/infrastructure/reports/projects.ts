import type { Prisma } from "@prisma/client";
import { PROJECT_STATUS_LABEL, PROJECT_STATUSES } from "@/modules/projects/domain/types";
import { dhakaDate } from "../../domain/schedule";
import type { ReportRow } from "../../domain/types";
import { date, defineReport, moneyCol, moneyTotal, percentCol, PROJECT_STATUS_TAGS, qtyCol, qtyTotal, str, tagCol, text, countTotal, rowsOnly } from "../columns";
import { int, like, money, orderBy, qty, sql, uuidArray, where, zeroMoney, zeroQty, type Sql } from "../sql";
import { P } from "./common";

type D = Prisma.Decimal;

/**
 * Project material straight from the ledger (same rule as the projects module): posted issues and
 * returns, and reversals of them, at the unit cost recorded at posting. Limited to your warehouses.
 */
function materialMovements(scope: string[], from?: Date, to?: Date): Sql {
  return sql`
    SELECT COALESCE(o."projectId", e."projectId") AS "projectId", m."productId", COALESCE(o.type, e.type)::text AS kind,
           m."qtyChange", m."valueChange"
    FROM "StockMovement" m
    JOIN "StockEntry" e ON e.id = m."entryId"
    LEFT JOIN "StockEntry" o ON o.id = e."reversalOfId" AND e.type = 'REVERSAL'
    WHERE COALESCE(o.type, e.type) IN ('ISSUE_TO_PROJECT', 'RETURN_FROM_SITE')
      AND m."warehouseId" = ANY(${uuidArray(scope)})
      ${from ? sql`AND m."postedAt" >= ${from}` : sql``} ${to ? sql`AND m."postedAt" <= ${to}` : sql``}`;
}

/* ───────────────────────── 9. Project cost summary ───────────────────────── */

export const projectCostSummary = defineReport({
  meta: {
    id: "project-cost-summary",
    number: 9,
    title: "Project cost summary",
    group: "Projects",
    description: "Per project: net material (issued − returned, at ledger cost), labour, transport and other costs (voided costs excluded), total cost, and — with contract & margin access — contract value, margin and margin %. A date range limits the costs to that period.",
    landscape: true,
  },
  params: [{ key: "status", label: "Status", kind: "select", options: PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABEL[s] })) }, { ...P.dateFrom(), default: undefined }, { ...P.dateTo(), default: undefined }, P.q("Project code, name or client")],
  sortFields: ["code", "name", "total", "margin"],
  defaultSort: "code",
  columns: () => [
    text("code", "Code", { sortKey: "code", link: true, width: 10 }),
    text("name", "Project", { sortKey: "name", width: 30 }),
    text("client", "Client", { width: 24 }),
    tagCol("status", "Status", PROJECT_STATUS_TAGS, { width: 12 }),
    moneyCol("materialCost", "Material"),
    moneyCol("labourCost", "Labour"),
    moneyCol("transportCost", "Transport"),
    moneyCol("otherCost", "Other"),
    moneyCol("totalCost", "Total cost", "seeCost", { sortKey: "total" }),
    moneyCol("contractValue", "Contract value", "seeMargin"),
    moneyCol("margin", "Margin", "seeMargin", { sortKey: "margin", negativeRed: true }),
    percentCol("marginPercent", "Margin %", "seeMargin", { decimals: 2 }),
  ],
  totals: [
    countTotal("projects", "Projects"),
    moneyTotal("materialCost", "Material"),
    moneyTotal("labourCost", "Labour"),
    moneyTotal("transportCost", "Transport"),
    moneyTotal("otherCost", "Other"),
    moneyTotal("totalCost", "Total cost"),
    moneyTotal("contractValue", "Contract value", "seeMargin"),
    moneyTotal("margin", "Margin", "seeMargin"),
  ],
  chart: (f) => (f.seeCost ? { type: "hbar", title: "Total cost by project", valueType: "money", requires: "seeCost" } : null),
  async query(db, p, req, ctx) {
    const from = date(p, "dateFrom");
    const to = date(p, "dateTo");
    const status = str(p, "status");
    const q = str(p, "q");
    const base = sql`
      WITH mat AS (
        SELECT "projectId", -SUM("valueChange") AS cost FROM (${materialMovements(ctx.scope, from, to)}) x GROUP BY 1
      ), oc AS (
        SELECT "projectId",
               SUM(CASE WHEN category = 'LABOUR' THEN amount ELSE 0 END) AS labour,
               SUM(CASE WHEN category = 'TRANSPORT' THEN amount ELSE 0 END) AS transport,
               SUM(CASE WHEN category = 'OTHER' THEN amount ELSE 0 END) AS other
        FROM "ProjectCost" WHERE "voidedAt" IS NULL
          ${from ? sql`AND date >= ${dhakaDate(from)}::date` : sql``} ${to ? sql`AND date <= ${dhakaDate(to)}::date` : sql``}
        GROUP BY 1
      ), base AS (
        SELECT pr.id, pr.code, pr.name, pr."clientName" AS client, pr.status::text AS status, pr."contractValue" AS contract,
               COALESCE(mat.cost, 0) AS material, COALESCE(oc.labour, 0) AS labour, COALESCE(oc.transport, 0) AS transport, COALESCE(oc.other, 0) AS other,
               COALESCE(mat.cost, 0) + COALESCE(oc.labour, 0) + COALESCE(oc.transport, 0) + COALESCE(oc.other, 0) AS total
        FROM "Project" pr LEFT JOIN mat ON mat."projectId" = pr.id LEFT JOIN oc ON oc."projectId" = pr.id
        WHERE ${where([status ? sql`pr.status = ${status}::"ProjectStatus"` : null, q ? sql`(pr.code ILIKE ${like(q)} OR pr.name ILIKE ${like(q)} OR pr."clientName" ILIKE ${like(q)})` : null])}
      ), calc AS (
        SELECT base.*, CASE WHEN contract IS NULL THEN NULL ELSE contract - total END AS margin,
               CASE WHEN contract IS NULL OR contract = 0 THEN NULL ELSE ROUND((contract - total) / contract * 100, 2) END AS pct
        FROM base
      )`;
    const sort = orderBy(req.sort, { code: sql`code`, name: sql`name`, total: sql`total`, margin: sql`margin` }, sql`code`);
    type Row = { id: string; code: string; name: string; client: string | null; status: string; contract: D | null; material: D; labour: D; transport: D; other: D; total: D; margin: D | null; pct: D | null };
    const rows = await db.$queryRaw<Row[]>`${base} SELECT * FROM calc ORDER BY ${sort} LIMIT ${req.pageSize} OFFSET ${req.offset}`;
    const out: ReportRow[] = rows.map((r) => ({
      code: r.code,
      name: r.name,
      client: r.client ?? "—",
      status: r.status,
      materialCost: money(r.material),
      labourCost: money(r.labour),
      transportCost: money(r.transport),
      otherCost: money(r.other),
      totalCost: money(r.total),
      contractValue: money(r.contract),
      margin: money(r.margin),
      marginPercent: r.pct === null ? null : r.pct.toFixed(2),
      _links: { code: `/projects/${r.id}` },
    }));
    if (!req.summary) return rowsOnly(out);
    const [s] = await db.$queryRaw<{ n: bigint; material: D | null; labour: D | null; transport: D | null; other: D | null; total: D | null; contract: D | null; margin: D | null }[]>`${base}
      SELECT COUNT(*) AS n, SUM(material) AS material, SUM(labour) AS labour, SUM(transport) AS transport, SUM(other) AS other, SUM(total) AS total,
             SUM(contract) AS contract, SUM(margin) AS margin FROM calc`;
    const top = await db.$queryRaw<{ code: string; name: string; total: D }[]>`${base} SELECT code, name, total FROM calc WHERE total <> 0 ORDER BY total DESC LIMIT 15`;
    return {
      rows: out,
      total: int(s?.n),
      totals: {
        projects: int(s?.n),
        materialCost: zeroMoney(s?.material),
        labourCost: zeroMoney(s?.labour),
        transportCost: zeroMoney(s?.transport),
        otherCost: zeroMoney(s?.other),
        totalCost: zeroMoney(s?.total),
        contractValue: zeroMoney(s?.contract),
        margin: zeroMoney(s?.margin),
      },
      chart: { type: "hbar", title: "Total cost by project", valueType: "money", requires: "seeCost", points: top.map((t) => ({ label: `${t.code} ${t.name}`, values: [zeroMoney(t.total)] })) },
    };
  },
});

/* ───────────────────────── 10. Material by project ───────────────────────── */

export const materialByProject = defineReport({
  meta: { id: "material-by-project", number: 10, title: "Material by project", group: "Projects", description: "Project × product: quantity issued, returned (good and damaged), net, and net cost at ledger cost. Reversed entries net out.", landscape: true },
  params: [P.project, P.brand, P.category, { ...P.dateFrom(), default: undefined }, { ...P.dateTo(), default: undefined }, P.q("Product code or name")],
  sortFields: ["project", "product", "net", "cost"],
  defaultSort: "project,product",
  columns: () => [
    text("projectCode", "Project", { sortKey: "project", link: true, width: 10 }),
    text("projectName", "Project name", { width: 26 }),
    text("productCode", "Product code", { sortKey: "product", width: 18 }),
    text("productName", "Product", { width: 28 }),
    text("unit", "Unit", { width: 8 }),
    qtyCol("issued", "Issued"),
    qtyCol("returned", "Returned"),
    qtyCol("net", "Net", { sortKey: "net" }),
    moneyCol("netCost", "Net cost", "seeCost", { sortKey: "cost" }),
  ],
  totals: [qtyTotal("issued", "Issued qty"), qtyTotal("returned", "Returned qty"), qtyTotal("net", "Net qty"), moneyTotal("netCost", "Net cost")],
  async query(db, p, req, ctx) {
    const q = str(p, "q");
    const base = sql`
      WITH mv AS (${materialMovements(ctx.scope, date(p, "dateFrom"), date(p, "dateTo"))}),
      base AS (
        SELECT pr.id AS "projectId", pr.code AS pcode, pr.name AS pname, p.id AS "productId", p.code, p.name, u.code AS unit,
               SUM(CASE WHEN mv.kind = 'ISSUE_TO_PROJECT' THEN -mv."qtyChange" ELSE 0 END) AS issued,
               SUM(CASE WHEN mv.kind = 'RETURN_FROM_SITE' THEN mv."qtyChange" ELSE 0 END) AS returned,
               -SUM(mv."qtyChange") AS net, -SUM(mv."valueChange") AS cost
        FROM mv
        JOIN "Project" pr ON pr.id = mv."projectId"
        JOIN "Product" p ON p.id = mv."productId"
        JOIN "Unit" u ON u.id = p."unitId"
        WHERE ${where([
          str(p, "projectId") ? sql`pr.id = ${str(p, "projectId")}::uuid` : null,
          str(p, "catalogId") ? sql`p."catalogId" = ${str(p, "catalogId")}::uuid` : null,
          str(p, "categoryId") ? sql`p."categoryId" = ${str(p, "categoryId")}::uuid` : null,
          q ? sql`(p.code ILIKE ${like(q)} OR p.name ILIKE ${like(q)})` : null,
        ])}
        GROUP BY pr.id, pr.code, pr.name, p.id, p.code, p.name, u.code
        HAVING SUM(mv."qtyChange") <> 0 OR SUM(CASE WHEN mv.kind = 'ISSUE_TO_PROJECT' THEN -mv."qtyChange" ELSE 0 END) <> 0
      )`;
    const sort = orderBy(req.sort, { project: sql`pcode`, product: sql`code`, net: sql`net`, cost: sql`cost` }, sql`pcode, code`);
    type Row = { projectId: string; pcode: string; pname: string; code: string; name: string; unit: string; issued: D; returned: D; net: D; cost: D };
    const rows = await db.$queryRaw<Row[]>`${base} SELECT * FROM base ORDER BY ${sort} LIMIT ${req.pageSize} OFFSET ${req.offset}`;
    const out: ReportRow[] = rows.map((r) => ({
      projectCode: r.pcode,
      projectName: r.pname,
      productCode: r.code,
      productName: r.name,
      unit: r.unit,
      issued: qty(r.issued),
      returned: qty(r.returned),
      net: qty(r.net),
      netCost: money(r.cost),
      _links: { projectCode: `/projects/${r.projectId}` },
    }));
    if (!req.summary) return rowsOnly(out);
    const [s] = await db.$queryRaw<{ n: bigint; issued: D | null; returned: D | null; net: D | null; cost: D | null }[]>`${base}
      SELECT COUNT(*) AS n, SUM(issued) AS issued, SUM(returned) AS returned, SUM(net) AS net, SUM(cost) AS cost FROM base`;
    return { rows: out, total: int(s?.n), totals: { issued: zeroQty(s?.issued), returned: zeroQty(s?.returned), net: zeroQty(s?.net), netCost: zeroMoney(s?.cost) }, chart: null };
  },
});
