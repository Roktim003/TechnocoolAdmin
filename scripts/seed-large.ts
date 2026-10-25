/**
 * Large realistic dataset for performance and load tests (never run it on real data):
 *
 *   npm run seed:large                       (dev database from .env)
 *   docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm web node dist/seed-large.js
 *
 * Creates 2,000 products (100 serial-tracked), 50 projects, 300 purchase orders and 5,000
 * stock entries posted through the real posting engine, giving ≈200,000 ledger movements over
 * the last 11 months: 300 GRNs against POs, 1,700 GRNs, 1,500 issues to projects, 1,000 sales
 * and 500 transfers (dispatched and received). Balances, average costs, serials and PO receipts
 * are therefore exactly what the app would produce, and the integrity check passes.
 *
 * Posting stamps movements with the current time; at the end the movement timestamps are moved
 * to each entry's date (the append-only trigger is disabled for that one UPDATE, inside a
 * transaction) so date-range reports see a year of history.
 *
 * Options: SEED_LARGE_SCALE=0.1 for a tenth of everything; SEED_LARGE_CONCURRENCY=4.
 */
import { prisma } from "@/shared/db/prisma";
import { logger } from "@/shared/logger/logger";
import { closeQueues } from "@/shared/queue/queue";
import { redis } from "@/shared/redis/redis";
import { wireModules } from "@/modules/bootstrap";
import { principalForUser } from "@/modules/identity/interface/principal-loader";
import { CreateEntrySchema } from "@/modules/inventory/application/dto";
import { inventory } from "@/modules/inventory/interface/container";
import { principalActor } from "@/modules/inventory/interface/http";
import { CreatePoSchema } from "@/modules/purchasing/application/dto";
import { purchasing } from "@/modules/purchasing/interface/container";
import { purchasingActor } from "@/modules/purchasing/interface/http";

const SCALE = Number(process.env.SEED_LARGE_SCALE ?? 1);
const CONCURRENCY = Number(process.env.SEED_LARGE_CONCURRENCY ?? 4);
const n = (x: number) => Math.max(1, Math.round(x * SCALE));

const PRODUCTS = n(2000);
const PROJECTS = n(50);
const POS = n(300);
const GRNS = n(1700);
const ISSUES = n(1500);
const SALES = n(1000);
const TRANSFERS = n(500);
const LINES = 40;
const DAYS = 330;

const log = logger.child({ component: "seed-large" });
const say = (msg: string) => process.stdout.write(`${new Date().toISOString().slice(11, 19)}  ${msg}\n`);

/** Deterministic pseudo-random numbers (same dataset every run). */
let seed = 20261025;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!;
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

interface Item {
  id: string;
  serial: boolean;
  cost: number;
}

async function main() {
  wireModules();
  const existing = await prisma.product.count({ where: { code: { startsWith: "LRG-" } } });
  if (existing) throw new Error(`The large dataset is already loaded (${existing} LRG- products). Reset the database first.`);

  const admin = await prisma.user.findFirstOrThrow({ where: { role: { isLocked: true }, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  const principal = await principalForUser(admin.id);
  if (!principal) throw new Error("No active Admin to post as.");
  const actor = principalActor(principal);
  const pActor = purchasingActor(principal);
  const whs = await prisma.warehouse.findMany({ orderBy: { code: "asc" }, take: 2 });
  if (whs.length < 2) throw new Error("Two warehouses are needed.");
  const whA = whs[0]!;
  const whB = whs[1]!;
  const catalogs = await prisma.catalog.findMany();
  const categories = await prisma.category.findMany();
  const unit = await prisma.unit.findFirstOrThrow({ where: { code: "pcs" } });
  const supplier = await prisma.supplier.findFirstOrThrow({ where: { type: "LOCAL", isActive: true } });
  const customers = await prisma.customer.findMany({ take: 20 });
  if (!customers.length) throw new Error("Run the normal seed first (customers are needed for sales).");

  /* 1. products and projects */
  say(`products: ${PRODUCTS}`);
  const rows = Array.from({ length: PRODUCTS }, (_, i) => ({
    code: `LRG-${String(i + 1).padStart(5, "0")}`,
    name: `${pick(["Split AC", "Cassette AC", "Exhaust fan", "Copper pipe", "Insulation", "Thermostat", "Air purifier", "Duct", "Grille", "Compressor"])} ${i + 1}`,
    catalogId: pick(catalogs).id,
    categoryId: pick(categories).id,
    unitId: unit.id,
    purchaseCost: String(int(5, 900) * 100),
    sellingPrice: "0",
    trackSerial: i % 20 === 0,
    minStockLevel: String(int(0, 20)),
    createdById: admin.id,
  }));
  for (let i = 0; i < rows.length; i += 1000) await prisma.product.createMany({ data: rows.slice(i, i + 1000) as never });
  const products = (await prisma.product.findMany({ where: { code: { startsWith: "LRG-" } }, select: { id: true, trackSerial: true, purchaseCost: true }, orderBy: { code: "asc" } })).map((p) => ({ id: p.id, serial: p.trackSerial, cost: Number(p.purchaseCost) }));

  say(`projects: ${PROJECTS}`);
  await prisma.project.createMany({
    data: Array.from({ length: PROJECTS }, (_, i) => ({ code: `LP-${String(i + 1).padStart(3, "0")}`, name: `Load test project ${i + 1}`, clientName: `Client ${i + 1}`, status: "RUNNING" as const, contractValue: String(int(20, 200) * 100_000), defaultWarehouseId: whA.id, createdById: admin.id })),
  });
  const projects = await prisma.project.findMany({ where: { code: { startsWith: "LP-" } }, select: { id: true } });

  /* 2. the plan: entries in date order, products split into one group per worker (no lock fights) */
  type Planned = { kind: "PO_GRN" | "GRN" | "ISSUE" | "SALE" | "TRANSFER"; group: number };
  const plan: Planned[] = [];
  const add = (kind: Planned["kind"], count: number) => {
    for (let i = 0; i < count; i++) plan.push({ kind, group: 0 });
  };
  add("PO_GRN", POS);
  add("GRN", GRNS);
  add("ISSUE", ISSUES);
  add("SALE", SALES);
  add("TRANSFER", TRANSFERS);
  // Receipts first in each stretch so stock exists; then a shuffled mix.
  const head = plan.splice(0, Math.min(plan.length, POS + Math.round(GRNS / 3)));
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [plan[i], plan[j]] = [plan[j]!, plan[i]!];
  }
  const ordered = [...head, ...plan].map((p, i) => ({ ...p, group: i % CONCURRENCY, index: i }));
  const total = ordered.length;
  const start = Date.now() - DAYS * 86_400_000;
  const dateOf = (i: number) => new Date(start + (i / total) * DAYS * 86_400_000 + 6 * 3600_000).toISOString().slice(0, 10);

  const groups = Array.from({ length: CONCURRENCY }, (_, g) => products.filter((_p, i) => i % CONCURRENCY === g));
  /** On hand per product + warehouse, and in-stock serials, per worker group. */
  const onHand = new Map<string, number>();
  const serials = new Map<string, string[]>();
  const key = (p: string, w: string) => `${p}|${w}`;
  let serialNo = 0;

  /* 3. purchase orders (approved), received by the first GRNs */
  say(`purchase orders: ${POS}`);
  const pos: { id: string; group: number; lines: { productId: string; qty: number }[] }[] = [];
  for (let i = 0; i < POS; i++) {
    const g = i % CONCURRENCY;
    const lines = Array.from({ length: 5 }, () => pick(groups[g]!)).filter((p, k, a) => a.findIndex((x) => x.id === p.id) === k && !p.serial).map((p) => ({ productId: p.id, qty: int(5, 40), unitPrice: p.cost }));
    if (!lines.length) continue;
    const po = await purchasing().orders.create(pActor, CreatePoSchema.parse({ action: "approve", supplierId: supplier.id, deliverToWarehouseId: whA.id, poDate: dateOf(0), lines }));
    pos.push({ id: po.id, group: g, lines: lines.map((l) => ({ productId: l.productId, qty: l.qty })) });
  }

  /* 4. entries */
  say(`entries: ${total} with ~${LINES} lines each (${CONCURRENCY} workers)`);
  let posted = 0;
  let failed = 0;
  const startedAt = Date.now();

  async function post(e: (typeof ordered)[number]) {
    const g = e.group;
    const items = groups[g]!;
    const entryDate = dateOf(e.index);
    const wh = rnd() < 0.7 ? whA : whB;
    if (e.kind === "PO_GRN") {
      const po = pos.find((x) => x.group === g && !(x as { used?: boolean }).used) ?? pos.find((x) => !(x as { used?: boolean }).used);
      if (!po) return;
      (po as { used?: boolean }).used = true;
      await inventory().entries.create(actor, CreateEntrySchema.parse({ action: "post", type: "GRN_LOCAL", warehouseId: whA.id, supplierId: supplier.id, purchaseOrderId: po.id, entryDate, lines: po.lines.map((l) => ({ productId: l.productId, qty: l.qty })) }));
      for (const l of po.lines) onHand.set(key(l.productId, whA.id), (onHand.get(key(l.productId, whA.id)) ?? 0) + l.qty);
      return;
    }
    if (e.kind === "GRN") {
      const chosen = uniq(Array.from({ length: LINES }, () => pick(items)));
      const lines = chosen.map((p) => {
        const qty = p.serial ? int(1, 2) : int(5, 60);
        const sn = p.serial ? Array.from({ length: qty }, () => `LRG-SN-${String(++serialNo).padStart(7, "0")}`) : undefined;
        return { p, qty, sn, line: { productId: p.id, qty, unitPrice: (p.cost * (0.9 + rnd() * 0.2)).toFixed(2), ...(sn ? { serials: sn } : {}) } };
      });
      await inventory().entries.create(actor, CreateEntrySchema.parse({ action: "post", type: "GRN_LOCAL", warehouseId: wh.id, supplierId: supplier.id, entryDate, lines: lines.map((l) => l.line) }));
      for (const l of lines) {
        onHand.set(key(l.p.id, wh.id), (onHand.get(key(l.p.id, wh.id)) ?? 0) + l.qty);
        if (l.sn) serials.set(key(l.p.id, wh.id), [...(serials.get(key(l.p.id, wh.id)) ?? []), ...l.sn]);
      }
      return;
    }
    // Out entries: only what is on hand (one worker owns these products, so nobody else takes it).
    const stocked = items.filter((p) => (onHand.get(key(p.id, wh.id)) ?? 0) >= 1);
    if (stocked.length < 5) return;
    const chosen = uniq(Array.from({ length: e.kind === "TRANSFER" ? 30 : LINES }, () => pick(stocked)));
    const lines = chosen.map((p) => {
      const have = onHand.get(key(p.id, wh.id))!;
      const qty = p.serial ? 1 : Math.max(1, Math.min(have, int(1, Math.max(1, Math.floor(have / 3)))));
      const sn = p.serial ? (serials.get(key(p.id, wh.id)) ?? []).slice(0, 1) : undefined;
      return { p, qty, sn };
    }).filter((l) => !l.p.serial || l.sn!.length === 1);
    if (!lines.length) return;
    const body = lines.map((l) => ({ productId: l.p.id, qty: l.qty, ...(l.sn ? { serials: l.sn } : {}), ...(e.kind === "SALE" ? { unitPrice: (l.p.cost * 1.35).toFixed(2) } : {}) }));
    const to = wh.id === whA.id ? whB : whA;
    const input =
      e.kind === "ISSUE" ? { action: "post", type: "ISSUE_TO_PROJECT", warehouseId: wh.id, projectId: pick(projects).id, entryDate, lines: body }
      : e.kind === "SALE" ? { action: "post", type: "SALE", warehouseId: wh.id, customerId: pick(customers).id, entryDate, lines: body, confirmBelowCost: true }
      : { action: "post", type: "TRANSFER", warehouseId: wh.id, toWarehouseId: to.id, entryDate, vehicle: "DHA-LT-0001", lines: body };
    const created = await inventory().entries.create(actor, CreateEntrySchema.parse(input));
    for (const l of lines) {
      onHand.set(key(l.p.id, wh.id), onHand.get(key(l.p.id, wh.id))! - l.qty);
      if (l.sn) serials.set(key(l.p.id, wh.id), (serials.get(key(l.p.id, wh.id)) ?? []).filter((s) => !l.sn!.includes(s)));
    }
    if (e.kind === "TRANSFER") {
      await inventory().entries.receive(actor, created.id, { lines: created.lines.map((l) => ({ lineId: l.id, receivedQty: l.qty })) });
      for (const l of lines) {
        onHand.set(key(l.p.id, to.id), (onHand.get(key(l.p.id, to.id)) ?? 0) + l.qty);
        if (l.sn) serials.set(key(l.p.id, to.id), [...(serials.get(key(l.p.id, to.id)) ?? []), ...l.sn]);
      }
    }
  }

  // One queue per worker group, run in parallel; entries inside a group stay in date order.
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async (_, g) => {
      for (const e of ordered.filter((x) => x.group === g)) {
        try {
          await post(e);
          posted++;
        } catch (err) {
          failed++;
          if (failed <= 10) log.warn({ err: (err as Error).message, kind: e.kind }, "entry skipped");
        }
        if ((posted + failed) % 250 === 0) say(`  ${posted + failed}/${total} (${failed} skipped) · ${Math.round((posted + failed) / ((Date.now() - startedAt) / 1000))}/s`);
      }
    }),
  );

  /* 5. spread the ledger timestamps over the entry dates (reports filter on them) */
  say("moving ledger timestamps to entry dates");
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`ALTER TABLE "StockMovement" DISABLE TRIGGER "StockMovement_append_only"`);
    await tx.$executeRawUnsafe(`UPDATE "StockMovement" m SET "postedAt" = (e."entryDate"::timestamp + interval '4 hours' + (m.seq % 600) * interval '1 minute') FROM "StockEntry" e WHERE e.id = m."entryId" AND e."createdById" = '${admin.id}' AND m."postedAt"::date > e."entryDate"`);
    await tx.$executeRawUnsafe(`UPDATE "StockEntry" SET "postedAt" = "entryDate"::timestamp + interval '4 hours' WHERE "postedAt"::date > "entryDate" AND "createdById" = '${admin.id}'`);
    await tx.$executeRawUnsafe(`ALTER TABLE "StockMovement" ENABLE TRIGGER "StockMovement_append_only"`);
  }, { timeout: 600_000 });
  await prisma.$executeRawUnsafe(`ANALYZE`);

  const [movements, entries, serialCount] = await Promise.all([prisma.stockMovement.count(), prisma.stockEntry.count(), prisma.serialNumber.count()]);
  say(`done in ${Math.round((Date.now() - startedAt) / 1000)} s: ${entries} entries, ${movements} movements, ${serialCount} serials, ${pos.length} POs (${failed} entries skipped)`);
}

function uniq(xs: Item[]): Item[] {
  return xs.filter((p, i) => xs.findIndex((x) => x.id === p.id) === i);
}

main()
  .then(async () => {
    await Promise.allSettled([prisma.$disconnect(), closeQueues()]);
    await redis().quit().catch(() => undefined);
    process.exit(0);
  })
  .catch(async (err) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    await prisma.$disconnect();
    process.exit(1);
  });
