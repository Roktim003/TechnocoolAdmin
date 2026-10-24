"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { TextField } from "@/components/ui/Field";
import { Notification } from "@/components/ui/Notification";
import { Pagination } from "@/components/ui/Pagination";
import { Tag } from "@/components/ui/Tag";
import { api, errorMessage } from "@/lib/api-client";
import { formatMoney } from "@/shared/time/format";
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TAG, PROJECT_STATUSES, type ProjectDto, type ProjectsCaps, type ProjectStatus } from "./types";
import styles from "./projects.module.css";

interface ListResult {
  data: ProjectDto[];
  meta: { page: number; pageSize: number; total: number; statusCounts: Record<ProjectStatus, number> };
}

/** "Contract x · Margin y (z%)": margin in red when negative (seeMargin only). */
export function MarginStrip({ p }: { p: ProjectDto }) {
  const s = p.summary;
  if (s.contractValue === undefined) return null;
  if (s.contractValue === null) return <div className={styles.strip}>No contract value set</div>;
  const negative = s.margin?.startsWith("-");
  return (
    <div className={styles.strip}>
      Contract {formatMoney(s.contractValue)} · Margin{" "}
      {s.margin === undefined ? (
        "—"
      ) : (
        <span className={negative ? styles.negative : undefined}>
          {formatMoney(s.margin)}
          {s.marginPercent ? ` (${s.marginPercent}%)` : ""}
        </span>
      )}
    </div>
  );
}

const dates = (p: ProjectDto) => (p.startDate || p.expectedEndDate ? `${p.startDate ?? "—"} → ${p.expectedEndDate ?? "—"}` : "No dates yet");

export function ProjectBrowser({ caps }: { caps: ProjectsCaps }) {
  const [status, setStatus] = useState<ProjectStatus | "">("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [result, setResult] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await api<ListResult>("/projects", { query: { page, pageSize, q: debouncedQ, status, sort: "-code" } }));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedQ, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = result?.meta.statusCounts;
  const all = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null;
  const chip = (key: ProjectStatus | "", label: string, n: number | null | undefined) => (
    <button
      key={key || "all"}
      type="button"
      className={`${styles.chip} ${status === key ? styles.chipOn : ""}`}
      aria-pressed={status === key}
      onClick={() => {
        setStatus(key);
        setPage(1);
      }}
    >
      {label}
      {n !== null && n !== undefined ? ` (${n})` : ""}
    </button>
  );

  return (
    <div>
      <div className={styles.bar}>
        <div className={styles.chips} role="group" aria-label="Filter by status">
          {chip("", "All", all)}
          {PROJECT_STATUSES.map((s) => chip(s, PROJECT_STATUS_LABEL[s], counts?.[s]))}
        </div>
        <TextField label="Search" placeholder="Code, name or client…" value={q} onChange={(e) => setQ(e.target.value)} fieldClassName={styles.search} />
      </div>
      {error ? <Notification kind="error" title="Could not load projects">{error}</Notification> : null}
      {result && !result.data.length ? (
        <div className={styles.empty}>{debouncedQ || status ? "No projects match." : caps.canCreate ? "No projects yet. Create one with “+ New project”." : "No projects yet."}</div>
      ) : (
        <div className={styles.grid} aria-busy={loading || undefined}>
          {(result?.data ?? []).map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className={styles.card} aria-label={`${p.code} ${p.name}`}>
              <div className={styles.cardTop}>
                <span className={styles.code}>{p.code}</span>
                <Tag kind={PROJECT_STATUS_TAG[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Tag>
              </div>
              <h2 className={styles.name}>{p.name}</h2>
              <div className={styles.meta}>
                {p.clientName ?? "—"} · {dates(p)}
              </div>
              {caps.seeCost && p.summary.totalCost !== undefined ? (
                <div className={styles.figures}>
                  <Figure label="Material" value={p.summary.netMaterialCost} />
                  <Figure label="Other costs" value={sumOther(p)} />
                  <Figure label="Total cost" value={p.summary.totalCost} />
                </div>
              ) : null}
              <MarginStrip p={p} />
            </Link>
          ))}
        </div>
      )}
      {result && result.meta.total > pageSize ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <Pagination page={page} pageSize={pageSize} pageSizes={[12, 24, 48, 96]} total={result.meta.total} onChange={(pg, s) => (setPage(pg), setPageSize(s))} />
        </div>
      ) : null}
    </div>
  );
}

function sumOther(p: ProjectDto) {
  const s = p.summary;
  const cents = [s.labourCost, s.transportCost, s.otherCost].reduce((a, v) => a + Math.round(Number(v ?? 0) * 100), 0);
  return (cents / 100).toFixed(2);
}

function Figure({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <div className={styles.figLabel}>{label}</div>
      <div className={styles.figValue}>{formatMoney(value)}</div>
    </div>
  );
}
