/** Operations: backups, restore tests, integrity checks, system health, background jobs. */

export type OpsTrigger = "SCHEDULED" | "MANUAL" | "PRE_MIGRATION";
export type OpsRunStatus = "RUNNING" | "SUCCEEDED" | "FAILED";

export interface IntegrityCheckResult {
  key: string;
  label: string;
  passed: boolean;
  /** Number of rows that failed the check. */
  problems: number;
  /** Up to 50 example rows. */
  details: Record<string, string | number | null>[];
}

export interface BackupRunView {
  id: string;
  trigger: OpsTrigger;
  status: OpsRunStatus;
  fileName: string | null;
  sizeBytes: number | null;
  encrypted: boolean;
  offsite: boolean;
  offsiteError: string | null;
  error: string | null;
  details: unknown;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface RestoreTestView {
  id: string;
  trigger: OpsTrigger;
  status: OpsRunStatus;
  backupFile: string | null;
  details: unknown;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface IntegrityRunView {
  id: string;
  trigger: OpsTrigger;
  status: OpsRunStatus;
  passed: boolean | null;
  checks: IntegrityCheckResult[];
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

/** Queues shown on the Background jobs page, with a plain-English name. */
export const QUEUE_LABELS: Record<string, string> = {
  email: "Email",
  reports: "Reports & exports",
  documents: "PDF documents",
  "catalog-import": "Product imports",
  "opening-import": "Opening-stock imports",
  backups: "Backups & restore tests",
  integrity: "Integrity checks",
  alerts: "Low-stock alerts",
  purchasing: "Purchasing digests",
  projects: "Project cost alerts",
  system: "System",
};

export type HealthState = "ok" | "warning" | "error" | "not_configured";

export interface HealthTile {
  key: string;
  title: string;
  state: HealthState;
  value: string;
  detail?: string | null;
  at?: string | null;
}

export interface HealthWarning {
  key: string;
  message: string;
}
