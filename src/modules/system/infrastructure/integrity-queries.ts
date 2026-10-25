import type { PrismaClient } from "@prisma/client";
import type { IntegrityCheckResult } from "../domain/types";

/**
 * The nightly integrity checks. Read-only SQL against any StockBook database (the live one, or
 * a restored copy in the restore test). They report problems; nothing is ever fixed here.
 * Each check returns at most 50 example rows plus the total number of problems.
 */
type Row = Record<string, unknown>;

interface CheckDef {
  key: string;
  label: string;
  /** SELECT returning one row per problem. */
  sql: string;
}

const LIMIT = 50;

/** Amount tolerance for value checks (BDT, rounding of 2-decimal ledger values). */
const VALUE_TOLERANCE = "0.05";

export const INTEGRITY_CHECKS: CheckDef[] = [
  {
    key: "balance_vs_ledger",
    label: "Stock balances match the ledger (on hand = sum of movements per product, warehouse and condition)",
    sql: `
      WITH ledger AS (
        SELECT "productId", "warehouseId", condition, SUM("qtyChange") AS qty FROM "StockMovement" GROUP BY 1, 2, 3
      )
      SELECT p.code AS product, w.code AS warehouse, COALESCE(b.condition, l.condition)::text AS condition,
             COALESCE(b."qtyOnHand", 0)::text AS "balanceQty", COALESCE(l.qty, 0)::text AS "ledgerQty"
      FROM "StockBalance" b
      FULL OUTER JOIN ledger l ON l."productId" = b."productId" AND l."warehouseId" = b."warehouseId" AND l.condition = b.condition
      JOIN "Product" p ON p.id = COALESCE(b."productId", l."productId")
      JOIN "Warehouse" w ON w.id = COALESCE(b."warehouseId", l."warehouseId")
      WHERE COALESCE(b."qtyOnHand", 0) <> COALESCE(l.qty, 0)
      ORDER BY 1, 2, 3`,
  },
  {
    key: "product_cost_vs_ledger",
    label: "Product cost totals match the ledger (quantity and value, including stock in transit)",
    sql: `
      WITH ledger AS (
        SELECT "productId", SUM("qtyChange") AS qty, SUM("valueChange") AS value FROM "StockMovement" GROUP BY 1
      ), transit AS (
        SELECT t."productId", SUM(t.qty) AS qty, SUM(t.value) AS value
        FROM "StockInTransit" t JOIN "StockEntry" e ON e.id = t."transferEntryId" AND e.status = 'DISPATCHED'
        GROUP BY 1
      )
      SELECT p.code AS product,
             COALESCE(c."totalQty", 0)::text AS "costQty", (COALESCE(l.qty, 0) + COALESCE(t.qty, 0))::text AS "ledgerQty",
             COALESCE(c."totalValue", 0)::text AS "costValue", (COALESCE(l.value, 0) + COALESCE(t.value, 0))::text AS "ledgerValue"
      FROM "Product" p
      LEFT JOIN "ProductCost" c ON c."productId" = p.id
      LEFT JOIN ledger l ON l."productId" = p.id
      LEFT JOIN transit t ON t."productId" = p.id
      WHERE COALESCE(c."totalQty", 0) <> COALESCE(l.qty, 0) + COALESCE(t.qty, 0)
         OR ABS(COALESCE(c."totalValue", 0) - (COALESCE(l.value, 0) + COALESCE(t.value, 0))) > ${VALUE_TOLERANCE}
      ORDER BY 1`,
  },
  {
    key: "no_negative_balances",
    label: "No negative balances (on hand, reserved, or reserved above on hand)",
    sql: `
      SELECT p.code AS product, w.code AS warehouse, b.condition::text AS condition, b."qtyOnHand"::text AS "onHand", b."qtyReserved"::text AS reserved
      FROM "StockBalance" b JOIN "Product" p ON p.id = b."productId" JOIN "Warehouse" w ON w.id = b."warehouseId"
      WHERE b."qtyOnHand" < 0 OR b."qtyReserved" < 0 OR b."qtyReserved" > b."qtyOnHand"
      ORDER BY 1, 2, 3`,
  },
  {
    key: "reserved_vs_pending",
    label: "Reserved quantities equal the pending out / transfer lines",
    sql: `
      WITH pending AS (
        SELECT l."productId", e."warehouseId", l.condition, SUM(l.qty) AS qty
        FROM "StockEntryLine" l JOIN "StockEntry" e ON e.id = l."entryId"
        WHERE e.status = 'PENDING' AND e.type IN ('ISSUE_TO_PROJECT', 'SALE', 'RETURN_TO_SUPPLIER', 'DAMAGE_WRITE_OFF', 'TRANSFER')
        GROUP BY 1, 2, 3
      )
      SELECT p.code AS product, w.code AS warehouse, COALESCE(b.condition, x.condition)::text AS condition,
             COALESCE(b."qtyReserved", 0)::text AS reserved, COALESCE(x.qty, 0)::text AS "pendingQty"
      FROM "StockBalance" b
      FULL OUTER JOIN pending x ON x."productId" = b."productId" AND x."warehouseId" = b."warehouseId" AND x.condition = b.condition
      JOIN "Product" p ON p.id = COALESCE(b."productId", x."productId")
      JOIN "Warehouse" w ON w.id = COALESCE(b."warehouseId", x."warehouseId")
      WHERE COALESCE(b."qtyReserved", 0) <> COALESCE(x.qty, 0)
      ORDER BY 1, 2, 3`,
  },
  {
    key: "serial_status",
    label: "Every serial's status matches its latest serial movement",
    sql: `
      WITH latest AS (
        SELECT DISTINCT ON ("serialId") "serialId", "toStatus", "toWarehouseId" FROM "SerialMovement" ORDER BY "serialId", seq DESC
      )
      SELECT p.code AS product, s.serial, s.status::text AS status, COALESCE(l."toStatus"::text, '(no movement)') AS "latestMovement"
      FROM "SerialNumber" s JOIN "Product" p ON p.id = s."productId"
      LEFT JOIN latest l ON l."serialId" = s.id
      WHERE l."serialId" IS NULL OR l."toStatus" <> s.status
      ORDER BY 1, 2`,
  },
  {
    key: "po_received_vs_grn",
    label: "Purchase order received quantities equal the posted GRN lines",
    sql: `
      WITH grn AS (
        SELECT l."purchaseOrderLineId" AS id, SUM(l.qty) AS qty
        FROM "StockEntryLine" l JOIN "StockEntry" e ON e.id = l."entryId"
        WHERE l."purchaseOrderLineId" IS NOT NULL AND e.status = 'POSTED' AND e.type IN ('GRN_IMPORT', 'GRN_LOCAL')
        GROUP BY 1
      )
      SELECT po.number AS po, p.code AS product, pl."receivedQty"::text AS "receivedQty", COALESCE(g.qty, 0)::text AS "grnQty"
      FROM "PurchaseOrderLine" pl
      JOIN "PurchaseOrder" po ON po.id = pl."poId"
      JOIN "Product" p ON p.id = pl."productId"
      LEFT JOIN grn g ON g.id = pl.id
      WHERE pl."receivedQty" <> COALESCE(g.qty, 0)
      ORDER BY 1, 2`,
  },
  {
    key: "unique_document_numbers",
    label: "No duplicate document numbers (stock entries, purchase orders, stock counts)",
    sql: `
      SELECT kind, number, n::int AS count FROM (
        SELECT 'stock entry' AS kind, UPPER(TRIM(number)) AS number, COUNT(*) AS n FROM "StockEntry" WHERE number IS NOT NULL GROUP BY 2
        UNION ALL
        SELECT 'purchase order', UPPER(TRIM(number)), COUNT(*) FROM "PurchaseOrder" WHERE number IS NOT NULL GROUP BY 2
        UNION ALL
        SELECT 'stock count', UPPER(TRIM(number)), COUNT(*) FROM "StockCount" GROUP BY 2
      ) d WHERE n > 1
      ORDER BY 1, 2`,
  },
];

function plain(row: Row): Record<string, string | number | null> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v === null || typeof v === "number" ? v : String(v)]));
}

/** Runs every check in one READ ONLY, repeatable-read transaction (a consistent snapshot). */
export async function runIntegrityChecks(db: PrismaClient): Promise<IntegrityCheckResult[]> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '300s'");
      const results: IntegrityCheckResult[] = [];
      for (const c of INTEGRITY_CHECKS) {
        const [{ n }] = await tx.$queryRawUnsafe<[{ n: bigint }]>(`SELECT COUNT(*) AS n FROM (${c.sql}) q`);
        const problems = Number(n);
        const rows = problems ? await tx.$queryRawUnsafe<Row[]>(`${c.sql} LIMIT ${LIMIT}`) : [];
        results.push({ key: c.key, label: c.label, passed: problems === 0, problems, details: rows.map(plain) });
      }
      return results;
    },
    { isolationLevel: "RepeatableRead", timeout: 600_000, maxWait: 30_000 },
  );
}
