/**
 * Sample purchase orders for demo installs (SEED_SAMPLE_DATA not "false"), created once, while
 * there are no purchase orders yet. Built with the real services, so numbers, totals, revisions
 * and GRN links are exactly what the app would produce: a draft, one pending approval, a
 * rejected one, approved, sent, partly received (with a posted GRN), fully received, cancelled.
 */
import type { PrismaClient } from "@prisma/client";
import { nameKey } from "@/modules/catalog/domain/rules";
import { EntryService } from "@/modules/inventory/application/entry.service";
import { StockPostingService } from "@/modules/inventory/application/posting.service";
import { registerReceiptListener } from "@/modules/inventory/application/receipts";
import { prismaInventoryUnitOfWork } from "@/modules/inventory/infrastructure/prisma-inventory.store";
import { PurchaseOrderService } from "@/modules/purchasing/application/purchase-order.service";
import { PurchaseReceiptListener } from "@/modules/purchasing/application/receipt-listener";
import type { PurchasingActor } from "@/modules/purchasing/application/ports";
import type { CreatePoInput } from "@/modules/purchasing/application/dto";
import { prismaPurchasingStore, prismaPurchasingUnitOfWork } from "@/modules/purchasing/infrastructure/prisma-purchasing.store";
import type { Db } from "@/shared/db/prisma";
import { ADMIN_ROLE_NAME } from "@/modules/identity/domain/seed-roles";
import { roleNameKey } from "@/modules/identity/domain/rules";

const SAMPLE_PRODUCTS = [
  { code: "LG-ARNU24GTRB4", name: "LG Multi V ceiling cassette 2.0 Ton", catalog: "LG", category: "Cassette AC", unit: "pcs", cost: "98000.00", price: "125000.00", min: "4", supplier: "LG Electronics Bangladesh" },
  { code: "LG-S4-Q18KL3AA", name: "LG Dual Inverter split AC 1.5 Ton", catalog: "LG", category: "Split AC", unit: "pcs", cost: "61000.00", price: "78000.00", min: "10", supplier: "LG Electronics Bangladesh" },
  { code: "DK-FXFQ63AVM", name: "Daikin VRV round-flow cassette 7.1 kW", catalog: "Daikin", category: "VRF / VRV", unit: "pcs", cost: "0.00", price: "185000.00", min: "2", supplier: "Daikin Airconditioning (Thailand)" },
  { code: "PIPE-CU-12.7", name: "Copper pipe 1/2 in, soft drawn", catalog: "LG", category: "Piping", unit: "m", cost: "620.00", price: "780.00", min: "300", supplier: "Nawabpur Pipe & Fittings" },
];

export async function seedSamplePurchases(prisma: PrismaClient, log: (msg: string) => void) {
  if ((await prisma.purchaseOrder.count()) > 0) return;
  const admin = await prisma.user.findFirst({ where: { role: { nameKey: roleNameKey(ADMIN_ROLE_NAME) } }, include: { warehouses: true }, orderBy: { createdAt: "asc" } });
  const suppliers = new Map((await prisma.supplier.findMany()).map((s) => [s.name, s]));
  const warehouse = await prisma.warehouse.findFirst({ orderBy: { code: "asc" } });
  if (!admin || !warehouse || !SAMPLE_PRODUCTS.every((p) => suppliers.has(p.supplier))) return;

  // Products (only the ones that don't exist yet), linked to their default supplier.
  const ids = new Map<string, string>();
  for (const p of SAMPLE_PRODUCTS) {
    const existing = await prisma.product.findUnique({ where: { code: p.code } });
    if (existing) {
      ids.set(p.code, existing.id);
      continue;
    }
    const [catalog, category, unit] = await Promise.all([
      prisma.catalog.findUniqueOrThrow({ where: { nameKey: nameKey(p.catalog) } }),
      prisma.category.findUniqueOrThrow({ where: { nameKey: nameKey(p.category) } }),
      prisma.unit.findUniqueOrThrow({ where: { code: p.unit } }),
    ]);
    const created = await prisma.product.create({
      data: { code: p.code, name: p.name, catalogId: catalog.id, categoryId: category.id, unitId: unit.id, purchaseCost: p.cost, sellingPrice: p.price, minStockLevel: p.min, defaultSupplierId: suppliers.get(p.supplier)!.id, createdById: admin.id },
    });
    ids.set(p.code, created.id);
  }

  const actor: PurchasingActor = { actorId: admin.id, name: admin.name, ip: null, requestId: "seed", level: "FULL", inventoryLevel: "FULL", warehouseIds: admin.warehouses.map((w) => w.warehouseId), canSeeCost: true };
  const uow = prismaPurchasingUnitOfWork(prisma);
  const orders = new PurchaseOrderService({ uow });
  registerReceiptListener(new PurchaseReceiptListener({ storeFor: (db) => prismaPurchasingStore(db as Db), store: () => uow.store }));
  const entries = new EntryService({ uow: prismaInventoryUnitOfWork(prisma), posting: new StockPostingService() });

  const lg = suppliers.get("LG Electronics Bangladesh")!.id;
  const daikin = suppliers.get("Daikin Airconditioning (Thailand)")!.id;
  const pipe = suppliers.get("Nawabpur Pipe & Fittings")!.id;
  const day = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date(Date.now() + offset * 86_400_000));
  const po = (action: CreatePoInput["action"], supplierId: string, lines: { code: string; qty: string; unitPrice: string }[], extra: Partial<CreatePoInput> = {}) =>
    orders.create(actor, {
      action,
      supplierId,
      deliverToWarehouseId: warehouse.id,
      poDate: day(-10),
      expectedDeliveryDate: day(10),
      lines: lines.map((l) => ({ productId: ids.get(l.code)!, qty: l.qty, unitPrice: l.unitPrice, note: null })),
      ...extra,
    } as CreatePoInput);

  await po("draft", lg, [{ code: "LG-S4-Q18KL3AA", qty: "12", unitPrice: "60500" }], { notes: "Sample draft." });
  await po("submit", pipe, [{ code: "PIPE-CU-12.7", qty: "500", unitPrice: "615" }], { discountAmount: "5000", vatPercent: "7.5" });
  const rejected = await po("submit", pipe, [{ code: "PIPE-CU-12.7", qty: "2000", unitPrice: "640" }]);
  await orders.reject({ ...actor, level: "FULL" }, rejected.id, "Quantity too high for one order: split it.");
  await po("approve", daikin, [{ code: "DK-FXFQ63AVM", qty: "6", unitPrice: "1150" }], { exchangeRate: "122.50", supplierQuoteRef: "DK-Q-2611" });
  const sent = await po("approve", lg, [{ code: "LG-ARNU24GTRB4", qty: "8", unitPrice: "97500" }], { supplierQuoteRef: "LG/BD/Q-1180", vatPercent: "5", expectedDeliveryDate: day(-2) });
  await orders.markSent(actor, sent.id);

  // Partly received: an approved PO with a posted GRN for some of it.
  const partly = await po("approve", lg, [
    { code: "LG-S4-Q18KL3AA", qty: "20", unitPrice: "60000" },
    { code: "LG-ARNU24GTRB4", qty: "4", unitPrice: "97000" },
  ]);
  await orders.markSent(actor, partly.id);
  const inv = { ...actor, level: "FULL" as const, canSeeProfit: true, isAdmin: true };
  await entries.create(inv, { action: "post", type: "GRN_LOCAL", warehouseId: warehouse.id, purchaseOrderId: partly.id, supplierInvoiceNo: "LG-INV-55102", lines: [{ productId: ids.get("LG-S4-Q18KL3AA")!, qty: "12" }], charges: [] } as never);

  // Fully received.
  const full = await po("approve", pipe, [{ code: "PIPE-CU-12.7", qty: "300", unitPrice: "610" }]);
  await entries.create(inv, { action: "post", type: "GRN_LOCAL", warehouseId: warehouse.id, purchaseOrderId: full.id, lines: [{ productId: ids.get("PIPE-CU-12.7")!, qty: "300" }], charges: [] } as never);

  const cancelled = await po("approve", lg, [{ code: "LG-S4-Q18KL3AA", qty: "5", unitPrice: "61000" }]);
  await orders.cancel(actor, cancelled.id, "Customer postponed the project.");

  registerReceiptListener(null);
  log("purchasing: sample products and 9 purchase orders (draft … fully received, cancelled)");
}
