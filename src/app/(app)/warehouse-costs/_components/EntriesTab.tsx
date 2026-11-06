"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Checkbox, SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { FormProblems } from "@/components/ui/FormProblems";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { Pagination } from "@/components/ui/Pagination";
import { SkeletonLines } from "@/components/ui/Skeleton";
import { Tag } from "@/components/ui/Tag";
import { api, ApiError, errorMessage, upload, type Page } from "@/lib/api-client";
import { collect } from "@/lib/validation";
import { reasonProblem } from "./CostFormModal";
import { formatDateTime, formatMoney } from "@/shared/time/format";
import { newKey } from "../../stock/_components/types";
import {
  CATEGORY_SHORT,
  CATEGORY_TAG,
  monthLabel,
  OVERHEAD_LABEL,
  SCOPE_CATEGORIES,
  SCOPE_LABEL,
  WAREHOUSE_COST_CATEGORIES,
  type CostAttachmentDto,
  type CostHistoryRow,
  type OverheadScope,
  type WarehouseCostCategory,
  type WarehouseCostDto,
  type WarehouseOption,
} from "./types";
import stock from "../../stock/_components/stock.module.css";
import css from "./warehouse-costs.module.css";
import { confirmDialog } from "@/components/ui/ConfirmDialog";

type Notify = (n: { kind: "success" | "error"; message: string }) => void;
type ListResult = Page<WarehouseCostDto> & { totals?: { amount: string } };

const bytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** The register: filterable, paged, with the filtered total (voided lines excluded). */
export function EntriesTab({ warehouses, version, onEdit, notify }: { warehouses: WarehouseOption[]; version: number; onEdit: (c: WarehouseCostDto) => void; notify: Notify }) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [scope, setScope] = useState<OverheadScope | "">("");
  const [warehouseId, setWarehouseId] = useState("");
  const [category, setCategory] = useState<WarehouseCostCategory | "">("");
  const [monthFrom, setMonthFrom] = useState("");
  const [monthTo, setMonthTo] = useState("");
  const [includeVoided, setIncludeVoided] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<WarehouseCostDto | null>(null);
  const [history, setHistory] = useState<WarehouseCostDto | null>(null);
  const [receipts, setReceipts] = useState<WarehouseCostDto | null>(null);

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
      setResult(
        await api<ListResult>("/warehouse-costs", {
          query: { page, pageSize, q: debouncedQ, scope, warehouseId, category, monthFrom, monthTo, includeVoided: includeVoided ? "true" : undefined, sort: "-month" },
        }),
      );
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedQ, scope, warehouseId, category, monthFrom, monthTo, includeVoided]);

  // version: reload after an add / edit in the parent.
  useEffect(() => {
    void load();
  }, [load, version]);

  const filter = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };
  const categories = scope ? SCOPE_CATEGORIES[scope] : WAREHOUSE_COST_CATEGORIES;

  const columns: Column<WarehouseCostDto>[] = [
    { key: "month", header: "Month", className: stock.nowrap, render: (c) => <span className={c.voided ? css.voided : undefined}>{monthLabel(c.month)}</span> },
    { key: "where", header: "Warehouse", render: (c) => (c.warehouse ? c.warehouse.name : <span className={stock.muted}>Company</span>) },
    {
      key: "category",
      header: "Category",
      render: (c) => (
        <span className={stock.nowrap}>
          <Tag kind={CATEGORY_TAG[c.category]}>{CATEGORY_SHORT[c.category]}</Tag> {c.voided ? <Tag kind="gray" title={c.voidReason ?? undefined}>Voided</Tag> : null}
        </span>
      ),
    },
    {
      key: "description",
      header: "Description",
      render: (c) => (
        <div>
          <span className={c.voided ? css.voided : undefined}>{c.description}</span>
          {c.referenceNo ? <div className={stock.lineMeta}>Ref {c.referenceNo}</div> : null}
          {c.updatedBy ? <div className={stock.lineMeta}>Edited by {c.updatedBy.name}</div> : null}
          {c.voided && c.voidReason ? <div className={stock.lineMeta}>Voided: {c.voidReason}</div> : null}
        </div>
      ),
    },
    { key: "payee", header: "Payee", render: (c) => c.vendorOrPayee ?? "—" },
    { key: "by", header: "By", className: stock.nowrap, render: (c) => c.createdBy.name },
    { key: "amount", header: "Amount (৳)", align: "end", render: (c) => <span className={`${stock.num} ${c.voided ? css.voided : ""}`}>{formatMoney(c.amount)}</span> },
    {
      key: "receipts",
      header: "Receipts",
      render: (c) =>
        c.attachmentCount ? (
          <button type="button" className={stock.linkButton} onClick={() => setReceipts(c)} aria-label={`Receipts for ${c.description}`}>
            📎 {c.attachmentCount}
          </button>
        ) : c.actions.upload && !c.voided ? (
          <button type="button" className={stock.linkButton} onClick={() => setReceipts(c)}>
            Add
          </button>
        ) : (
          "—"
        ),
    },
    {
      key: "actions",
      header: <span className="visually-hidden">Actions</span>,
      align: "end",
      render: (c) => (
        <div className={css.rowActions}>
          {c.actions.edit ? (
            <Button kind="ghost" size="sm" onClick={() => onEdit(c)}>
              Edit
            </Button>
          ) : null}
          <button type="button" className={stock.linkButton} onClick={() => setHistory(c)} aria-label={`History of ${c.description}`}>
            History
          </button>
          {c.actions.void ? (
            <Button kind="ghost" size="sm" onClick={() => setVoiding(c)}>
              Void
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const toolbar = (
    <div className={stock.toolbar}>
      <TextField label="Search" placeholder="Description, payee, reference…" value={q} onChange={(e) => setQ(e.target.value)} fieldClassName={stock.search} />
      <SelectField
        label="Scope"
        value={scope}
        onChange={(e) => {
          const s = e.target.value as OverheadScope | "";
          filter(setScope)(s);
          if (s === "COMPANY") setWarehouseId("");
          if (s && category && !SCOPE_CATEGORIES[s].includes(category)) setCategory("");
        }}
        fieldClassName={stock.filter}
      >
        <option value="">Warehouse and company</option>
        {(Object.keys(SCOPE_LABEL) as OverheadScope[]).map((s) => (
          <option key={s} value={s}>
            {SCOPE_LABEL[s]}
          </option>
        ))}
      </SelectField>
      <SelectField searchable label="Warehouse" value={warehouseId} onChange={(e) => filter(setWarehouseId)(e.target.value)} fieldClassName={stock.filter} disabled={scope === "COMPANY"}>
        <option value="">All my warehouses</option>
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </SelectField>
      <SelectField label="Category" value={category} onChange={(e) => filter(setCategory)(e.target.value as WarehouseCostCategory | "")} fieldClassName={stock.filter}>
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {OVERHEAD_LABEL[c]}
          </option>
        ))}
      </SelectField>
      <TextField label="From month" type="month" value={monthFrom} max={monthTo || undefined} onChange={(e) => filter(setMonthFrom)(e.target.value)} fieldClassName={stock.filter} />
      <TextField label="To month" type="month" value={monthTo} min={monthFrom || undefined} onChange={(e) => filter(setMonthTo)(e.target.value)} fieldClassName={stock.filter} />
      <div className={css.check}>
        <Checkbox label="Include voided" checked={includeVoided} onChange={(e) => filter(setIncludeVoided)(e.target.checked)} />
      </div>
    </div>
  );

  const filtered = !!(debouncedQ || scope || warehouseId || category || monthFrom || monthTo);
  return (
    <div className={stock.stack}>
      {error ? (
        <Notification kind="error" title="Could not load warehouse costs">
          {error}
        </Notification>
      ) : null}
      <DataTable
        columns={columns}
        rows={result?.data ?? []}
        rowKey={(c) => c.id}
        loading={loading}
        caption="Warehouse costs"
        toolbar={toolbar}
        emptyMessage={filtered ? "No costs match these filters." : "No warehouse costs yet. Add the month's store charge, holding cost or established cost with “+ Add cost”."}
        footer={
          result ? (
            <>
              {result.totals ? (
                <div className={css.totalBar}>
                  <span>
                    Total of {filtered ? "the filtered" : "all"} entries{includeVoided ? ", voided excluded" : ""} · {result.meta.total} line{result.meta.total === 1 ? "" : "s"}
                  </span>
                  <strong>{formatMoney(result.totals.amount)}</strong>
                </div>
              ) : null}
              <Pagination page={page} pageSize={pageSize} total={result.meta.total} onChange={(p, s) => (setPage(p), setPageSize(s))} />
            </>
          ) : null
        }
      />

      {voiding ? (
        <VoidModal
          cost={voiding}
          onClose={() => setVoiding(null)}
          onVoided={async () => {
            setVoiding(null);
            notify({ kind: "success", message: "Cost voided. It stays on record but no longer counts." });
            await load();
          }}
        />
      ) : null}
      {history ? <HistoryModal cost={history} warehouses={warehouses} onClose={() => setHistory(null)} /> : null}
      {receipts ? <ReceiptsModal cost={receipts} onClose={() => setReceipts(null)} onChanged={load} /> : null}
    </div>
  );
}

function VoidModal({ cost, onClose, onVoided }: { cost: WarehouseCostDto; onClose: () => void; onVoided: () => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(false);
  const keyRef = useRef(newKey());
  // Browser-side check (same rule as the server's VoidWarehouseCostSchema).
  const problems = collect(["reason", reasonProblem(reason, true)]);
  async function submit() {
    setAttempt(true);
    setError(undefined);
    setFormError(null);
    if (Object.keys(problems).length) return;
    setSaving(true);
    try {
      await api(`/warehouse-costs/${cost.id}/void`, { method: "POST", body: { reason: reason.trim() }, headers: { "Idempotency-Key": keyRef.current } });
      await onVoided();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors().reason) setError(err.fieldErrors().reason);
      else setFormError(errorMessage(err));
      keyRef.current = newKey();
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open title="Void cost" label={`${monthLabel(cost.month)} · ${cost.warehouse?.name ?? "Company"} · ${CATEGORY_SHORT[cost.category]}`} primaryText="Void cost" primaryKind="danger" submitting={saving} onClose={onClose} onSubmit={() => void submit()}>
      <FormProblems problems={attempt ? problems : {}} labels={{ reason: "Reason" }} />
      {formError ? <Notification kind="error">{formError}</Notification> : null}
      <p>
        {cost.description} · <strong>{formatMoney(cost.amount)}</strong>
      </p>
      <p className={stock.muted}>The cost stays on record (struck through) but no longer counts in totals or the monthly summary. This can&apos;t be undone.</p>
      <TextAreaField label="Reason *" rows={3} value={reason} onChange={(e) => (setReason(e.target.value), setError(undefined))} error={(attempt ? problems.reason : undefined) ?? error} required />
    </Modal>
  );
}

const FIELD_LABEL: Record<string, string> = {
  amount: "Amount",
  month: "Month",
  category: "Category",
  scope: "Scope",
  warehouseId: "Warehouse",
  description: "Description",
  vendorOrPayee: "Payee / vendor",
  referenceNo: "Reference",
};

const ACTION_LABEL: Record<string, string> = { CREATE: "Added", UPDATE: "Edited", VOID: "Voided", ATTACHMENT_ADD: "Receipt added", ATTACHMENT_REMOVE: "Receipt removed" };

function HistoryModal({ cost, warehouses, onClose }: { cost: WarehouseCostDto; warehouses: WarehouseOption[]; onClose: () => void }) {
  const [rows, setRows] = useState<CostHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ data: { history: CostHistoryRow[] } }>(`/warehouse-costs/${cost.id}/history`)
      .then((r) => setRows(r.data.history))
      .catch((err) => setError(errorMessage(err)));
  }, [cost.id]);

  const value = (field: string, v: unknown) => {
    if (v === null || v === undefined || v === "") return field === "warehouseId" ? "Company" : "—";
    const s = String(v);
    if (field === "amount") return formatMoney(s);
    if (field === "month") return monthLabel(s);
    if (field === "category") return OVERHEAD_LABEL[s as WarehouseCostCategory] ?? s;
    if (field === "scope") return SCOPE_LABEL[s as OverheadScope] ?? s;
    if (field === "warehouseId") return warehouses.find((w) => w.id === s)?.name ?? (cost.warehouse?.id === s ? cost.warehouse.name : "Another warehouse");
    return s;
  };
  const title = (h: CostHistoryRow) => ACTION_LABEL[h.action] ?? h.action;

  return (
    <Modal open title="History" label={`${monthLabel(cost.month)} · ${cost.warehouse?.name ?? "Company"} · ${cost.description}`} primaryText="Done" onClose={onClose} onSubmit={onClose} size="sm">
      {error ? <Notification kind="error">{error}</Notification> : null}
      {!rows && !error ? <SkeletonLines lines={4} /> : null}
      {rows ? (
        rows.length ? (
          <ol className={stock.timeline}>
            {rows.map((h) => {
              const amount = h.changes.find((c) => c.field === "amount");
              return (
                <li key={h.id}>
                  <div className={stock.timelineEvent}>
                    {title(h)}
                    {amount ? (
                      <>
                        {" "}
                        · {value("amount", amount.from)} → <strong>{value("amount", amount.to)}</strong>
                      </>
                    ) : (h.action === "CREATE" || h.action === "VOID") && h.amount ? (
                      ` · ${value("amount", h.amount)}`
                    ) : null}
                  </div>
                  {h.changes
                    .filter((c) => c.field !== "amount")
                    .map((c) => (
                      <div key={c.field} className={stock.muted}>
                        {FIELD_LABEL[c.field] ?? c.field}: {value(c.field, c.from)} → {value(c.field, c.to)}
                      </div>
                    ))}
                  {h.files.length ? <div className={stock.muted}>{h.files.join(", ")}</div> : null}
                  {h.reason ? <div className={stock.muted}>“{h.reason}”</div> : null}
                  <div className={stock.muted}>
                    {formatDateTime(h.at)} · {h.by?.name ?? "System"}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className={stock.muted}>No history recorded.</p>
        )
      ) : null}
    </Modal>
  );
}

function ReceiptsModal({ cost, onClose, onChanged }: { cost: WarehouseCostDto; onClose: () => void; onChanged: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<CostAttachmentDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canUpload = cost.actions.upload && !cost.voided;

  const load = useCallback(async () => {
    try {
      setFiles((await api<{ data: CostAttachmentDto[] }>(`/warehouse-costs/${cost.id}/attachments`)).data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [cost.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    const fd = new FormData();
    for (const f of Array.from(list)) fd.append("file", f);
    fd.append("label", "Receipt");
    setBusy(true);
    setError(null);
    try {
      await upload(`/warehouse-costs/${cost.id}/attachments`, fd);
      await Promise.all([load(), onChanged()]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(a: CostAttachmentDto) {
    if (!(await confirmDialog({ title: `Remove ${a.fileName}?`, message: "The file is removed from this cost entry. This can't be undone.", confirmText: "Remove file", danger: true }))) return;
    try {
      await api(`/warehouse-costs/${cost.id}/attachments/${a.id}`, { method: "DELETE" });
      await Promise.all([load(), onChanged()]);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal open title="Receipts" label={cost.description} primaryText="Done" onClose={onClose} onSubmit={onClose} size="sm">
      {error ? <Notification kind="error">{error}</Notification> : null}
      {!files ? (
        <SkeletonLines lines={2} />
      ) : files.length ? (
        <ul className={stock.attachments}>
          {files.map((a) => (
            <li key={a.id} className={stock.attachment}>
              <a href={a.url} target="_blank" rel="noopener noreferrer">
                {a.fileName}
              </a>
              <span className={stock.muted}>{bytes(a.size)}</span>
              {canUpload ? (
                <button type="button" className={stock.linkButton} onClick={() => remove(a)} aria-label={`Remove ${a.fileName}`}>
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={stock.muted}>No receipt yet.</p>
      )}
      {canUpload ? (
        <div>
          <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => add(e.target.files)} />
          <Button kind="secondary" size="sm" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? "Uploading…" : "+ Add receipt"}
          </Button>
          <p className={stock.muted} style={{ marginTop: "var(--s-2)" }}>
            PDF, JPG, PNG or WebP up to 10 MB.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
