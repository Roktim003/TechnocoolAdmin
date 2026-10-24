/**
 * Sample project costing for demo installs (SEED_SAMPLE_DATA not "false"), created once, while
 * there are no project costs yet. Built with the real services (issues and returns go through
 * the posting engine), so material costs, statuses and history are exactly what the app makes:
 *  - PRJ-001 running: material issued, some pipe returned (part damaged), labour and transport;
 *  - PRJ-002 planning: nothing yet;
 *  - a retail fit-out put on hold, with material and labour;
 *  - a residence completed at about 90 % of its contract value.
 * Runs after the purchasing sample, whose GRNs put the stock into the first warehouse.
 */
import type { PrismaClient } from "@prisma/client";
import { EntryService } from "@/modules/inventory/application/entry.service";
import { StockPostingService } from "@/modules/inventory/application/posting.service";
import type { InventoryActor } from "@/modules/inventory/application/ports";
import { prismaInventoryUnitOfWork } from "@/modules/inventory/infrastructure/prisma-inventory.store";
import { prismaProjectQuery } from "@/modules/inventory/infrastructure/prisma-project-query";
import { CostService } from "@/modules/projects/application/cost.service";
import { ProjectCostingService } from "@/modules/projects/application/costing.service";
import type { CreateProjectInput } from "@/modules/projects/application/dto";
import type { ProjectsActor } from "@/modules/projects/application/ports";
import { ProjectService } from "@/modules/projects/application/project.service";
import { prismaProjectsUnitOfWork } from "@/modules/projects/infrastructure/prisma-projects.store";
import { ADMIN_ROLE_NAME } from "@/modules/identity/domain/seed-roles";
import { roleNameKey } from "@/modules/identity/domain/rules";

export async function seedSampleProjects(prisma: PrismaClient, log: (msg: string) => void) {
  if ((await prisma.projectCost.count()) > 0) return;
  const admin = await prisma.user.findFirst({ where: { role: { nameKey: roleNameKey(ADMIN_ROLE_NAME) } }, include: { warehouses: true }, orderBy: { createdAt: "asc" } });
  const warehouse = await prisma.warehouse.findFirst({ orderBy: { code: "asc" } });
  const prj1 = await prisma.project.findUnique({ where: { code: "PRJ-001" } });
  if (!admin || !warehouse || !prj1) return;
  const ac = await prisma.product.findUnique({ where: { code: "LG-S4-Q18KL3AA" } });
  const pipe = await prisma.product.findUnique({ where: { code: "PIPE-CU-12.7" } });

  const uow = prismaProjectsUnitOfWork(prisma);
  const stock = prismaProjectQuery(prisma);
  const costing = new ProjectCostingService({ store: () => uow.store, stock });
  const projects = new ProjectService({ uow, costing, stock });
  const costs = new CostService({ uow, projects });
  const actor: ProjectsActor = { actorId: admin.id, name: admin.name, ip: null, requestId: "seed", level: "FULL", inventoryLevel: "FULL", purchasingLevel: "FULL", warehouseIds: admin.warehouses.map((w) => w.warehouseId), canSeeCost: true, canSeeMargin: true, isAdmin: true };
  const inv: InventoryActor = { actorId: admin.id, name: admin.name, ip: null, requestId: "seed", level: "FULL", warehouseIds: actor.warehouseIds, canSeeCost: true, canSeeProfit: true, isAdmin: true };
  const entries = new EntryService({ uow: prismaInventoryUnitOfWork(prisma), posting: new StockPostingService() });

  const day = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date(Date.now() + offset * 86_400_000));
  /** Issues / returns are skipped (logged) when the sample stock isn't there, e.g. on an older install. */
  const move = async (type: "ISSUE_TO_PROJECT" | "RETURN_FROM_SITE", projectId: string, lines: { productId: string; qty: string; condition?: "GOOD" | "DAMAGED" }[], extra: Record<string, unknown> = {}) => {
    try {
      await entries.create(inv, { action: "post", type, warehouseId: warehouse.id, projectId, lines: lines.map((l) => ({ condition: "GOOD", ...l })), charges: [], ...extra } as never);
    } catch (err) {
      log(`projects: skipped a sample ${type.toLowerCase()} (${(err as Error).message})`);
    }
  };
  const cost = (projectId: string, category: "LABOUR" | "TRANSPORT" | "OTHER", amount: string, description: string, extra: { vendorOrPayee?: string; referenceNo?: string; date?: string } = {}) =>
    costs.add(actor, projectId, { category, amount, description, date: extra.date ?? day(-5), vendorOrPayee: extra.vendorOrPayee ?? null, referenceNo: extra.referenceNo ?? null });
  const create = (input: Partial<CreateProjectInput> & Pick<CreateProjectInput, "name" | "clientName">) => projects.create(actor, { status: "RUNNING", defaultWarehouseId: warehouse.id, ...input } as CreateProjectInput);

  // PRJ-001 (running): material issued, some pipe back from site.
  if (ac && pipe) {
    await move("ISSUE_TO_PROJECT", prj1.id, [{ productId: ac.id, qty: "4" }, { productId: pipe.id, qty: "120" }], { siteAddress: prj1.siteAddress, receivedBy: "Rafiq Ahmed", vehicle: "DHA-METRO-11-2233" });
    await move("RETURN_FROM_SITE", prj1.id, [{ productId: pipe.id, qty: "8" }, { productId: pipe.id, qty: "2", condition: "DAMAGED" }], { reason: "Leftover after the 6th-floor runs", receivedBy: "Rafiq Ahmed" });
  }
  await cost(prj1.id, "LABOUR", "85000.00", "Installation team — September", { vendorOrPayee: "Karim & Sons Installers", referenceNo: "KS-0912" });
  await cost(prj1.id, "TRANSPORT", "12500.00", "Truck hire, warehouse → Gulshan (3 trips)", { vendorOrPayee: "Dhaka Movers" });

  // On hold: a retail fit-out waiting for the client.
  const retail = await create({ name: "Banani Retail Mall — split AC fit-out", clientName: "Banani Retail Holdings", clientPhone: "+880 1711 222333", siteAddress: "Road 11, Banani, Dhaka", projectType: "RETAIL", startDate: day(-40), expectedEndDate: day(30), siteEngineerName: "Nusrat Jahan", contractValue: "900000.00" });
  if (ac && pipe) await move("ISSUE_TO_PROJECT", retail.id, [{ productId: ac.id, qty: "2" }, { productId: pipe.id, qty: "40" }]);
  await cost(retail.id, "LABOUR", "40000.00", "Ceiling preparation and piping", { vendorOrPayee: "Karim & Sons Installers" });
  await projects.changeStatus(actor, retail.id, "ON_HOLD", "Client payment pending; site closed for now.");

  // Completed at about 90 % of the contract value.
  const home = await create({ name: "Uttara Residence — ducted AC", clientName: "Mr. Hasan Mahmud", clientPhone: "+880 1911 444555", siteAddress: "Sector 7, Uttara, Dhaka", projectType: "RESIDENTIAL", startDate: day(-60), expectedEndDate: day(-10), siteEngineerName: "Rafiq Ahmed", contractValue: "450000.00" });
  if (ac && pipe) await move("ISSUE_TO_PROJECT", home.id, [{ productId: ac.id, qty: "2" }, { productId: pipe.id, qty: "60" }]);
  await cost(home.id, "LABOUR", "150000.00", "Installation and commissioning", { vendorOrPayee: "Karim & Sons Installers", date: day(-15) });
  await cost(home.id, "TRANSPORT", "15000.00", "Delivery and crane", { vendorOrPayee: "Dhaka Movers", date: day(-20) });
  await cost(home.id, "OTHER", "25000.00", "Electrical works by the client's contractor", { referenceNo: "EL-2209", date: day(-12) });
  const voided = await cost(home.id, "OTHER", "9000.00", "Scaffolding (entered twice)", { date: day(-12) });
  await costs.void(actor, home.id, voided.id, "Duplicate of the scaffolding bill already included in labour.");
  await projects.changeStatus(actor, home.id, "COMPLETED", undefined);

  log("projects: 2 more sample projects (on hold, completed) with material and costs");
}
