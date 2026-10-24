import { prisma } from "@/shared/db/prisma";
import { storage } from "@/shared/storage/storage";
import { inventory } from "@/modules/inventory/interface/container";
import { CostAlertService } from "../application/alert.service";
import { ProjectAttachmentService } from "../application/attachment.service";
import { CostService } from "../application/cost.service";
import { ProjectCostingService } from "../application/costing.service";
import { ProjectService } from "../application/project.service";
import { prismaProjectsUnitOfWork } from "../infrastructure/prisma-projects.store";
import { costStatementQueue } from "./documents";
import { costAlertQueue, projectsNotifier, projectStockListener } from "./events";

/** Composition root of the projects module. Stock data comes from inventory's query interface (projects may depend on inventory, never the reverse). */
function build() {
  const uow = prismaProjectsUnitOfWork(prisma);
  const stock = inventory().projectQuery;
  const costing = new ProjectCostingService({ store: () => uow.store, stock });
  const projects = new ProjectService({ uow, costing, stock, notifier: projectsNotifier, alerts: costAlertQueue });
  const costs = new CostService({ uow, projects, alerts: costAlertQueue });
  return {
    uow,
    stock,
    costing,
    projects,
    costs,
    attachments: new ProjectAttachmentService({ uow, files: storage(), projects, costs }),
    alerts: new CostAlertService({ uow, costing, notifier: projectsNotifier }),
    documents: costStatementQueue,
    /** Registered with inventory at startup (see src/modules/bootstrap.ts). */
    stockListener: projectStockListener,
  };
}

let instance: ReturnType<typeof build> | undefined;

export function projects() {
  return (instance ??= build());
}
