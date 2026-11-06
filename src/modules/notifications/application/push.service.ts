import { NotFoundError } from "@/shared/errors/app-error";
import type { NotificationStore, PushDeviceStore, PushJob, PushPlatform, PushSender } from "./ports";

/** Phones per user; registering another drops the one seen least recently. */
export const MAX_PUSH_DEVICES = 10;

/** The signed-in user's phones (the mobile app registers its FCM token on start and sign-in). */
export class PushDeviceService {
  constructor(private readonly d: { devices: PushDeviceStore }) {}

  register(userId: string, input: { token: string; platform: PushPlatform; deviceName?: string; appVersion?: string }) {
    return this.d.devices.register(userId, { token: input.token, platform: input.platform, deviceName: input.deviceName ?? null, appVersion: input.appVersion ?? null }, MAX_PUSH_DEVICES);
  }

  list(userId: string) {
    return this.d.devices.list(userId);
  }

  /** Sign-out on the phone: stop pushing to it. Only the user's own devices. */
  async remove(userId: string, id: string) {
    if (!(await this.d.devices.remove(userId, id))) throw new NotFoundError("Push device");
  }
}

export type PushOutcome =
  /** Delivered to FCM. */
  | "SENT"
  /** Push isn't configured. */
  | "SKIPPED"
  /** The phone was unregistered or signed in as someone else since the job was queued. */
  | "GONE"
  /** FCM says the token is dead: the device was removed. */
  | "INVALID_TOKEN"
  /** Rejected for a reason a retry won't fix (logged). */
  | "FAILED";

/** Sends one queued push (worker). Throws on temporary errors so BullMQ retries with backoff. */
export class PushDispatcher {
  constructor(private readonly d: { devices: PushDeviceStore; notifications: NotificationStore; sender: () => PushSender }) {}

  async send(job: PushJob): Promise<{ outcome: PushOutcome; error?: string }> {
    const sender = this.d.sender();
    if (!sender.configured) return { outcome: "SKIPPED" };
    const device = await this.d.devices.device(job.deviceId);
    if (!device || device.userId !== job.userId) return { outcome: "GONE" };

    const data: Record<string, string> = { notificationId: job.notificationId, type: job.type };
    if (job.link) data.link = job.link;
    const badge = await this.d.notifications.unreadCount(job.userId);
    const r = await sender.send({ token: device.token, title: job.title, body: job.body, data, badge });
    if (r.ok) return { outcome: "SENT" };
    if (r.invalidToken) {
      await this.d.devices.removeDevice(device.id);
      return { outcome: "INVALID_TOKEN", error: r.error };
    }
    if (r.retryable) throw new Error(r.error);
    return { outcome: "FAILED", error: r.error };
  }
}
