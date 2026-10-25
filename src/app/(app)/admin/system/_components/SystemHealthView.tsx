"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { Notification } from "@/components/ui/Notification";
import { Tag, type TagKind } from "@/components/ui/Tag";
import { formatDateTime } from "@/shared/time/format";
import { runBackupNowAction, runIntegrityCheckAction, runRestoreTestAction } from "@/modules/system/interface/actions";
import styles from "./system.module.css";

type State = "ok" | "warning" | "error" | "not_configured";

interface Tile {
  key: string;
  title: string;
  state: State;
  value: string;
  detail?: string | null;
  at?: string | null;
}

interface Run {
  id: string;
  trigger: "SCHEDULED" | "MANUAL" | "PRE_MIGRATION";
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

interface BackupRun extends Run {
  fileName: string | null;
  sizeBytes: number | null;
  encrypted: boolean;
  offsite: boolean;
  offsiteError: string | null;
}

interface RestoreRun extends Run {
  backupFile: string | null;
  details: { restoreMs?: number; latestEntryDate?: string | null; rowCounts?: Record<string, number>; problems?: string[] } | null;
}

interface Check {
  key: string;
  label: string;
  passed: boolean;
  problems: number;
  details: Record<string, string | number | null>[];
}

export interface HealthSnapshot {
  app: { version: string; commit: string; environment: string; startedAt: string; uptimeSeconds: number };
  tiles: Tile[];
  warnings: { key: string; message: string }[];
  backups: BackupRun[];
  restoreTests: RestoreRun[];
  integrity: (Run & { passed: boolean | null; checks: Check[] }) | null;
  workers: { id: string; host: string; pid: number; queues: string[]; at: string; startedAt: string; rssMb: number; heapMb: number; version: string; fresh: boolean }[];
  backupLocation: { local: string; offsite: string | null };
}

const STATE_TAG: Record<State, { kind: TagKind; label: string }> = {
  ok: { kind: "green", label: "OK" },
  warning: { kind: "yellow", label: "Check" },
  error: { kind: "red", label: "Problem" },
  not_configured: { kind: "gray", label: "Not set up yet" },
};

const STATUS_TAG: Record<Run["status"], { kind: TagKind; label: string }> = {
  RUNNING: { kind: "blue", label: "Running" },
  SUCCEEDED: { kind: "green", label: "Done" },
  FAILED: { kind: "red", label: "Failed" },
};

const TRIGGER: Record<Run["trigger"], string> = { SCHEDULED: "Scheduled", MANUAL: "Manual", PRE_MIGRATION: "Before an update" };

function bytes(n: number | null) {
  if (n === null) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? v : v.toFixed(1)} ${u[i]}`;
}

export function SystemHealthView({ snapshot }: { snapshot: HealthSnapshot }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ kind: "success" | "error" | "info"; title: string; message?: string } | null>(null);
  const [openCheck, setOpenCheck] = useState<string | null>(null);

  const run = (label: string, action: () => Promise<{ ok: true; data: { alreadyQueued: boolean } } | { ok: false; error: { message: string } }>) =>
    startTransition(async () => {
      const r = await action();
      if (r.ok) setNotice({ kind: "success", title: r.data.alreadyQueued ? `${label} is already queued` : `${label} started`, message: "The worker runs it in the background. Refresh this page in a minute to see the result." });
      else setNotice({ kind: "error", title: `Could not start: ${label.toLowerCase()}`, message: r.error.message });
      router.refresh();
    });

  const integrity = snapshot.integrity;

  return (
    <div className={styles.stack}>
      <div className={styles.actions} data-print="hide">
        <Button kind="primary" size="sm" disabled={pending} onClick={() => run("Backup", runBackupNowAction)}>
          Back up now
        </Button>
        <Button kind="secondary" size="sm" disabled={pending} onClick={() => run("Restore test", runRestoreTestAction)}>
          Test restore
        </Button>
        <Button kind="secondary" size="sm" disabled={pending} onClick={() => run("Integrity check", runIntegrityCheckAction)}>
          Check integrity now
        </Button>
        <Button kind="ghost" size="sm" disabled={pending} onClick={() => router.refresh()}>
          Refresh
        </Button>
      </div>

      {notice ? (
        <Notification kind={notice.kind} title={notice.title} onClose={() => setNotice(null)}>
          {notice.message}
        </Notification>
      ) : null}

      {snapshot.warnings.length ? (
        <section className={styles.panel} aria-labelledby="warnings-title">
          <h2 id="warnings-title" className={styles.panelTitle}>
            Needs attention ({snapshot.warnings.length})
          </h2>
          <ul className={styles.warnings}>
            {snapshot.warnings.map((w) => (
              <li key={w.key} className={styles.warnItem}>
                {w.message}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <Notification kind="success" title="Everything is set up and working." />
      )}

      <div className={styles.tiles}>
        {snapshot.tiles.map((t) => (
          <section key={t.key} className={`${styles.tile} ${styles[t.state]}`} aria-label={t.title}>
            <div className={styles.tileHead}>
              <span className={styles.tileTitle}>{t.title}</span>
              <Tag kind={STATE_TAG[t.state].kind}>{STATE_TAG[t.state].label}</Tag>
            </div>
            <span className={styles.tileValue}>{t.value}</span>
            {t.detail ? <span className={styles.tileDetail}>{t.detail}</span> : null}
            {t.at ? <span className={styles.tileDetail}>{formatDateTime(t.at)}</span> : null}
          </section>
        ))}
      </div>

      <section className={styles.panel} aria-labelledby="integrity-title">
        <h2 id="integrity-title" className={styles.panelTitle}>
          Integrity checks {integrity ? <span className={styles.muted}>· {formatDateTime(integrity.startedAt)}</span> : null}
        </h2>
        <p className={styles.help}>Every night at 2:30 AM the ledger is checked. Problems are only reported; nothing is changed.</p>
        {integrity?.error ? <Notification kind="error" title="The check could not run">{integrity.error}</Notification> : null}
        <DataTable
          caption="Integrity checks"
          rowKey={(c) => c.key}
          rows={integrity?.checks ?? []}
          emptyMessage="No integrity check has run yet."
          columns={[
            { key: "check", header: "Check", render: (c) => c.label },
            { key: "result", header: "Result", render: (c) => (c.passed ? <Tag kind="green">Passed</Tag> : <Tag kind="red">{`${c.problems} problem${c.problems === 1 ? "" : "s"}`}</Tag>) },
            {
              key: "details",
              header: <span className="visually-hidden">Details</span>,
              align: "end",
              render: (c) =>
                c.passed ? null : (
                  <Button kind="ghost" size="sm" onClick={() => setOpenCheck(openCheck === c.key ? null : c.key)} aria-expanded={openCheck === c.key}>
                    {openCheck === c.key ? "Hide details" : "Show details"}
                  </Button>
                ),
            },
          ]}
        />
        {integrity?.checks
          .filter((c) => c.key === openCheck && c.details.length)
          .map((c) => (
            <div key={c.key} className={styles.details}>
              <p className={styles.help}>
                {c.label}: first {c.details.length} of {c.problems}.
              </p>
              <DataTable
                caption={`Problems: ${c.label}`}
                rowKey={(r) => JSON.stringify(r)}
                rows={c.details}
                columns={Object.keys(c.details[0]!).map((k) => ({ key: k, header: k, render: (r: Record<string, string | number | null>) => String(r[k] ?? "—") }))}
              />
            </div>
          ))}
      </section>

      <section className={styles.panel} aria-labelledby="backups-title">
        <h2 id="backups-title" className={styles.panelTitle}>
          Backups
        </h2>
        <p className={styles.help}>
          Every night at 2:00 AM and before every update. Kept: 14 daily, 8 weekly, 12 monthly. On this server: <code>{snapshot.backupLocation.local}</code>
          {snapshot.backupLocation.offsite ? (
            <>
              {" "}
              · off-site: <code>{snapshot.backupLocation.offsite}</code>
            </>
          ) : (
            " · off-site: not set up yet"
          )}
        </p>
        <DataTable
          caption="Recent backups"
          rowKey={(b) => b.id}
          rows={snapshot.backups}
          emptyMessage="No backup has been made yet."
          columns={[
            { key: "when", header: "Started", render: (b) => formatDateTime(b.startedAt) },
            { key: "trigger", header: "Type", render: (b) => TRIGGER[b.trigger] },
            { key: "status", header: "Status", render: (b) => <Tag kind={STATUS_TAG[b.status].kind}>{STATUS_TAG[b.status].label}</Tag> },
            { key: "size", header: "Size", align: "end", render: (b) => bytes(b.sizeBytes) },
            { key: "where", header: "Where", render: (b) => (b.status !== "SUCCEEDED" ? "—" : b.offsite ? "Local + off-site" : "Local only") },
            { key: "enc", header: "Encrypted", render: (b) => (b.status !== "SUCCEEDED" ? "—" : b.encrypted ? "Yes" : "No") },
            { key: "note", header: "Note", render: (b) => <span className={styles.note}>{b.error ?? b.offsiteError ?? b.fileName ?? ""}</span> },
          ]}
        />
      </section>

      <section className={styles.panel} aria-labelledby="restore-title">
        <h2 id="restore-title" className={styles.panelTitle}>
          Restore tests
        </h2>
        <p className={styles.help}>On the 1st of every month the latest backup is restored into a temporary database, checked, and deleted again.</p>
        <DataTable
          caption="Recent restore tests"
          rowKey={(r) => r.id}
          rows={snapshot.restoreTests}
          emptyMessage="No restore test has been run yet."
          columns={[
            { key: "when", header: "Started", render: (r) => formatDateTime(r.startedAt) },
            { key: "trigger", header: "Type", render: (r) => TRIGGER[r.trigger] },
            { key: "status", header: "Result", render: (r) => <Tag kind={STATUS_TAG[r.status].kind}>{r.status === "SUCCEEDED" ? "Passed" : STATUS_TAG[r.status].label}</Tag> },
            { key: "file", header: "Backup", render: (r) => <span className={styles.note}>{r.backupFile ?? "—"}</span> },
            { key: "latest", header: "Latest entry", render: (r) => r.details?.latestEntryDate ?? "—" },
            { key: "took", header: "Restore time", align: "end", render: (r) => (r.details?.restoreMs ? `${(r.details.restoreMs / 1000).toFixed(1)} s` : "—") },
            { key: "note", header: "Problems", render: (r) => <span className={styles.note}>{r.error ?? ""}</span> },
          ]}
        />
      </section>

      <section className={styles.panel} aria-labelledby="workers-title">
        <h2 id="workers-title" className={styles.panelTitle}>
          Worker processes
        </h2>
        <DataTable
          caption="Worker processes"
          rowKey={(w) => w.id}
          rows={snapshot.workers}
          emptyMessage="No worker heartbeat: start the worker service."
          columns={[
            { key: "host", header: "Process", render: (w) => `${w.host} (pid ${w.pid})` },
            { key: "state", header: "Status", render: (w) => (w.fresh ? <Tag kind="green">Running</Tag> : <Tag kind="red">Not responding</Tag>) },
            { key: "beat", header: "Last heartbeat", render: (w) => formatDateTime(w.at) },
            { key: "mem", header: "Memory", align: "end", render: (w) => `${w.rssMb} MB` },
            { key: "queues", header: "Queues", render: (w) => <span className={styles.note}>{w.queues.join(", ")}</span> },
          ]}
        />
      </section>
    </div>
  );
}
