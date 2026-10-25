import type { ListQuery } from "@/shared/pagination/list-query";
import type { ModuleKey, PermissionLevel, SensitiveFlag } from "@/shared/rbac/levels";

export interface NotificationRecord {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationFilters {
  unread?: boolean;
  type?: string;
}

export interface Recipient {
  id: string;
  name: string;
  email: string | null;
}

export interface NotificationStore {
  create(rows: { userId: string; type: string; title: string; body: string; link: string | null }[]): Promise<void>;
  list(userId: string, q: ListQuery<NotificationFilters>): Promise<{ items: NotificationRecord[]; total: number }>;
  unreadCount(userId: string): Promise<number>;
  markRead(userId: string, id: string): Promise<NotificationRecord | null>;
  markAllRead(userId: string): Promise<number>;
  /** Explicit email choices (types without a row use the type's default). */
  preferences(userIds: string[], type?: string): Promise<{ userId: string; type: string; email: boolean }[]>;
  setPreferences(userId: string, prefs: { type: string; email: boolean }[]): Promise<void>;
  /** Active users among the ids, with their email address. */
  recipients(userIds: string[]): Promise<Recipient[]>;
  createEmailLog(data: { to: string; subject: string; type: string | null }): Promise<string>;
  updateEmailLog(id: string, data: { status?: "QUEUED" | "SENT" | "FAILED" | "NOT_SENT_SMTP_MISSING"; attempts?: number; error?: string | null; sentAt?: Date | null }): Promise<void>;
}

/** Who should hear about something (active users only). */
export interface RecipientDirectory {
  /** Users whose role has `module` ≥ `level`, optionally only those scoped to `warehouseId`. */
  withModuleLevel(module: ModuleKey, level: PermissionLevel, opts?: { warehouseId?: string; exclude?: (string | null | undefined)[] }): Promise<string[]>;
  withRoles(roleIds: string[]): Promise<string[]>;
  /** Active users whose role has a sensitive-data flag (e.g. seeMargin), optionally also module ≥ level. */
  withFlag(flag: SensitiveFlag, opts?: { module?: ModuleKey; level?: PermissionLevel; exclude?: (string | null | undefined)[] }): Promise<string[]>;
}

/** A file in private storage, attached when the worker sends the email. */
export interface EmailAttachment {
  filename: string;
  fileKey: string;
  contentType: string;
}

export interface EmailMessage {
  to: string;
  cc?: string | null;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}

export interface EmailFile {
  filename: string;
  content: Uint8Array;
  contentType: string;
}

export interface EmailJob extends EmailMessage {
  emailLogId: string;
}

export interface EmailQueue {
  enqueue(job: EmailJob): Promise<void>;
}

export interface Mailer {
  /** False when SMTP isn't configured: emails are logged as NOT_SENT_SMTP_MISSING. */
  readonly configured: boolean;
  send(message: EmailMessage, files?: EmailFile[]): Promise<void>;
}
