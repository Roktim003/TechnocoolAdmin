import type { Job } from "bullmq";
import type { Logger } from "@/shared/logger/logger";
import type { OpeningImportJob } from "../application/opening.service";
import { inventory } from "./container";
import { digestScheduler } from "./events";

/** BullMQ processor for the `opening-import` queue (worker): validates an uploaded file. */
export async function processOpeningImportJob(job: Job, log: Logger) {
  const r = await inventory().openings.runValidation(job.data as OpeningImportJob);
  log.info({ jobId: job.id, importId: r.id, status: r.status, rows: r.totalRows, errors: r.errors.length }, "opening import validated");
  return { status: r.status, errors: r.errors.length };
}

/** Worker start: (re)creates the daily low-stock digest schedule from the alert settings. */
export async function ensureDigestSchedule(log: Logger) {
  const s = (await inventory().alerts.settings()) as { digestEnabled: boolean; digestTime: string; lowStockRoleIds: string[] };
  await digestScheduler.schedule(s);
  log.info({ enabled: s.digestEnabled, time: s.digestTime }, "low-stock digest scheduled");
}
