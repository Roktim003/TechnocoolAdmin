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

/** A stored choice; null means the type's default. */
export interface PreferenceRow {
  userId: string;
  type: string;
  email: boolean | null;
  push: boolean | null;
}

export interface NotificationStore {
  /** Returns the new rows' ids (one per user). */
  create(rows: { userId: string; type: string; title: string; body: string; link: string | null }[]): Promise<{ id: string; userId: string }[]>;
  list(userId: string, q: ListQuery<NotificationFilters>): Promise<{ items: NotificationRecord[]; total: number }>;
  unreadCount(userId: string): Promise<number>;
  markRead(userId: string, id: string): Promise<NotificationRecord | null>;
  markAllRead(userId: string): Promise<number>;
  /** Explicit choices (types without a row, or a null channel, use the type's default). */
  preferences(userIds: string[], type?: string): Promise<PreferenceRow[]>;
  /** Changes only the channels given. */
  setPreferences(userId: string, prefs: PreferenceChange[]): Promise<void>;
  /** Active users among the ids, with their email address. */
  recipients(userIds: string[]): Promise<Recipient[]>;
  createEmailLog(data: { to: string; subject: string; type: string | null }): Promise<string>;
  updateEmailLog(id: string, data: { status?: "QUEUED" | "SENT" | "FAILED" | "SKIPPED"; attempts?: number; error?: string | null; sentAt?: Date | null }): Promise<void>;
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
  /** False when SMTP isn't configured: emails are logged as SKIPPED. */
  readonly configured: boolean;
  send(message: EmailMessage, files?: EmailFile[]): Promise<void>;
}

export interface PreferenceChange {
  type: string;
  email?: boolean;
  push?: boolean;
}

/* ── push (mobile app) ── */

export type PushPlatform = "ANDROID" | "IOS";

export interface PushDeviceRecord {
  id: string;
  userId: string;
  platform: PushPlatform;
  deviceName: string | null;
  appVersion: string | null;
  lastSeenAt: Date;
  createdAt: Date;
}

export interface PushDeviceStore {
  /**
   * Adds the token, or moves it to this user (a phone that signs in as someone else) and refreshes
   * it. Keeps at most `max` devices per user by dropping the least recently seen.
   */
  register(userId: string, data: { token: string; platform: PushPlatform; deviceName: string | null; appVersion: string | null }, max: number): Promise<{ device: PushDeviceRecord; created: boolean }>;
  list(userId: string): Promise<PushDeviceRecord[]>;
  /** Deletes one of the user's own devices; false when there is no such device. */
  remove(userId: string, id: string): Promise<boolean>;
  /** Device ids of these users (to fan out a notification). */
  deviceIdsOf(userIds: string[]): Promise<{ id: string; userId: string }[]>;
  /** With the token, for the worker. */
  device(id: string): Promise<{ id: string; userId: string; token: string } | null>;
  /** FCM said the token is dead. */
  removeDevice(id: string): Promise<void>;
}

/** One push to one phone (a BullMQ job). The token is read at send time, so moves and sign-outs apply. */
export interface PushJob {
  deviceId: string;
  userId: string;
  notificationId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
}

export interface PushQueue {
  /** False when push isn't configured: nothing is queued. */
  enabled(): boolean;
  enqueue(jobs: PushJob[]): Promise<void>;
}

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  /** String values only (FCM data payload). */
  data: Record<string, string>;
  /** iOS app-icon badge: the user's unread count. */
  badge?: number;
}

export type PushResult = { ok: true } | { ok: false; error: string; invalidToken: boolean; retryable: boolean };

export interface PushSender {
  /** False when FCM_SERVICE_ACCOUNT isn't set. */
  readonly configured: boolean;
  send(message: PushMessage): Promise<PushResult>;
}
