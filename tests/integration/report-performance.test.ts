import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as runRoute from "@/app/api/v1/reports/[id]/run/route";
import { call } from "../helpers/http";
import { resetDatabase } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";
import { grn, prisma, product, wh } from "../helpers/inventory";

/**
 * Stock summary and stock movement on 50,000 ledger movements (200 products × 2 warehouses,
 * spread over a year) must answer in under 2 s. Results are printed and recorded in the README.
 */
const MOVEMENTS = 50_000;
const PRODUCTS = 200;
let token: string;

beforeAll(async () => {
  await resetDatabase();
  token = await adminToken();
  const A = await wh("A");
  const B = await wh("B");
  const products: string[] = [];
  for (let i = 0; i < PRODUCTS; i++) products.push((await product(token)).id);
  const entry = await grn(token, A, [{ productId: products[0]!, qty: 1, unitPrice: 100 }]);

  // Bulk ledger rows (inserts are allowed by the append-only trigger) and matching balances.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "StockMovement" (id, "entryId", "productId", "warehouseId", condition, "qtyChange", "unitCost", "valueChange", "balanceAfter", "avgCostAfter", "postedAt")
     SELECT gen_random_uuid(), $1::uuid, (($2::uuid[])[1 + (g % $3)]), CASE WHEN g % 3 = 0 THEN $5::uuid ELSE $4::uuid END, 'GOOD',
            CASE WHEN (g / 7) % 4 = 0 THEN -1 ELSE 2 END, 100, CASE WHEN (g / 7) % 4 = 0 THEN -100 ELSE 200 END, 0, 100,
            now() - ((g % 365) || ' days')::interval - ((g % 1440) || ' minutes')::interval
     FROM generate_series(1, $6::int) g`,
    entry.id,
    products,
    PRODUCTS,
    A,
    B,
    MOVEMENTS,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "StockBalance" (id, "productId", "warehouseId", condition, "qtyOnHand", "qtyReserved", "updatedAt")
     SELECT gen_random_uuid(), "productId", "warehouseId", 'GOOD', GREATEST(sum("qtyChange"), 0), 0, now() FROM "StockMovement" GROUP BY "productId", "warehouseId"
     ON CONFLICT ("productId", "warehouseId", condition) DO UPDATE SET "qtyOnHand" = EXCLUDED."qtyOnHand"`,
  );
  await prisma.$executeRawUnsafe(`ANALYZE "StockMovement"; `);
  await prisma.$executeRawUnsafe(`ANALYZE "StockBalance"`);
}, 300_000);

afterAll(async () => {
  await prisma.$disconnect();
});

async function timed(id: string, query: Record<string, string | number>) {
  await call(runRoute.GET, "GET", "/x", { token, params: { id }, query }); // warm-up (plans, pool)
  const started = performance.now();
  const r = await call(runRoute.GET, "GET", "/x", { token, params: { id }, query });
  const ms = Math.round(performance.now() - started);
  expect(r.status).toBe(200);
  return { ms, body: r.body };
}

describe(`performance on ${MOVEMENTS.toLocaleString("en")} movements`, () => {
  it("stock summary < 2 s", async () => {
    expect(await prisma.stockMovement.count()).toBeGreaterThanOrEqual(MOVEMENTS);
    const { ms, body } = await timed("stock-summary", { pageSize: 50, sort: "-value" });
    console.info(`[perf] stock-summary: ${ms} ms (${body.meta.total} products)`);
    expect(body.meta.total).toBe(PRODUCTS);
    expect(ms).toBeLessThan(2000);
  });

  it("stock movement over a full year < 2 s", async () => {
    const { ms, body } = await timed("stock-movement", { dateFrom: "-90d", dateTo: "today", pageSize: 200 });
    console.info(`[perf] stock-movement (90 days): ${ms} ms (${body.meta.total} rows)`);
    expect(ms).toBeLessThan(2000);
    const year = await timed("stock-movement", { dateFrom: "yearStart", dateTo: "today", pageSize: 200, sort: "-inQty" });
    console.info(`[perf] stock-movement (year to date, sorted by qty): ${year.ms} ms (${year.body.meta.total} rows)`);
    expect(year.ms).toBeLessThan(2000);
  });

  it("stock aging < 2 s", async () => {
    const { ms } = await timed("stock-aging", { pageSize: 50 });
    console.info(`[perf] stock-aging: ${ms} ms`);
    expect(ms).toBeLessThan(2000);
  });
});
