/**
 * Sample overheads for demo installs (SEED_SAMPLE_DATA not "false"), created once while the
 * register is empty:
 *  - the last 3 months of warehouse costs (rent and store staff as store charge; electricity,
 *    security and insurance as holding) for every warehouse, and the company's established cost;
 *  - overhead lines on 2 sample projects (PRJ-001 and the completed Uttara residence).
 * Built with the real services, so every line is audit-logged like one entered on screen.
 */
import type { PrismaClient } from "@prisma/client";
import { prismaOverheadsUnitOfWork } from "@/modules/overheads/infrastructure/prisma-overheads.store";
import { WarehouseCostService } from "@/modules/overheads/application/warehouse-cost.service";
import type { OverheadsActor } from "@/modules/overheads/application/ports";
import { CostService } from "@/modules/projects/application/cost.service";
import { ProjectCostingService } from "@/modules/projects/application/costing.service";
import type { ProjectsActor } from "@/modules/projects/application/ports";
import { ProjectService } from "@/modules/projects/application/project.service";
import { prismaProjectsUnitOfWork } from "@/modules/projects/infrastructure/prisma-projects.store";
import { prismaProjectQuery } from "@/modules/inventory/infrastructure/prisma-project-query";
import { ADMIN_ROLE_NAME } from "@/modules/identity/domain/seed-roles";
import { roleNameKey } from "@/modules/identity/domain/rules";
import { storage } from "@/shared/storage/storage";

export async function seedSampleOverheads(prisma: PrismaClient, log: (msg: string) => void) {
  if ((await prisma.warehouseCost.count()) > 0) return;
  const admin = await prisma.user.findFirst({ where: { role: { nameKey: roleNameKey(ADMIN_ROLE_NAME) } }, include: { warehouses: true }, orderBy: { createdAt: "asc" } });
  const warehouses = await prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
  if (!admin || !warehouses.length) return;
  const warehouseIds = admin.warehouses.map((w) => w.warehouseId);

  const oa: OverheadsActor = { actorId: admin.id, name: admin.name, ip: null, requestId: "seed", level: "FULL", canSee: true, canEdit: true, warehouseIds };
  const register = new WarehouseCostService({ uow: prismaOverheadsUnitOfWork(prisma), files: storage() });
  const thisMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date()).slice(0, 7);
  const [y, m] = thisMonth.split("-").map(Number) as [number, number];
  const month = (back: number) => new Date(Date.UTC(y, m - 1 - back, 1)).toISOString().slice(0, 7);

  // Per warehouse: rent + store staff (store charge), electricity / security + insurance (holding).
  const perWarehouse: Record<string, { rent: string; staff: string; power: string; insurance: string }> = {
    A: { rent: "120000.00", staff: "85000.00", power: "38000.00", insurance: "15000.00" },
    B: { rent: "90000.00", staff: "60000.00", power: "26000.00", insurance: "11000.00" },
  };
  let lines = 0;
  for (const back of [2, 1, 0]) {
    const mo = month(back);
    for (const w of warehouses) {
      const v = perWarehouse[w.code] ?? perWarehouse.B!;
      const add = (category: "STORE_CHARGE" | "HOLDING", amount: string, description: string, vendorOrPayee: string | null) =>
        register.create(oa, { scope: "WAREHOUSE", warehouseId: w.id, category, month: `${mo}-01`, amount, description, vendorOrPayee, referenceNo: null });
      await add("STORE_CHARGE", v.rent, `${w.name} rent`, "Landlord");
      await add("STORE_CHARGE", v.staff, "Store staff salaries and loading / unloading", null);
      await add("HOLDING", v.power, "Electricity and night security", "DESCO / guard agency");
      await add("HOLDING", v.insurance, "Stock insurance (monthly share)", "Green Delta Insurance");
      lines += 4;
    }
    await register.create(oa, { scope: "COMPANY", warehouseId: null, category: "ESTABLISHMENT", month: `${mo}-01`, amount: "420000.00", description: "Office rent, admin and management salaries, utilities, vehicles", vendorOrPayee: null, referenceNo: null });
    lines += 1;
  }
  log(`overheads: ${lines} sample warehouse / company cost lines (last 3 months)`);

  // Overhead lines on 2 sample projects.
  const prj1 = await prisma.project.findUnique({ where: { code: "PRJ-001" } });
  const home = await prisma.project.findFirst({ where: { name: { startsWith: "Uttara Residence" } } });
  if (!prj1 && !home) return;
  const pa: ProjectsActor = { actorId: admin.id, name: admin.name, ip: null, requestId: "seed", level: "FULL", inventoryLevel: "FULL", purchasingLevel: "FULL", overheadsLevel: "FULL", warehouseIds, canSeeCost: true, canSeeMargin: true, canSeeOverheads: true, isAdmin: true };
  const uow = prismaProjectsUnitOfWork(prisma);
  const stock = prismaProjectQuery(prisma);
  const costing = new ProjectCostingService({ store: () => uow.store, stock });
  const projects = new ProjectService({ uow, costing, stock });
  const costs = new CostService({ uow, projects, costing });
  const charge = (projectId: string, category: "STORE_CHARGE" | "HOLDING" | "ESTABLISHMENT", amount: string, description: string, basisNote: string, period?: [string, string]) =>
    costs.add(pa, projectId, { category, amount, description, basisNote, date: `${month(1)}-28`, periodFrom: period?.[0] ?? null, periodTo: period?.[1] ?? null } as never);
  for (const p of [prj1, home]) {
    if (!p) continue;
    await charge(p.id, "STORE_CHARGE", p === home ? "6500.00" : "12000.00", "Store handling of issued material", "2% of material issued");
    await charge(p.id, "HOLDING", p === home ? "2500.00" : "4800.00", "Holding while material waited for site", "Approx. 1% of material value");
    await charge(p.id, "ESTABLISHMENT", p === home ? "18000.00" : "35000.00", "Share of office and management overhead", "Agreed share for the period", [`${month(2)}-01`, `${month(1)}-01`]);
  }
  log("overheads: overhead lines on 2 sample projects");
}
