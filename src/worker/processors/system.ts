import type { Job } from "bullmq";
import type { Logger } from "@/shared/logger/logger";
import type { SystemJobs } from "@/shared/queue/queue";

export async function processSystemJob(job: Job, log: Logger): Promise<unknown> {
  switch (job.name) {
    case "ping": {
      const data = job.data as SystemJobs["ping"];
      log.info({ jobId: job.id, message: data.message }, "ping job processed");
      return { pong: true, message: data.message, requestedAt: data.requestedAt, processedAt: new Date().toISOString() };
    }
    default:
      throw new Error(`Unknown system job: ${job.name}`);
  }
}
