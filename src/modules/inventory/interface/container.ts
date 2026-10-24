import { prisma } from "@/shared/db/prisma";
import { getQueue, QUEUES } from "@/shared/queue/queue";
import { storage } from "@/shared/storage/storage";
import { AlertService } from "../application/alerts.service";
import { AttachmentService } from "../application/attachment.service";
import { CountService } from "../application/count.service";
import { EntryService } from "../application/entry.service";
import { MastersService } from "../application/masters.service";
import { OpeningImportService, type OpeningImportQueue } from "../application/opening.service";
import { StockPostingService } from "../application/posting.service";
import { StockQueryService } from "../application/stock-query.service";
import { prismaAlertUnitOfWork } from "../infrastructure/prisma-alerts.store";
import { prismaInventoryUnitOfWork } from "../infrastructure/prisma-inventory.store";
import { prismaProjectQuery } from "../infrastructure/prisma-project-query";
import { openingSheets } from "../infrastructure/stock-excel";
import { alertNotifier, digestScheduler, inventoryEvents } from "./events";

const openingQueue: OpeningImportQueue = {
  async enqueue(job) {
    await getQueue(QUEUES.openingImport).add("validate", job, { jobId: job.importId, attempts: 1, removeOnComplete: { age: 24 * 3600 }, removeOnFail: { age: 24 * 3600 } });
  },
};

/** Composition root of the inventory module. */
function build() {
  const uow = prismaInventoryUnitOfWork(prisma);
  const posting = new StockPostingService();
  const events = inventoryEvents;
  const entries = new EntryService({ uow, posting, events });
  const files = storage();
  return {
    uow,
    posting,
    entries,
    masters: new MastersService({ uow }),
    stock: new StockQueryService({ uow }),
    attachments: new AttachmentService({ uow, files, entries }),
    counts: new CountService({ uow, posting, events }),
    openings: new OpeningImportService({ uow, posting, files, sheets: openingSheets, queue: openingQueue, events }),
    alerts: new AlertService({
      uow: prismaAlertUnitOfWork(prisma),
      notifier: alertNotifier,
      scheduler: digestScheduler,
      audit: (actor, e) => uow.store.audit.record(actor, { action: e.action, entityType: "AlertSettings", entityId: null, before: e.before, after: e.after }),
    }),
    /** Read-only stock data for the projects module. */
    projectQuery: prismaProjectQuery(prisma),
    files,
  };
}

let instance: ReturnType<typeof build> | undefined;

export function inventory() {
  return (instance ??= build());
}
