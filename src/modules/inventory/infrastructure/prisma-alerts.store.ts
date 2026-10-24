import type { Prisma, PrismaClient } from "@prisma/client";
import type { Db } from "@/shared/db/prisma";
import type { AlertSettingsRecord, AlertStore, AlertUnitOfWork, LowStockFilters, ProductAvailability } from "../application/alerts.service";

const q3 = (v: Prisma.Decimal | null | undefined) => (v ? v.toFixed(3) : "0.000");

function store(db: Db): AlertStore {
  const s: AlertStore = {
    async settings() {
      const row = await db.alertSettings.findUnique({ where: { id: 1 } });
      return { lowStockRoleIds: row?.lowStockRoleIds ?? [], digestEnabled: row?.digestEnabled ?? true, digestTime: row?.digestTime ?? "09:00" };
    },
    async updateSettings(data: Partial<AlertSettingsRecord>) {
      await db.alertSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
      return s.settings();
    },
    roles: () => db.role.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),

    async products(f: LowStockFilters & { productIds?: string[] }) {
      const rows = await db.product.findMany({
        where: {
          ...(f.productIds ? { id: { in: f.productIds } } : { minStockLevel: { gt: 0 }, status: "ACTIVE" }),
          ...(f.catalogId ? { catalogId: f.catalogId } : {}),
          ...(f.categoryId ? { categoryId: f.categoryId } : {}),
          ...(f.q ? { OR: [{ code: { contains: f.q, mode: "insensitive" } }, { name: { contains: f.q, mode: "insensitive" } }, { model: { contains: f.q, mode: "insensitive" } }] } : {}),
        },
        select: {
          id: true,
          code: true,
          name: true,
          minStockLevel: true,
          status: true,
          unit: { select: { code: true } },
          catalog: { select: { name: true } },
          category: { select: { name: true } },
          balances: { where: { condition: "GOOD" }, select: { warehouseId: true, qtyOnHand: true, qtyReserved: true } },
        },
        orderBy: { code: "asc" },
      });
      return rows.map(
        (p): ProductAvailability => ({
          id: p.id,
          code: p.code,
          name: p.name,
          unitCode: p.unit.code,
          catalogName: p.catalog.name,
          categoryName: p.category.name,
          status: p.status,
          minStockLevel: p.minStockLevel ? q3(p.minStockLevel) : null,
          balances: p.balances.map((b) => ({ warehouseId: b.warehouseId, onHand: q3(b.qtyOnHand), reserved: q3(b.qtyReserved) })),
        }),
      );
    },
    warehouses: () => db.warehouse.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),

    async lockState(productId) {
      await db.$executeRaw`INSERT INTO "LowStockState" ("productId", "isLow", "updatedAt") VALUES (${productId}::uuid, false, now()) ON CONFLICT DO NOTHING`;
      const [row] = await db.$queryRaw<{ isLow: boolean }[]>`SELECT "isLow" FROM "LowStockState" WHERE "productId" = ${productId}::uuid FOR UPDATE`;
      return { isLow: row?.isLow ?? false };
    },
    async setState(productId, isLow) {
      await db.lowStockState.update({ where: { productId }, data: { isLow, since: isLow ? new Date() : null } });
    },
  };
  return s;
}

export function prismaAlertUnitOfWork(client: PrismaClient): AlertUnitOfWork {
  return {
    store: store(client),
    transaction: (fn) => client.$transaction((tx) => fn(store(tx))),
  };
}
