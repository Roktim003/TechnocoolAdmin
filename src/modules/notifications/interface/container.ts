import type { Job } from "bullmq";
import { env } from "@/shared/config/env";
import { prisma } from "@/shared/db/prisma";
import type { Logger } from "@/shared/logger/logger";
import { getQueue, QUEUES } from "@/shared/queue/queue";
import { EmailSender, NotificationService } from "../application/notification.service";
import type { EmailJob, EmailQueue, Mailer } from "../application/ports";
import { prismaNotificationStore, prismaRecipientDirectory } from "../infrastructure/prisma-notification.store";
import { smtpMailer } from "../infrastructure/smtp-mailer";
import { storage } from "@/shared/storage/storage";

/** Emails go out only through the `email` queue: retries with exponential backoff. */
const bullEmailQueue: EmailQueue = {
  async enqueue(job) {
    const e = env();
    await getQueue(QUEUES.email).add("send", job, {
      attempts: e.EMAIL_MAX_ATTEMPTS,
      backoff: { type: "exponential", delay: e.EMAIL_RETRY_DELAY_MS },
      removeOnComplete: { age: 7 * 24 * 3600 },
      removeOnFail: { age: 30 * 24 * 3600 },
    });
  },
};

let mailerOverride: Mailer | null = null;
let defaultMailer: Mailer | null = null;
/** Tests replace the SMTP transport. */
export function setMailer(m: Mailer | null) {
  mailerOverride = m;
}
const mailer = () => mailerOverride ?? (defaultMailer ??= smtpMailer());

/** Composition root of the notifications module (reusable by every module). */
function build() {
  const store = prismaNotificationStore(prisma);
  return {
    service: new NotificationService({ store, queue: bullEmailQueue, appUrl: () => env().APP_URL }),
    sender: new EmailSender({ store, mailer, loadFile: (key) => storage().get(key) }),
    recipients: prismaRecipientDirectory(prisma),
  };
}

let instance: ReturnType<typeof build> | undefined;

export function notifications() {
  return (instance ??= build());
}

/** BullMQ processor for the `email` queue (worker). */
export async function processEmailJob(job: Job, log: Logger) {
  const data = job.data as EmailJob;
  const attempt = job.attemptsMade + 1;
  const max = job.opts.attempts ?? 1;
  const result = await notifications().sender.send(data, attempt, max);
  log.info({ jobId: job.id, to: data.to, attempt, result }, "email processed");
  return result;
}
