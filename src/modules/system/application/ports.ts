import type { Writable } from "node:stream";
import type { BackupRunView, IntegrityCheckResult, IntegrityRunView, OpsTrigger, RestoreTestView } from "../domain/types";

/* Ports of the operations module. Implemented in infrastructure/, wired in interface/container.ts. */

export interface OpsStore {
  /** Null when the table doesn't exist yet (the pre-migration backup of a brand-new database). */
  startBackup(trigger: OpsTrigger, requestedById: string | null): Promise<string | null>;
  finishBackup(id: string | null, data: Partial<Omit<BackupRunView, "id" | "trigger" | "startedAt">>): Promise<void>;
  latestBackups(limit: number): Promise<BackupRunView[]>;
  latestSuccessfulBackup(): Promise<BackupRunView | null>;

  startRestoreTest(trigger: OpsTrigger, requestedById: string | null): Promise<string>;
  finishRestoreTest(id: string, data: Partial<Omit<RestoreTestView, "id" | "trigger" | "startedAt">>): Promise<void>;
  latestRestoreTests(limit: number): Promise<RestoreTestView[]>;

  startIntegrity(trigger: OpsTrigger, requestedById: string | null): Promise<string>;
  finishIntegrity(id: string, data: { status: "SUCCEEDED" | "FAILED"; passed: boolean | null; checks: IntegrityCheckResult[]; error: string | null }): Promise<void>;
  latestIntegrity(limit: number): Promise<IntegrityRunView[]>;

  /** Row counts of the main tables (backup details, restore-test comparison). */
  rowCounts(): Promise<Record<string, number>>;
}

export interface AdminNotifier {
  notify(type: "BACKUP_FAILED" | "RESTORE_TEST_FAILED" | "INTEGRITY_CHECK_FAILED" | "BACKGROUND_JOBS_FAILING", title: string, body: string, link: string): Promise<void>;
}

export interface DatabaseDumper {
  /** pg_dump -Fc of the live database into `out`. */
  dump(out: Writable): Promise<void>;
}

export interface OpsLogger {
  info(o: object, msg: string): void;
  warn(o: object, msg: string): void;
  error(o: object, msg: string): void;
}
