import type { Job } from "bullmq";
import { env } from "@/shared/config/env";
import { prisma } from "@/shared/db/prisma";
import type { Logger } from "@/shared/logger/logger";
import { getQueue, QUEUES } from "@/shared/queue/queue";
import { EmailSender, NotificationService } from "../application/notification.service";
import type { EmailJob, EmailQueue, Mailer, PushJob, PushQueue, PushSender } from "../application/ports";
import { PushDeviceService, PushDispatcher } from "../application/push.service";
import { fcmPushSender } from "../infrastructure/fcm-push-sender";
import { prismaNotificationStore, prismaPushDeviceStore, prismaRecipientDirectory } from "../infrastructure/prisma-notification.store";
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

let pushOverride: PushSender | null = null;
let defaultPush: PushSender | null = null;
/** Tests replace Firebase Cloud Messaging. */
export function setPushSender(s: PushSender | null) {
  pushOverride = s;
}
const pushSender = () => pushOverride ?? (defaultPush ??= fcmPushSender({ account: env().FCM_SERVICE_ACCOUNT }));

/** One job per phone, so a retry never pushes twice to the phones that already got it. */
const bullPushQueue: PushQueue = {
  enabled: () => pushSender().configured,
  async enqueue(jobs) {
    await getQueue(QUEUES.push).addBulk(
      jobs.map((data) => ({
        name: "send",
        data,
        opts: { attempts: 4, backoff: { type: "exponential", delay: 5_000 }, removeOnComplete: { age: 24 * 3600 }, removeOnFail: { age: 7 * 24 * 3600 } },
      })),
    );
  },
};

/** Composition root of the notifications module (reusable by every module). */
function build() {
  const store = prismaNotificationStore(prisma);
  const devices = prismaPushDeviceStore(prisma);
  return {
    service: new NotificationService({ store, queue: bullEmailQueue, appUrl: () => env().APP_URL, devices, push: bullPushQueue }),
    sender: new EmailSender({ store, mailer, loadFile: (key) => storage().get(key) }),
    recipients: prismaRecipientDirectory(prisma),
    devices: new PushDeviceService({ devices }),
    push: new PushDispatcher({ devices, notifications: store, sender: pushSender }),
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

/** BullMQ processor for the `push` queue (worker). Temporary FCM errors throw, so BullMQ retries. */
export async function processPushJob(job: Job, log: Logger) {
  const data = job.data as PushJob;
  const { outcome, error } = await notifications().push.send(data);
  const entry = { jobId: job.id, deviceId: data.deviceId, userId: data.userId, type: data.type, attempt: job.attemptsMade + 1, outcome, error };
  if (outcome === "FAILED") log.warn(entry, "push rejected");
  else log.info(entry, "push processed");
  return outcome;
}
