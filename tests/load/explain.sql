-- Query plans for the hot paths, on the seed:large dataset (docs/performance.md).
--   docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
--     psql -U stockbook -d stockbook -f - < tests/load/explain.sql
-- Each query mirrors what the app sends for that screen (Prisma or the report SQL), with
-- Warehouse A as the scope.
\set ON_ERROR_STOP on
\timing off
SELECT id AS wh FROM "Warehouse" ORDER BY code LIMIT 1 \gset
SELECT id AS product FROM "Product" WHERE code = 'LRG-00021' \gset

\echo '== 1. Entries list (default sort -createdAt, warehouse scope, page of 25)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM "StockEntry"
WHERE ("warehouseId" = :'wh' OR "toWarehouseId" = :'wh')
ORDER BY "createdAt" DESC, id ASC LIMIT 25;

\echo '== 2. Pending verification (status PENDING, scope)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM "StockEntry" WHERE status = 'PENDING' AND "warehouseId" = :'wh' ORDER BY "createdAt" DESC LIMIT 25;

\echo '== 3. Ledger list (movements, default sort -postedAt, scope, page of 50)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM "StockMovement" WHERE "warehouseId" = :'wh' ORDER BY "postedAt" DESC, id LIMIT 50;

\echo '== 4. Product stock card (one product, newest movements first)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM "StockMovement" WHERE "productId" = :'product' ORDER BY seq DESC LIMIT 50;

\echo '== 5. Stock balances (warehouse, page of 50 by product code)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT b.*, p.code, p.name FROM "StockBalance" b JOIN "Product" p ON p.id = b."productId"
WHERE b."warehouseId" = :'wh' ORDER BY p.code LIMIT 50;

\echo '== 6. Product search (q = "pipe", name / code contains)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM "Product" WHERE (name ILIKE '%pipe%' OR code ILIKE '%pipe%') ORDER BY name LIMIT 25;

\echo '== 7. Stock movement report, last 90 days, page of 200 + totals'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT m.seq, e.number, p.code, m."qtyChange", m."valueChange"
FROM "StockMovement" m JOIN "StockEntry" e ON e.id = m."entryId" JOIN "Product" p ON p.id = m."productId"
WHERE m."warehouseId" = ANY(ARRAY[:'wh']::uuid[]) AND m."postedAt" >= now() - interval '90 days'
ORDER BY m.seq DESC LIMIT 200;
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT COUNT(*), SUM(GREATEST(m."qtyChange", 0)), SUM(m."valueChange")
FROM "StockMovement" m JOIN "StockEntry" e ON e.id = m."entryId" JOIN "Product" p ON p.id = m."productId"
WHERE m."warehouseId" = ANY(ARRAY[:'wh']::uuid[]) AND m."postedAt" >= now() - interval '90 days';

\echo '== 8. Dashboard in / out chart (last 30 days per day)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT date_trunc('day', m."postedAt" AT TIME ZONE 'Asia/Dhaka') AS d,
       SUM(GREATEST(m."qtyChange", 0)) AS qty_in, SUM(GREATEST(-m."qtyChange", 0)) AS qty_out
FROM "StockMovement" m WHERE m."warehouseId" = :'wh' AND m."postedAt" >= now() - interval '30 days'
GROUP BY 1 ORDER BY 1;

\echo '== 9. Serial lookup (exact serial)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM "SerialNumber" WHERE serial = 'LRG-SN-0000100';

\echo '== 10. Posting: lock the balance rows of one entry (what every post does first)'
BEGIN;
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM "StockBalance" WHERE "warehouseId" = :'wh' AND "productId" IN (SELECT id FROM "Product" WHERE code LIKE 'LRG-0000%') FOR UPDATE;
ROLLBACK;
