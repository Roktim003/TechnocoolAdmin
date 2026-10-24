import { NotFoundError, ValidationError } from "@/shared/errors/app-error";
import type { ListQuery } from "@/shared/pagination/list-query";
import { NOTIFICATION_TYPES, notificationType } from "../domain/types";
import { renderEmail, type EmailContent } from "./email-template";
import type { EmailFile, EmailJob, EmailQueue, Mailer, NotificationFilters, NotificationStore } from "./ports";

export interface PublishInput {
  type: string;
  userIds: (string | null | undefined)[];
  title: string;
  body: string;
  /** App path, e.g. /stock/123 (the email uses the absolute URL). */
  link?: string | null;
  /** Email content; defaults to title + body + a button to the link. */
  email?: Partial<EmailContent> & { subject?: string };
}

export class NotificationService {
  constructor(private readonly d: { store: NotificationStore; queue: EmailQueue; appUrl: () => string }) {}

  /**
   * Creates in-app notifications (unless the type is email-only) and queues an email for each
   * recipient whose preference allows it. Never throws for one bad recipient.
   */
  async publish(input: PublishInput): Promise<{ notified: number; emailed: number }> {
    const def = notificationType(input.type);
    if (!def) throw new Error(`Unknown notification type ${input.type}`);
    const ids = [...new Set(input.userIds.filter((x): x is string => !!x))];
    if (!ids.length) return { notified: 0, emailed: 0 };

    const recipients = await this.d.store.recipients(ids);
    if (!recipients.length) return { notified: 0, emailed: 0 };
    if (def.inApp) await this.d.store.create(recipients.map((r) => ({ userId: r.id, type: def.key, title: input.title, body: input.body, link: input.link ?? null })));

    const chosen = new Map((await this.d.store.preferences(recipients.map((r) => r.id), def.key)).map((p) => [p.userId, p.email]));
    const link = input.link ? `${this.d.appUrl().replace(/\/$/, "")}${input.link}` : null;
    const { html, text } = renderEmail({ title: input.title, paragraphs: [input.body], link, ...input.email });
    let emailed = 0;
    for (const r of recipients) {
      if (!r.email || !(chosen.get(r.id) ?? def.defaultEmail)) continue;
      await this.queueEmail({ to: r.email, subject: input.email?.subject ?? input.title, html, text }, def.key);
      emailed++;
    }
    return { notified: def.inApp ? recipients.length : 0, emailed };
  }

  /** Writes the EmailLog row (QUEUED) and puts the email on the queue. */
  async queueEmail(m: Omit<EmailJob, "emailLogId">, type: string | null): Promise<string> {
    const emailLogId = await this.d.store.createEmailLog({ to: m.to, subject: m.subject, type });
    await this.d.queue.enqueue({ ...m, emailLogId });
    return emailLogId;
  }

  /* ── inbox ── */

  list(userId: string, q: ListQuery<NotificationFilters>) {
    return this.d.store.list(userId, q);
  }
  unreadCount(userId: string) {
    return this.d.store.unreadCount(userId);
  }
  async markRead(userId: string, id: string) {
    const n = await this.d.store.markRead(userId, id);
    if (!n) throw new NotFoundError("Notification");
    return n;
  }
  markAllRead(userId: string) {
    return this.d.store.markAllRead(userId);
  }

  /* ── preferences ── */

  async preferences(userId: string) {
    const chosen = new Map((await this.d.store.preferences([userId])).map((p) => [p.type, p.email]));
    return NOTIFICATION_TYPES.map((t) => ({ type: t.key, label: t.label, description: t.description, inApp: t.inApp, email: chosen.get(t.key) ?? t.defaultEmail }));
  }

  async updatePreferences(userId: string, prefs: { type: string; email: boolean }[]) {
    const unknown = prefs.filter((p) => !notificationType(p.type));
    if (unknown.length) throw new ValidationError("Unknown notification type.", unknown.map((p) => ({ path: "preferences", message: `Unknown type ${p.type}.` })));
    await this.d.store.setPreferences(userId, prefs);
    return this.preferences(userId);
  }
}

/** Sends one queued email (worker). Throws on failure so BullMQ retries with backoff. */
export class EmailSender {
  constructor(private readonly d: { store: NotificationStore; mailer: () => Mailer; loadFile?: (key: string) => Promise<{ body: Uint8Array } | null> }) {}

  async send(job: EmailJob, attempt: number, maxAttempts: number): Promise<"SENT" | "SKIPPED"> {
    const mailer = this.d.mailer();
    if (!mailer.configured) {
      await this.d.store.updateEmailLog(job.emailLogId, { status: "SKIPPED", attempts: attempt, error: "SMTP is not configured (SMTP_HOST is empty)." });
      return "SKIPPED";
    }
    try {
      const files: EmailFile[] = [];
      for (const a of job.attachments ?? []) {
        const obj = await this.d.loadFile?.(a.fileKey);
        if (!obj) throw new Error(`Attachment ${a.filename} is not in storage.`);
        files.push({ filename: a.filename, content: obj.body, contentType: a.contentType });
      }
      await mailer.send(job, files);
      await this.d.store.updateEmailLog(job.emailLogId, { status: "SENT", attempts: attempt, error: null, sentAt: new Date() });
      return "SENT";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.d.store.updateEmailLog(job.emailLogId, { status: attempt >= maxAttempts ? "FAILED" : "QUEUED", attempts: attempt, error: message.slice(0, 1000) });
      throw err;
    }
  }
}
