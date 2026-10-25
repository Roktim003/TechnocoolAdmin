"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { Notification } from "@/components/ui/Notification";
import { Tag } from "@/components/ui/Tag";
import { formatDateTime } from "@/shared/time/format";
import { retryJobAction } from "@/modules/system/interface/actions";
import styles from "../../system/_components/system.module.css";
import jobStyles from "./jobs.module.css";

interface Counts {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: number;
}

interface FailedJob {
  id: string;
  name: string;
  error: string;
  attempts: number;
  maxAttempts: number;
  failedAt: string | null;
  createdAt: string | null;
}

export interface JobsData {
  queues: { name: string; label: string; counts: Counts }[];
  failedLastHour: number;
  threshold: number;
  selected: string;
  page: number;
  pageSize: number;
  failed: { items: FailedJob[]; total: number };
}

const num = (n: number) => n.toLocaleString("en-US");

export function JobsView({ data }: { data: JobsData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ kind: "success" | "error"; title: string; message?: string } | null>(null);
  const selected = data.queues.find((q) => q.name === data.selected);
  const pages = Math.max(1, Math.ceil(data.failed.total / data.pageSize));
  const over = data.failedLastHour > data.threshold;

  const retry = (job: FailedJob) =>
    startTransition(async () => {
      const r = await retryJobAction(data.selected, job.id);
      setNotice(r.ok ? { kind: "success", title: `Job ${job.id} queued again`, message: "It runs in the background; refresh to see the result." } : { kind: "error", title: "Could not retry the job", message: r.error.message });
      router.refresh();
    });

  return (
    <div className={styles.stack}>
      {over ? (
        <Notification kind="error" title={`${data.failedLastHour} jobs failed in the last hour`}>
          That is more than the alert threshold ({data.threshold}). Admins were notified. Check the errors below.
        </Notification>
      ) : (
        <p className={styles.help}>
          {data.failedLastHour} failed in the last hour (Admins are alerted above {data.threshold}).
        </p>
      )}
      {notice ? (
        <Notification kind={notice.kind} title={notice.title} onClose={() => setNotice(null)}>
          {notice.message}
        </Notification>
      ) : null}

      <DataTable
        caption="Queues"
        rowKey={(q) => q.name}
        rows={data.queues}
        columns={[
          {
            key: "queue",
            header: "Queue",
            render: (q) => (
              <Link href={`/admin/jobs?queue=${encodeURIComponent(q.name)}`} className={jobStyles.link} aria-current={q.name === data.selected ? "true" : undefined}>
                {q.label}
              </Link>
            ),
          },
          { key: "waiting", header: "Waiting", align: "end", render: (q) => num(q.counts.waiting + q.counts.delayed) },
          { key: "active", header: "Running", align: "end", render: (q) => num(q.counts.active) },
          { key: "completed", header: "Completed", align: "end", render: (q) => num(q.counts.completed) },
          { key: "failed", header: "Failed", align: "end", render: (q) => (q.counts.failed ? <Tag kind="red">{num(q.counts.failed)}</Tag> : "0") },
        ]}
      />

      <section className={styles.panel} aria-labelledby="failed-title">
        <h2 id="failed-title" className={styles.panelTitle}>
          Failed jobs · {selected?.label ?? data.selected}
        </h2>
        <DataTable
          caption={`Failed jobs in ${selected?.label ?? data.selected}`}
          rowKey={(j) => j.id}
          rows={data.failed.items}
          emptyMessage="No failed jobs in this queue."
          columns={[
            { key: "when", header: "Failed at", render: (j) => formatDateTime(j.failedAt) },
            { key: "job", header: "Job", render: (j) => <span className="mono">{`${j.name} · ${j.id}`}</span> },
            { key: "error", header: "Error", render: (j) => <span className={styles.note}>{j.error}</span> },
            { key: "attempts", header: "Attempts", align: "end", render: (j) => `${j.attempts} / ${j.maxAttempts}` },
            {
              key: "retry",
              header: <span className="visually-hidden">Actions</span>,
              align: "end",
              render: (j) => (
                <Button kind="ghost" size="sm" disabled={pending} onClick={() => retry(j)}>
                  Retry
                </Button>
              ),
            },
          ]}
        />
        {pages > 1 ? (
          <nav className={jobStyles.pager} aria-label="Failed jobs pages">
            {data.page > 1 ? <Link href={`/admin/jobs?queue=${data.selected}&page=${data.page - 1}`}>Previous</Link> : null}
            <span>
              Page {data.page} of {pages}
            </span>
            {data.page < pages ? <Link href={`/admin/jobs?queue=${data.selected}&page=${data.page + 1}`}>Next</Link> : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
