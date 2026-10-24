"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { TextAreaField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { Tag } from "@/components/ui/Tag";
import { api, ApiError, download, errorMessage, upload } from "@/lib/api-client";
import { formatDateTime, formatMoney } from "@/shared/time/format";
import { formatQty, newKey, type StockCaps } from "./types";
import styles from "./stock.module.css";

interface Issue {
  row: number;
  field: string;
  message: string;
}

interface ImportDto {
  id: string;
  fileName: string;
  status: "QUEUED" | "VALIDATING" | "VALID" | "INVALID" | "COMMITTED" | "FAILED";
  totalRows: number;
  validLines: number;
  errors: Issue[];
  warnings: Issue[];
  summary: { warehouseId: string; warehouseCode: string; lines: number; totalQty: string; totalValue?: string }[];
  entries: { id: string; number: string | null; warehouse: string }[];
  failedReason: string | null;
  createdAt: string;
  committedAt: string | null;
}

interface WarehouseLock {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  openingLocked: boolean;
  openingLockedAt: string | null;
  openingLockedBy: { name: string } | null;
}

const STEP = ["Download the template", "Upload the filled file", "Check the results", "Import and post"];

export function OpeningWizard({ caps, initialLocks }: { caps: StockCaps; initialLocks: WarehouseLock[] }) {
  const [imp, setImp] = useState<ImportDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error" | "warning"; title?: string; message: string } | null>(null);
  const [locks, setLocks] = useState(initialLocks);
  const [unlocking, setUnlocking] = useState<WarehouseLock | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const fileInput = useRef<HTMLInputElement>(null);
  const commitKey = useRef(newKey());

  const step = !imp ? 1 : ["QUEUED", "VALIDATING"].includes(imp.status) ? 2 : imp.status === "COMMITTED" ? 4 : 3;

  // Poll while the worker validates.
  useEffect(() => {
    if (!imp || !["QUEUED", "VALIDATING"].includes(imp.status)) return;
    const t = setTimeout(async () => {
      try {
        setImp((await api<{ data: ImportDto }>(`/opening-stock/imports/${imp.id}`)).data);
      } catch (err) {
        setNotice({ kind: "error", message: errorMessage(err) });
      }
    }, 800);
    return () => clearTimeout(t);
  }, [imp]);

  async function send(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    setBusy("upload");
    setNotice(null);
    try {
      setImp((await upload<{ data: ImportDto }>("/opening-stock/imports", fd)).data);
      commitKey.current = newKey();
    } catch (err) {
      setNotice({ kind: "error", title: "Upload failed", message: errorMessage(err) });
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function commit() {
    if (!imp) return;
    setBusy("commit");
    try {
      const r = (await api<{ data: ImportDto }>(`/opening-stock/imports/${imp.id}/commit`, { method: "POST", headers: { "Idempotency-Key": commitKey.current } })).data;
      setImp(r);
      setNotice({ kind: "success", title: "Opening stock posted", message: `${r.entries.length} opening entr${r.entries.length === 1 ? "y" : "ies"} posted. Check the stock levels, then lock opening stock for each warehouse.` });
    } catch (err) {
      commitKey.current = newKey();
      const details = err instanceof ApiError && err.details.length ? ` ${err.details.slice(0, 5).map((d) => `${d.path}: ${d.message}`).join("; ")}` : "";
      setNotice({ kind: "error", title: "Nothing was imported", message: `${errorMessage(err)}${details}` });
    } finally {
      setBusy(null);
    }
  }

  async function lock(w: WarehouseLock) {
    if (!window.confirm(`Lock opening stock for ${w.name}? After this, no opening entries or imports are accepted for it.`)) return;
    try {
      const r = (await api<{ data: WarehouseLock }>(`/warehouses/${w.id}/lock-opening`, { method: "POST", headers: { "Idempotency-Key": newKey() } })).data;
      setLocks((ls) => ls.map((x) => (x.id === r.id ? r : x)));
    } catch (err) {
      setNotice({ kind: "error", message: errorMessage(err) });
    }
  }

  async function unlock() {
    if (!unlocking) return;
    setBusy("unlock");
    try {
      const r = (await api<{ data: WarehouseLock }>(`/warehouses/${unlocking.id}/unlock-opening`, { method: "POST", body: { reason }, headers: { "Idempotency-Key": newKey() } })).data;
      setLocks((ls) => ls.map((x) => (x.id === r.id ? r : x)));
      setUnlocking(null);
      setReason("");
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors().reason) setReasonError(err.fieldErrors().reason);
      else setNotice({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  const issueColumns: Column<Issue & { kind: "error" | "warning" }>[] = [
    { key: "row", header: "Row", render: (i) => <span className={styles.num}>{i.row || "—"}</span> },
    { key: "kind", header: "", render: (i) => (i.kind === "error" ? <Tag kind="red">Error</Tag> : <Tag kind="yellow">Warning</Tag>) },
    { key: "field", header: "Column", render: (i) => <span className={styles.nowrap}>{i.field}</span> },
    { key: "msg", header: "Problem", render: (i) => i.message },
  ];
  const issues = imp ? [...imp.errors.map((e) => ({ ...e, kind: "error" as const })), ...imp.warnings.map((w) => ({ ...w, kind: "warning" as const }))].sort((a, b) => a.row - b.row) : [];

  return (
    <div className={styles.stack}>
      <ol className={styles.cards} aria-label="Steps" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {STEP.map((label, i) => (
          <li key={label} className={styles.card} style={{ boxShadow: step === i + 1 ? "inset 0 3px 0 var(--color-primary)" : undefined, opacity: step >= i + 1 ? 1 : 0.6 }} aria-current={step === i + 1 ? "step" : undefined}>
            <div className={styles.cardLabel}>Step {i + 1}</div>
            <div style={{ marginTop: "var(--space-2)" }}>{label}</div>
          </li>
        ))}
      </ol>

      {notice ? (
        <Notification kind={notice.kind} title={notice.title} onClose={() => setNotice(null)}>
          {notice.message}
        </Notification>
      ) : null}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>1 · Template</h2>
            <p className={styles.sectionHelp}>One row per product, warehouse and condition. The Lists sheet has the valid warehouse and product codes; the Help sheet explains every column.</p>
          </div>
          <Button kind="secondary" onClick={() => download("/opening-stock/template", {}, "opening-stock-template.xlsx").catch((err) => setNotice({ kind: "error", message: errorMessage(err) }))}>
            Download template
          </Button>
        </div>
        <div className={styles.sectionHead} style={{ marginBottom: 0 }}>
          <div>
            <h2 className={styles.sectionTitle}>2 · Upload</h2>
            <p className={styles.sectionHelp}>The file is checked in the background; nothing is posted yet.</p>
          </div>
          <input ref={fileInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => send(e.target.files)} />
          <Button onClick={() => fileInput.current?.click()} disabled={busy === "upload" || step === 2}>
            {busy === "upload" ? "Uploading…" : imp ? "Upload another file" : "Upload .xlsx"}
          </Button>
        </div>
      </section>

      {imp ? (
        <section className={styles.section} aria-live="polite">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>3 · Results — {imp.fileName}</h2>
            <span>
              {imp.status === "VALID" ? <Tag kind="green">Ready to import</Tag> : imp.status === "INVALID" ? <Tag kind="red">{imp.errors.length} error(s)</Tag> : imp.status === "COMMITTED" ? <Tag kind="green">Posted</Tag> : imp.status === "FAILED" ? <Tag kind="red">Failed</Tag> : <Tag kind="blue">Checking…</Tag>}
            </span>
          </div>
          {imp.status === "FAILED" ? <Notification kind="error">{imp.failedReason}</Notification> : null}
          {["QUEUED", "VALIDATING"].includes(imp.status) ? <p className={styles.muted}>Checking {imp.fileName}…</p> : null}
          {imp.summary.length ? (
            <div className={styles.cards} style={{ marginBottom: "var(--space-5)" }}>
              {imp.summary.map((s) => (
                <div key={s.warehouseId} className={styles.card} style={{ background: "var(--color-background)" }}>
                  <div className={styles.cardLabel}>Warehouse {s.warehouseCode}</div>
                  <div className={styles.cardValue}>{s.lines} lines</div>
                  <div className={styles.muted}>Qty {formatQty(s.totalQty)}</div>
                  {s.totalValue !== undefined ? <div className={styles.muted}>Value {formatMoney(s.totalValue)}</div> : null}
                </div>
              ))}
            </div>
          ) : null}
          {issues.length ? <DataTable caption="Row results" columns={issueColumns} rows={issues} rowKey={(i) => `${i.kind}-${i.row}-${i.field}-${i.message}`} /> : imp.status === "VALID" ? <p className={styles.muted}>No problems found in {imp.totalRows} rows.</p> : null}
          {imp.status === "INVALID" ? <p className={styles.muted} style={{ marginTop: "var(--space-4)" }}>Fix the rows in your file and upload it again. Nothing has been posted.</p> : null}
        </section>
      ) : null}

      {imp && (imp.status === "VALID" || imp.status === "COMMITTED") ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-4)" }}>
            4 · Import and post
          </h2>
          {imp.status === "VALID" ? (
            <>
              <p className={styles.sectionHelp} style={{ marginBottom: "var(--space-5)" }}>
                Posts one Opening stock entry per warehouse in a single step: either everything is posted, or nothing is.
              </p>
              <Button onClick={commit} disabled={busy === "commit"}>
                {busy === "commit" ? "Posting…" : "Import and post"}
              </Button>
            </>
          ) : (
            <>
              <p style={{ marginBottom: "var(--space-3)" }}>Posted {formatDateTime(imp.committedAt)}:</p>
              <ul>
                {imp.entries.map((e) => (
                  <li key={e.id}>
                    <Link href={`/stock/${e.id}`} className={styles.mono}>
                      {e.number}
                    </Link>{" "}
                    — warehouse {e.warehouse}
                  </li>
                ))}
              </ul>
              <p className={styles.muted} style={{ marginTop: "var(--space-4)" }}>
                Next: check <Link href="/stock?tab=levels">stock levels</Link>, then lock opening stock below.
              </p>
            </>
          )}
        </section>
      ) : null}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-3)" }}>
          Go-live lock
        </h2>
        <p className={styles.sectionHelp} style={{ marginBottom: "var(--space-5)" }}>
          After locking, opening stock entries and imports for that warehouse are refused. Only an Admin can lock or unlock (unlocking needs a reason and is recorded).
        </p>
        <div className={styles.cards}>
          {locks.map((w) => (
            <div key={w.id} className={styles.card} style={{ background: "var(--color-background)" }}>
              <div className={styles.cardLabel}>{w.name}</div>
              <div style={{ margin: "var(--space-3) 0" }}>{w.openingLocked ? <Tag kind="green">Locked</Tag> : <Tag kind="yellow">Open for opening stock</Tag>}</div>
              {w.openingLocked ? (
                <p className={styles.muted}>
                  {formatDateTime(w.openingLockedAt)}
                  {w.openingLockedBy ? ` · ${w.openingLockedBy.name}` : ""}
                </p>
              ) : null}
              {caps.isAdmin ? (
                <div style={{ marginTop: "var(--space-3)" }}>
                  {w.openingLocked ? (
                    <Button kind="ghost" size="sm" onClick={() => (setUnlocking(w), setReasonError(undefined))}>
                      Unlock…
                    </Button>
                  ) : (
                    <Button kind="secondary" size="sm" onClick={() => lock(w)}>
                      Lock opening stock
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <Modal
        open={!!unlocking}
        title={`Unlock opening stock — ${unlocking?.name ?? ""}`}
        primaryText="Unlock"
        primaryKind="danger"
        submitting={busy === "unlock"}
        onClose={() => setUnlocking(null)}
        onSubmit={(e) => {
          e.preventDefault();
          void unlock();
        }}
      >
        <TextAreaField label="Reason (recorded in the audit log)" rows={3} value={reason} onChange={(e) => (setReason(e.target.value), setReasonError(undefined))} error={reasonError} required />
      </Modal>
    </div>
  );
}
