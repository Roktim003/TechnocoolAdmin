import type { Readable } from "node:stream";
import type { IntegrityCheckResult, OpsTrigger, RestoreTestView } from "../domain/types";
import type { LocalBackups, OffsiteBackups } from "../infrastructure/backup-storage";
import { decryptStream } from "../infrastructure/backup-crypto";
import { withDatabase } from "../infrastructure/pg-tools";
import type { AdminNotifier, OpsLogger, OpsStore } from "./ports";

export interface RestoredInspection {
  rowCounts: Record<string, number>;
  integrity: IntegrityCheckResult[];
  latestEntryDate: string | null;
  migrations: number;
}

export interface RestoreTestDeps {
  store: OpsStore;
  local: LocalBackups;
  offsite: OffsiteBackups | null;
  encryptionKey: string | undefined;
  /** The live database URL (the temporary database is created on the same server). */
  databaseUrl: string;
  admin: { createDatabase(name: string): Promise<void>; dropDatabase(name: string): Promise<void> };
  restore(url: string, input: Readable): Promise<void>;
  inspect(url: string): Promise<RestoredInspection>;
  notifier: AdminNotifier;
  log: OpsLogger;
  now?: () => Date;
}

/** Tables that must never come back empty from a backup of a working system. */
const CORE_TABLES = ["Role", "Warehouse", "User"];

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 2000);

/**
 * Proves the latest backup can be restored: restore it into a temporary database on the same
 * server, run sanity checks (row counts, the integrity checks, the latest entry date), drop the
 * temporary database and record the result. Admins are notified when it fails.
 */
export class RestoreTestService {
  constructor(private readonly d: RestoreTestDeps) {}

  private now() {
    return this.d.now?.() ?? new Date();
  }

  async run(trigger: OpsTrigger, requestedById: string | null = null): Promise<RestoreTestView["details"] & { passed: boolean }> {
    const runId = await this.d.store.startRestoreTest(trigger, requestedById);
    const stamp = this.now().toISOString().replace(/\D/g, "").slice(0, 14);
    const tempDb = `sb_restore_test_${stamp}`;
    let created = false;
    let backupFile: string | null = null;
    try {
      const { name, source } = await this.latestBackup();
      backupFile = name;
      if (name.endsWith(".enc") && !this.d.encryptionKey) throw new Error("The latest backup is encrypted but BACKUP_ENCRYPTION_KEY is not set.");

      await this.d.admin.createDatabase(tempDb);
      created = true;
      const started = Date.now();
      const input = await source();
      await this.d.restore(withDatabase(this.d.databaseUrl, tempDb), name.endsWith(".enc") ? input.pipe(decryptStream(this.d.encryptionKey!)) : input);
      const restoreMs = Date.now() - started;

      const inspection = await this.d.inspect(withDatabase(this.d.databaseUrl, tempDb));
      const backupCounts = ((await this.d.store.latestSuccessfulBackup())?.details as { rowCounts?: Record<string, number> } | null)?.rowCounts ?? null;
      const problems: string[] = [];
      for (const t of CORE_TABLES) if (!inspection.rowCounts[t]) problems.push(`${t} is empty in the restored copy`);
      if (backupCounts && backupFile) {
        for (const [table, n] of Object.entries(backupCounts)) if (n > 0 && !inspection.rowCounts[table]) problems.push(`${table} had ${n} rows at backup time but none were restored`);
      }
      const failedChecks = inspection.integrity.filter((c) => !c.passed);
      for (const c of failedChecks) problems.push(`Integrity: ${c.label} (${c.problems} problem${c.problems === 1 ? "" : "s"})`);
      const passed = problems.length === 0;
      const details = { backupFile, restoreMs, ...inspection, backupRowCounts: backupCounts, problems };

      await this.d.store.finishRestoreTest(runId, { status: passed ? "SUCCEEDED" : "FAILED", backupFile, details, error: passed ? null : problems.join("; ").slice(0, 2000), finishedAt: this.now() });
      if (!passed) await this.d.notifier.notify("RESTORE_TEST_FAILED", "Restore test failed", `The backup ${backupFile} was restored, but: ${problems.slice(0, 3).join("; ")}`, "/admin/system");
      this.d.log.info({ backupFile, passed, restoreMs }, "restore test finished");
      return { ...details, passed };
    } catch (err) {
      await this.d.store.finishRestoreTest(runId, { status: "FAILED", backupFile, error: message(err), finishedAt: this.now() });
      await this.d.notifier.notify("RESTORE_TEST_FAILED", "Restore test failed", `The latest backup${backupFile ? ` (${backupFile})` : ""} could not be restored: ${message(err)}`, "/admin/system");
      throw err;
    } finally {
      if (created) await this.d.admin.dropDatabase(tempDb).catch((err) => this.d.log.error({ err, tempDb }, "could not drop the restore-test database"));
    }
  }

  /** The newest backup: from this server, or from off-site when there is none locally. */
  private async latestBackup(): Promise<{ name: string; source: () => Promise<Readable> }> {
    const local = (await this.d.local.list())[0];
    if (local) return { name: local.name, source: async () => this.d.local.read(local.name) };
    const remote = this.d.offsite ? (await this.d.offsite.list())[0] : undefined;
    if (remote) return { name: remote.name, source: () => this.d.offsite!.download(remote.name) };
    throw new Error("There is no backup to test yet. Run a backup first.");
  }
}
