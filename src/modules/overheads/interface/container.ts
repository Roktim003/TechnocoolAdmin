import { prisma } from "@/shared/db/prisma";
import { storage } from "@/shared/storage/storage";
import { WarehouseCostService } from "../application/warehouse-cost.service";
import { prismaOverheadsUnitOfWork } from "../infrastructure/prisma-overheads.store";

/** Composition root of the overheads module. */
function build() {
  const uow = prismaOverheadsUnitOfWork(prisma);
  return { uow, costs: new WarehouseCostService({ uow, files: storage() }) };
}

let instance: ReturnType<typeof build> | undefined;

export function overheads() {
  return (instance ??= build());
}
