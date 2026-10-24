"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Chart } from "@/components/charts/Chart";
import { Button } from "@/components/ui/Button";
import { Notification } from "@/components/ui/Notification";
import { Pagination } from "@/components/ui/Pagination";
import { Tag } from "@/components/ui/Tag";
import { api, errorMessage } from "@/lib/api-client";
import { formatBdt, formatCell, isNegative } from "@/modules/reporting/domain/format";
import { DATE_TOKENS, isDateToken } from "@/modules/reporting/domain/schedule";
import { FilterFields } from "./FilterFields";
import { cleanFilters, withDefaults, type ColumnDef, type Lookups, type ReportInfo, type RunResult } from "./types";
import styles from "./reports.module.css";

interface ExportState {
  jobId: string;
  format: "xlsx" | "pdf";
  status: "queued" | "processing" | "completed" | "failed";
  downloadUrl?: string | null;
  fileName?: string | null;
  failedReason?: string | null;
}

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function ReportView({
  report,
  lookups,
  filters,
  page,
  pageSize,
  sort,
  onChange,
  onSchedule,
}: {
  report: ReportInfo;
  lookups: Lookups | null;
  filters: Record<string, string>;
  page: number;
  pageSize: number;
  sort: string;
  onChange: (next: { filters: Record<string, string>; page: number; pageSize: number; sort: string }) => void;
  onSchedule: (params: Record<string, string>) => void;
}) {
  const router = useRouter();
  const applied = withDefaults(report.params, filters);
  const [draft, setDraft] = useState<Record<string, string>>(applied);
  const [result, setResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exports, setExports] = useState<ExportState[]>([]);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const appliedKey = JSON.stringify(applied);
  const timers = useRef<number[]>([]);

  useEffect(() => setDraft(JSON.parse(appliedKey) as Record<string, string>), [appliedKey]);
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api<RunResult>(`/reports/${report.id}/run`, { query: { ...JSON.parse(appliedKey), page, pageSize, sort: sort || undefined } })
      .then((r) => alive && setResult(r))
      .catch((err) => alive && setError(errorMessage(err)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [report.id, appliedKey, page, pageSize, sort]);

  const columns = result?.report.columns ?? report.columns;
  const totals = result?.report.totals ?? report.totals;
  const rowAction = result?.report.rowAction ?? report.rowAction;
  const rows = result?.data ?? [];
  const sortKey = (sort || report.defaultSort).split(",")[0] ?? "";
  const apply = (next: Record<string, string>) => onChange({ filters: cleanFilters(report.params, next), page: 1, pageSize, sort });

  function toggleSort(c: ColumnDef) {
    if (!c.sortKey) return;
    const current = sortKey.replace(/^-/, "") === c.sortKey ? (sortKey.startsWith("-") ? "desc" : "asc") : null;
    const next = current === "asc" ? `-${c.sortKey}` : current === "desc" ? "" : c.align === "end" ? `-${c.sortKey}` : c.sortKey;
    onChange({ filters: cleanFilters(report.params, applied), page: 1, pageSize, sort: next });
  }

  async function startExport(format: "xlsx" | "pdf") {
    try {
      const r = await api<{ data: { jobId: string } }>(`/reports/${report.id}/exports`, { method: "POST", body: { format, params: cleanFilters(report.params, applied), ...(sort ? { sort } : {}) }, headers: { "Idempotency-Key": newKey() } });
      const job: ExportState = { jobId: r.data.jobId, format, status: "queued" };
      setExports((x) => [job, ...x].slice(0, 3));
      poll(job.jobId, 0);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function poll(jobId: string, attempt: number) {
    const t = window.setTimeout(async () => {
      try {
        const s = (await api<{ data: ExportState }>(`/exports/${jobId}`)).data;
        setExports((x) => x.map((e) => (e.jobId === jobId ? { ...e, ...s } : e)));
        if (s.status !== "completed" && s.status !== "failed" && attempt < 300) poll(jobId, attempt + 1);
      } catch (err) {
        setExports((x) => x.map((e) => (e.jobId === jobId ? { ...e, status: "failed", failedReason: errorMessage(err) } : e)));
      }
    }, Math.min(1000 + attempt * 200, 3000));
    timers.current.push(t);
  }

  async function createPo(productId: string) {
    setBusyRow(productId);
    try {
      const r = (await api<{ data: { created: { id: string }[]; unassigned: unknown[] } }>("/purchase-orders/from-low-stock", { method: "POST", body: { productIds: [productId], warehouseId: applied.warehouseId || null }, headers: { "Idempotency-Key": newKey() } })).data;
      if (r.created[0]) router.push(`/purchases/${r.created[0].id}/edit`);
      else router.push("/purchases/new");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyRow(null);
    }
  }

  const filterSummary = report.params
    .filter((p) => applied[p.key])
    .map((p) => {
      const v = applied[p.key]!;
      const label = isDateToken(v) ? DATE_TOKENS[v] : p.options?.find((o) => o.value === v)?.label ?? lookupName(lookups, p.kind, v) ?? v;
      return `${p.label}: ${label}`;
    });

  return (
    <article className={`${styles.report} ${report.landscape ? styles.landscape : ""}`}>
      <header className={styles.reportHead}>
        <div>
          <p className={styles.eyebrow}>
            {report.number} · {report.group}
          </p>
          <h2 className={styles.reportTitle}>{report.title}</h2>
          <p className={styles.reportDescription}>{report.description}</p>
          <p className={styles.printOnly}>{filterSummary.length ? filterSummary.join(" · ") : "No filters"}</p>
        </div>
        <div className={`${styles.actions} ${styles.noPrint}`}>
          <Button kind="secondary" size="sm" onClick={() => void startExport("xlsx")}>
            Excel
          </Button>
          <Button kind="secondary" size="sm" onClick={() => void startExport("pdf")}>
            PDF
          </Button>
          <Button kind="secondary" size="sm" onClick={() => window.print()}>
            Print
          </Button>
          <Button kind="primary" size="sm" onClick={() => onSchedule(cleanFilters(report.params, applied))}>
            Email on schedule
          </Button>
        </div>
      </header>

      {exports.map((e) => (
        <div key={e.jobId} className={styles.noPrint}>
          <Notification
            kind={e.status === "completed" ? "success" : e.status === "failed" ? "error" : "info"}
            title={e.status === "completed" ? `${e.format === "xlsx" ? "Excel" : "PDF"} ready` : e.status === "failed" ? "Export failed" : `Preparing ${e.format === "xlsx" ? "Excel" : "PDF"}…`}
            onClose={() => setExports((x) => x.filter((y) => y.jobId !== e.jobId))}
          >
            {e.status === "completed" && e.downloadUrl ? (
              <>
                <a href={e.downloadUrl}>Download {e.fileName}</a> — the link works for 1 hour.
              </>
            ) : e.status === "failed" ? (
              e.failedReason
            ) : (
              "The file is generated in the background; you can keep working."
            )}
          </Notification>
        </div>
      ))}

      {report.params.length ? (
        <form
          className={`${styles.filters} ${styles.noPrint}`}
          onSubmit={(e) => {
            e.preventDefault();
            apply(draft);
          }}
        >
          <FilterFields params={report.params} values={draft} lookups={lookups} onChange={(k, v) => setDraft((d) => ({ ...d, [k]: v }))} />
          <div className={styles.filterButtons}>
            <Button type="submit" size="sm">
              Apply
            </Button>
            <Button kind="ghost" size="sm" onClick={() => apply({})}>
              Reset
            </Button>
          </div>
        </form>
      ) : null}

      {error ? (
        <Notification kind="error" title="The report could not run" onClose={() => setError(null)}>
          {error}
        </Notification>
      ) : null}

      {totals.length && result ? (
        <div className={styles.tiles}>
          {totals.map((t) => (
            <div key={t.key} className={styles.tile}>
              <span className={styles.tileLabel}>{t.label}</span>
              <span className={`${styles.tileValue} ${isNegative(result.totals[t.key]) ? styles.negative : ""}`}>{t.type === "money" ? formatBdt(result.totals[t.key]) : formatCell(t, result.totals[t.key])}</span>
            </div>
          ))}
        </div>
      ) : null}

      {result?.chart ? <Chart chart={result.chart} /> : null}

      <div className={styles.tableTile}>
        <div className={styles.scroll} role="region" aria-label={`${report.title} rows`} tabIndex={0}>
          <table className={styles.table} aria-busy={loading || undefined}>
            <thead>
              <tr>
                {columns.map((c) => {
                  const active = c.sortKey && sortKey.replace(/^-/, "") === c.sortKey;
                  return (
                    <th key={c.key} scope="col" className={c.align === "end" ? styles.end : undefined} aria-sort={active ? (sortKey.startsWith("-") ? "descending" : "ascending") : undefined}>
                      {c.sortKey ? (
                        <button type="button" className={styles.sortButton} onClick={() => toggleSort(c)}>
                          {c.label}
                          <span aria-hidden="true" className={styles.sortIcon}>
                            {active ? (sortKey.startsWith("-") ? "↓" : "↑") : "↕"}
                          </span>
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  );
                })}
                {rowAction ? <th scope="col" className={`${styles.end} ${styles.noPrint}`}><span className="visually-hidden">Actions</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {loading && !rows.length ? (
                <tr>
                  <td colSpan={columns.length + 1} className={styles.message}>
                    Loading…
                  </td>
                </tr>
              ) : !rows.length ? (
                <tr>
                  <td colSpan={columns.length + 1} className={styles.message}>
                    <strong>No rows for these filters.</strong>
                    <br />
                    Try a wider date range or another warehouse.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={`${r._id ?? ""}-${i}`} className={loading ? styles.stale : undefined}>
                    {columns.map((c) => (
                      <td key={c.key} className={[c.align === "end" ? styles.end : "", c.negativeRed && isNegative(r[c.key]) ? styles.negative : ""].filter(Boolean).join(" ") || undefined}>
                        <Cell c={c} value={r[c.key]} href={c.link ? r._links?.[c.key] : undefined} />
                      </td>
                    ))}
                    {rowAction ? (
                      <td className={`${styles.end} ${styles.noPrint}`}>
                        {rowAction.kind === "createPo" && r._id ? (
                          <Button kind="ghost" size="sm" disabled={busyRow === r._id} onClick={() => void createPo(r._id!)}>
                            {rowAction.label}
                          </Button>
                        ) : r._links?._action ? (
                          <Link href={r._links._action} className={styles.rowLink}>
                            {rowAction.label}
                          </Link>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {result && result.meta.total > 0 ? (
          <div className={styles.noPrint}>
            <Pagination page={result.meta.page} pageSize={result.meta.pageSize} total={result.meta.total} pageSizes={[25, 50, 100, 200]} onChange={(p, s) => onChange({ filters: cleanFilters(report.params, applied), page: s !== pageSize ? 1 : p, pageSize: s, sort })} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Cell({ c, value, href }: { c: ColumnDef; value: unknown; href?: string }) {
  if (c.type === "tag" && value) {
    const t = c.tags?.[String(value)];
    return <Tag kind={t?.kind ?? "gray"}>{t?.label ?? String(value)}</Tag>;
  }
  const text = formatCell(c, value);
  return href ? (
    <Link href={href} className={styles.rowLink}>
      {text}
    </Link>
  ) : (
    <>{text}</>
  );
}

function lookupName(l: Lookups | null, kind: string, id: string): string | undefined {
  if (!l) return undefined;
  const list: { id: string; name: string }[] | undefined =
    kind === "warehouse" ? l.warehouses : kind === "catalog" ? l.catalogs : kind === "category" ? l.categories : kind === "project" ? l.projects : kind === "supplier" ? l.suppliers : kind === "customer" ? l.customers : kind === "user" ? l.users : undefined;
  return list?.find((x) => x.id === id)?.name;
}
