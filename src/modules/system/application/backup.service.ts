import { createHash } from "node:crypto";
import { PassThrough, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { backupName, backupsToKeep, type RetentionPolicy } from "../domain/retention";
import type { BackupRunView, OpsTrigger } from "../domain/types";
import type { LocalBackups, OffsiteBackups } from "../infrastructure/backup-storage";
import { encryptStream } from "../infrastructure/backup-crypto";
import type { AdminNotifier, DatabaseDumper, OpsLogger, OpsStore } from "./ports";

export interface BackupDeps {
  store: OpsStore;
  dumper: DatabaseDumper;
  local: LocalBackups;
  /** Null when off-site storage is not set up yet. */
  offsite: OffsiteBackups | null;
  /** BACKUP_ENCRYPTION_KEY; without it dumps are stored unencrypted and never sent off-site. */
  encryptionKey: string | undefined;
  policy: RetentionPolicy;
  /** The attachments bucket, synced off-site after each backup. */
  attachmentsBucket: string;
  notifier: AdminNotifier;
  log: OpsLogger;
  now?: () => Date;
}

export interface BackupResult {
  run: Partial<BackupRunView> & { fileName: string; sizeBytes: number; encrypted: boolean; offsite: boolean };
  location: "local" | "local+offsite";
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 2000);

/**
 * One backup: pg_dump -Fc → (encrypt) → BACKUP_DIR, then the off-site copy, retention in both
 * places, and the attachment sync. Failures are recorded and Admins are notified.
 */
export class BackupService {
  constructor(private readonly d: BackupDeps) {}

  private now() {
    return this.d.now?.() ?? new Date();
  }

  async run(trigger: OpsTrigger, requestedById: string | null = null): Promise<BackupResult> {
    const runId = await this.d.store.startBackup(trigger, requestedById);
    const encrypted = !!this.d.encryptionKey;
    const name = backupName(this.now(), trigger, encrypted);
    const details: Record<string, unknown> = {};
    let sizeBytes = 0;

    try {
      details.rowCounts = await this.d.store.rowCounts().catch(() => null);
      const w = await this.d.local.writer(name);
      const sha = createHash("sha256");
      const hashing = new Transform({
        transform(chunk: Buffer, _e, cb) {
          sha.update(chunk);
          cb(null, chunk);
        },
      });
      const dump = new PassThrough();
      try {
        const dumping = this.d.dumper.dump(dump).catch((err: unknown) => {
          dump.destroy(err as Error); // ends the pipeline too
          throw err;
        });
        await Promise.all([dumping, encrypted ? pipeline(dump, encryptStream(this.d.encryptionKey!), hashing, w.stream) : pipeline(dump, hashing, w.stream)]);
        sizeBytes = await w.commit();
      } catch (err) {
        await w.abort();
        throw err;
      }
      details.sha256 = sha.digest("hex");
      this.d.log.info({ file: name, sizeBytes, encrypted }, "backup written");
    } catch (err) {
      await this.d.store.finishBackup(runId, { status: "FAILED", error: message(err), finishedAt: this.now(), details });
      await this.d.notifier.notify("BACKUP_FAILED", "Database backup failed", `The ${trigger.toLowerCase().replace("_", "-")} backup could not be made: ${message(err)}`, "/admin/system");
      throw err;
    }

    // Off-site copy (only encrypted dumps leave the server).
    let offsite = false;
    let offsiteError: string | null = null;
    if (this.d.offsite) {
      if (!encrypted) offsiteError = "Not copied off-site: set BACKUP_ENCRYPTION_KEY so backups are encrypted first.";
      else {
        try {
          await this.d.offsite.upload(name, this.d.local.pathOf(name), sizeBytes);
          offsite = true;
        } catch (err) {
          offsiteError = `Off-site copy failed: ${message(err)}`;
        }
      }
    }

    // Retention in both places; then the attachments.
    details.retention = await this.applyRetention().catch((err) => ({ error: message(err) }));
    if (this.d.offsite) {
      details.attachments = await this.d.offsite.syncAttachments(this.d.attachmentsBucket).catch((err) => {
        offsiteError = [offsiteError, `Attachment sync failed: ${message(err)}`].filter(Boolean).join(" ");
        return null;
      });
    }

    await this.d.store.finishBackup(runId, { status: "SUCCEEDED", fileName: name, sizeBytes, encrypted, offsite, offsiteError, finishedAt: this.now(), details });
    if (offsiteError && this.d.offsite) {
      await this.d.notifier.notify("BACKUP_FAILED", "Off-site backup copy failed", `The backup ${name} was saved on this server, but: ${offsiteError}`, "/admin/system");
    }
    return { run: { fileName: name, sizeBytes, encrypted, offsite, offsiteError, details }, location: offsite ? "local+offsite" : "local" };
  }

  /** Deletes backups outside the 14 daily / 8 weekly / 12 monthly window, locally and off-site. */
  async applyRetention(): Promise<{ localDeleted: string[]; offsiteDeleted: string[] }> {
    const local = await this.d.local.list();
    const keepLocal = backupsToKeep(local, this.d.policy);
    const localDeleted = local.filter((f) => !keepLocal.has(f.name)).map((f) => f.name);
    await this.d.local.delete(localDeleted);

    let offsiteDeleted: string[] = [];
    if (this.d.offsite) {
      const remote = await this.d.offsite.list();
      const keepRemote = backupsToKeep(remote, this.d.policy);
      offsiteDeleted = remote.filter((f) => !keepRemote.has(f.name)).map((f) => f.name);
      await this.d.offsite.delete(offsiteDeleted);
    }
    return { localDeleted, offsiteDeleted };
  }
}
