import type { Heartbeat } from "@/shared/lifecycle/heartbeat";
import type { BackupRunView, HealthTile, HealthWarning, IntegrityRunView, RestoreTestView } from "../domain/types";
import type { OpsStore } from "./ports";

export interface EmailStatus {
  configured: boolean;
  lastSentAt: Date | null;
  lastError: { at: Date; message: string | null } | null;
  notSentLast7Days: number;
  queued: number;
}

export interface HealthDeps {
  store: OpsStore;
  app: () => { version: string; commit: string; environment: string; startedAt: Date };
  config: () => {
    email: boolean;
    offsiteBackup: boolean;
    offsiteLocation: string | null;
    backupEncryption: boolean;
    errorTracking: boolean;
    backupDir: string;
    appUrlHttps: boolean;
    cookieSecure: boolean;
    production: boolean;
  };
  databaseBytes: () => Promise<number>;
  storageUsage: () => Promise<{ objects: number; bytes: number } | null>;
  email: () => Promise<EmailStatus>;
  heartbeats: () => Promise<Heartbeat[]>;
  heartbeatMaxAgeMs: number;
  now?: () => Date;
}

const DAY = 86_400_000;

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

/** The System health page: tiles plus a list of everything not set up yet or failing. */
export class HealthService {
  constructor(private readonly d: HealthDeps) {}

  async snapshot() {
    const now = this.d.now?.() ?? new Date();
    const app = this.d.app();
    const cfg = this.d.config();
    const [dbBytes, storage, email, beats, backups, restores, integrity] = await Promise.all([
      this.d.databaseBytes().catch(() => null),
      this.d.storageUsage().catch(() => null),
      this.d.email(),
      this.d.heartbeats().catch(() => [] as Heartbeat[]),
      this.d.store.latestBackups(10),
      this.d.store.latestRestoreTests(5),
      this.d.store.latestIntegrity(5),
    ]);
    const lastBackup = backups[0] ?? null;
    const lastGoodBackup = backups.find((b) => b.status === "SUCCEEDED") ?? null;
    const lastRestore = restores[0] ?? null;
    const lastIntegrity = integrity[0] ?? null;
    const worker = beats[0];
    const workerFresh = !!worker && now.getTime() - Date.parse(worker.at) < this.d.heartbeatMaxAgeMs;
    const uptimeSeconds = Math.floor((now.getTime() - app.startedAt.getTime()) / 1000);

    const tiles: HealthTile[] = [
      { key: "version", title: "App version", state: "ok", value: `${app.version} (${app.commit.slice(0, 7)})`, detail: `Up ${formatDuration(uptimeSeconds)} · ${app.environment}`, at: app.startedAt.toISOString() },
      { key: "database", title: "Database size", state: dbBytes === null ? "error" : "ok", value: formatBytes(dbBytes), detail: dbBytes === null ? "Could not read the database size" : null },
      { key: "storage", title: "File storage used", state: storage ? "ok" : "warning", value: storage ? formatBytes(storage.bytes) : "—", detail: storage ? `${storage.objects.toLocaleString("en-US")} files` : "Could not read the storage bucket" },
      this.backupTile(lastBackup, lastGoodBackup, cfg, now),
      this.restoreTile(lastRestore, now),
      this.integrityTile(lastIntegrity, now),
      this.emailTile(email),
      {
        key: "worker",
        title: "Background worker",
        state: workerFresh ? "ok" : "error",
        value: worker ? (workerFresh ? "Running" : "Not responding") : "No heartbeat",
        detail: worker ? `${beats.length} process${beats.length === 1 ? "" : "es"} · ${worker.rssMb} MB · ${worker.queues.join(", ")}` : "Start the worker service",
        at: worker?.at ?? null,
      },
    ];

    const warnings: HealthWarning[] = [];
    if (!cfg.email) warnings.push({ key: "email", message: "Email is not set up yet: emails are logged (Not sent) but nobody receives them. In-app notifications work. Fill in SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM." });
    if (!cfg.offsiteBackup) warnings.push({ key: "offsite", message: "Off-site backup not set up yet: backups are only on this server. Fill in BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_KEY and BACKUP_S3_SECRET." });
    if (!cfg.backupEncryption) warnings.push({ key: "encryption", message: "Backup encryption key not set: backups on this server are not encrypted and none can be copied off-site. Fill in BACKUP_ENCRYPTION_KEY (32+ random characters) and keep a copy somewhere safe." });
    if (!cfg.errorTracking) warnings.push({ key: "sentry", message: "Error tracking not set up yet: errors are only in the server logs. Fill in SENTRY_DSN to get alerts." });
    if (cfg.production && !cfg.appUrlHttps) warnings.push({ key: "https", message: "APP_URL is not https: put the app behind HTTPS before go-live (HSTS is off until then)." });
    if (cfg.production && !cfg.cookieSecure) warnings.push({ key: "cookies", message: "COOKIE_SECURE is false: login cookies can travel over plain http. Set it to true once the app is on https." });
    if (!workerFresh) warnings.push({ key: "worker", message: "The background worker is not sending heartbeats: emails, PDFs, exports, backups and checks are not running." });
    if (!lastGoodBackup || now.getTime() - lastGoodBackup.startedAt.getTime() > 26 * 3600_000) warnings.push({ key: "backup_age", message: lastGoodBackup ? "The last successful backup is more than a day old." : "No backup has been made yet." });
    if (lastBackup?.status === "FAILED") warnings.push({ key: "backup_failed", message: `The last backup failed: ${lastBackup.error ?? "unknown error"}` });
    if (lastBackup?.offsiteError) warnings.push({ key: "backup_offsite", message: lastBackup.offsiteError });
    if (!lastRestore) warnings.push({ key: "restore_none", message: "No restore test has been run yet. Run one after the first backup." });
    else if (lastRestore.status === "FAILED") warnings.push({ key: "restore_failed", message: `The last restore test failed: ${lastRestore.error ?? "unknown error"}` });
    else if (now.getTime() - lastRestore.startedAt.getTime() > 35 * DAY) warnings.push({ key: "restore_age", message: "The last restore test is more than a month old." });
    if (lastIntegrity && (lastIntegrity.status === "FAILED" || lastIntegrity.passed === false)) warnings.push({ key: "integrity", message: "The last integrity check found problems. See the details below." });
    if (email.configured && email.lastError && (!email.lastSentAt || email.lastError.at > email.lastSentAt)) warnings.push({ key: "email_error", message: `The last email failed: ${email.lastError.message ?? "unknown error"}` });

    return {
      app: { ...app, startedAt: app.startedAt.toISOString(), uptimeSeconds },
      tiles,
      warnings,
      backups,
      restoreTests: restores,
      integrity: lastIntegrity,
      workers: beats.map((b) => ({ ...b, fresh: now.getTime() - Date.parse(b.at) < this.d.heartbeatMaxAgeMs })),
      email,
      backupLocation: { local: cfg.backupDir, offsite: cfg.offsiteLocation },
    };
  }

  private backupTile(last: BackupRunView | null, good: BackupRunView | null, cfg: ReturnType<HealthDeps["config"]>, now: Date): HealthTile {
    if (!last) return { key: "backup", title: "Last backup", state: "warning", value: "Never", detail: "Backups run at 2:00 AM, or press Back up now" };
    const failed = last.status === "FAILED";
    const stale = !good || now.getTime() - good.startedAt.getTime() > 26 * 3600_000;
    const where = good?.offsite ? "Local + off-site" : cfg.offsiteBackup ? "Local only (off-site copy missing)" : "Local only";
    return {
      key: "backup",
      title: "Last backup",
      state: failed ? "error" : stale || !good?.offsite ? "warning" : "ok",
      value: failed ? "Failed" : last.status === "RUNNING" ? "Running…" : formatBytes(good?.sizeBytes),
      detail: failed ? last.error : `${where}${good?.encrypted ? " · encrypted" : " · not encrypted"}`,
      at: (good ?? last).startedAt.toISOString(),
    };
  }

  private restoreTile(last: RestoreTestView | null, now: Date): HealthTile {
    if (!last) return { key: "restore", title: "Last restore test", state: "warning", value: "Never", detail: "Runs monthly, or press Test restore" };
    const age = now.getTime() - last.startedAt.getTime();
    return {
      key: "restore",
      title: "Last restore test",
      state: last.status === "FAILED" ? "error" : age > 35 * DAY ? "warning" : last.status === "RUNNING" ? "warning" : "ok",
      value: last.status === "SUCCEEDED" ? "Passed" : last.status === "FAILED" ? "Failed" : "Running…",
      detail: last.status === "FAILED" ? last.error : last.backupFile,
      at: last.startedAt.toISOString(),
    };
  }

  private integrityTile(last: IntegrityRunView | null, now: Date): HealthTile {
    if (!last) return { key: "integrity", title: "Last integrity check", state: "warning", value: "Never", detail: "Runs at 2:30 AM, or press Check now" };
    const failed = last.checks.filter((c) => !c.passed);
    const stale = now.getTime() - last.startedAt.getTime() > 26 * 3600_000;
    return {
      key: "integrity",
      title: "Last integrity check",
      state: last.status === "FAILED" || last.passed === false ? "error" : stale ? "warning" : last.status === "RUNNING" ? "warning" : "ok",
      value: last.status === "RUNNING" ? "Running…" : last.status === "FAILED" ? "Could not run" : last.passed ? "Passed" : `${failed.length} check${failed.length === 1 ? "" : "s"} failed`,
      detail: last.status === "FAILED" ? last.error : `${last.checks.length - failed.length} of ${last.checks.length} checks passed`,
      at: last.startedAt.toISOString(),
    };
  }

  private emailTile(e: EmailStatus): HealthTile {
    if (!e.configured) return { key: "email", title: "Email", state: "not_configured", value: "Not set up yet", detail: `${e.notSentLast7Days} email${e.notSentLast7Days === 1 ? "" : "s"} not sent in the last 7 days` };
    const failing = e.lastError && (!e.lastSentAt || e.lastError.at > e.lastSentAt);
    return {
      key: "email",
      title: "Email",
      state: failing ? "error" : "ok",
      value: failing ? "Failing" : "Working",
      detail: failing ? e.lastError!.message : e.lastSentAt ? `Last sent ${e.lastSentAt.toISOString()}` : "Nothing sent yet",
      at: (failing ? e.lastError!.at : e.lastSentAt)?.toISOString() ?? null,
    };
  }
}
