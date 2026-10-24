"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox, SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { Pagination } from "@/components/ui/Pagination";
import { Tag } from "@/components/ui/Tag";
import { api, ApiError, errorMessage, upload, type Page } from "@/lib/api-client";
import { formatDateTime, formatMoney } from "@/shared/time/format";
import { ENTRY_TYPE_META, formatQty, newKey, STATUS_LABEL, STATUS_TAG } from "../../stock/_components/types";
import { COST_CATEGORIES, COST_CATEGORY_LABEL, type CostDto, type MaterialDto, type MovementDto, type ProjectAttachmentDto, type ProjectDto, type ProjectsCaps } from "./types";
import stock from "../../stock/_components/stock.module.css";
import styles from "./projects.module.css";

const bytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());

/* ───────────────────────────── 1. material used ───────────────────────────── */

export function MaterialTab({ project, caps, issueLink }: { project: ProjectDto; caps: ProjectsCaps; issueLink: string | null }) {
  const [rows, setRows] = useState<MaterialDto[] | null>(null);
  const [totals, setTotals] = useState<{ netMaterialCost?: string }>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ data: { lines: MaterialDto[]; totals: { netMaterialCost?: string } } }>(`/projects/${project.id}/material`)
      .then((r) => (setRows(r.data.lines), setTotals(r.data.totals)))
      .catch((err) => setError(errorMessage(err)));
  }, [project.id]);

  if (error) return <Notification kind="error">{error}</Notification>;
  if (!rows) return <p className={stock.muted}>Loading…</p>;
  if (!rows.length)
    return (
      <div className={styles.empty}>
        No material has been issued to this project yet.
        {issueLink ? (
          <>
            {" "}
            Use <Link href={issueLink}>Issue material</Link> to send stock to the site; it shows here once posted.
          </>
        ) : null}
      </div>
    );
  return (
    <div className={stock.linesWrap}>
      <table className={stock.lines}>
        <thead>
          <tr>
            <th>Product</th>
            <th className={stock.right}>Issued</th>
            <th className={stock.right}>Returned</th>
            <th className={stock.right}>Net used</th>
            {caps.seeCost ? <th className={stock.right}>Cost (৳)</th> : null}
            <th>Serial nos. at site</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.product.id}>
              <td>
                <div>{m.product.name}</div>
                <div className={stock.lineMeta}>
                  <Link href={`/stock/products/${m.product.id}`} className={stock.mono}>
                    {m.product.code}
                  </Link>
                </div>
              </td>
              <td className={`${stock.right} ${stock.num}`}>{formatQty(m.issuedQty)}</td>
              <td className={`${stock.right} ${stock.num}`}>
                {formatQty(m.returnedQty)}
                {Number(m.returnedDamagedQty) ? <div className={stock.lineMeta}>{formatQty(m.returnedDamagedQty)} damaged</div> : null}
              </td>
              <td className={`${stock.right} ${stock.num}`}>
                <strong>{formatQty(m.netQty)}</strong> {m.product.unitCode}
              </td>
              {caps.seeCost ? <td className={`${stock.right} ${stock.num}`}>{formatMoney(m.netCost)}</td> : null}
              <td>
                {m.serialsAtSite.length ? (
                  <div className={stock.chips}>
                    {m.serialsAtSite.map((s) => (
                      <span key={s} className={stock.chip} style={{ cursor: "default" }}>
                        {s}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className={stock.muted}>{m.product.trackSerial ? "None" : "—"}</span>
                )}
              </td>
            </tr>
          ))}
          {caps.seeCost && totals.netMaterialCost !== undefined ? (
            <tr className={styles.subtotal}>
              <td colSpan={4}>Net material cost</td>
              <td className={`${stock.right} ${stock.num}`}>{formatMoney(totals.netMaterialCost)}</td>
              <td />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────────── 2. issue / return history ───────────────────────────── */

export function MovementsTab({ project, caps }: { project: ProjectDto; caps: ProjectsCaps }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<Page<MovementDto> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Page<MovementDto>>(`/projects/${project.id}/movements`, { query: { page, pageSize } })
      .then(setResult)
      .catch((err) => setError(errorMessage(err)));
  }, [project.id, page, pageSize]);

  if (error) return <Notification kind="error">{error}</Notification>;
  if (!result) return <p className={stock.muted}>Loading…</p>;
  if (!result.data.length) return <div className={styles.empty}>No issues or returns yet.</div>;
  return (
    <div className={stock.stack}>
      <div className={stock.linesWrap}>
        <table className={stock.lines}>
          <thead>
            <tr>
              <th>Number</th>
              <th>Date</th>
              <th>Type</th>
              <th>Warehouse</th>
              <th className={stock.right}>Items</th>
              {caps.seeCost ? <th className={stock.right}>Value (৳)</th> : null}
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((e) => (
              <tr key={e.id}>
                <td>
                  <Link href={`/stock/${e.id}`} className={stock.mono}>
                    {e.displayNumber}
                  </Link>
                  {e.reversalOf ? <div className={stock.lineMeta}>reverses {e.reversalOf.number}</div> : null}
                </td>
                <td className={stock.nowrap}>{e.entryDate}</td>
                <td className={stock.nowrap}>{ENTRY_TYPE_META[e.type as keyof typeof ENTRY_TYPE_META]?.label ?? e.type}</td>
                <td>{e.warehouse.code}</td>
                <td className={`${stock.right} ${stock.num}`}>
                  {e.itemCount} · {formatQty(e.totalQty)}
                </td>
                {caps.seeCost ? <td className={`${stock.right} ${stock.num}`}>{formatMoney(e.costTotal)}</td> : null}
                <td>
                  <Tag kind={STATUS_TAG[e.status as keyof typeof STATUS_TAG]}>{STATUS_LABEL[e.status as keyof typeof STATUS_LABEL]}</Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.meta.total > pageSize ? <Pagination page={page} pageSize={pageSize} total={result.meta.total} onChange={(pg, s) => (setPage(pg), setPageSize(s))} /> : null}
    </div>
  );
}

/* ───────────────────────────── 3. labour, transport & other ───────────────────────────── */

const emptyCost = () => ({ date: today(), category: "LABOUR", description: "", amount: "", vendorOrPayee: "", referenceNo: "" });

export function CostsTab({ project, caps, onCount, onChanged }: { project: ProjectDto; caps: ProjectsCaps; onCount: (n: number) => void; onChanged: () => void }) {
  const [rows, setRows] = useState<CostDto[] | null>(null);
  const [subtotals, setSubtotals] = useState<Record<string, string>>({});
  const [showVoided, setShowVoided] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(emptyCost);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [voiding, setVoiding] = useState<CostDto | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState<string | undefined>();
  const [receipts, setReceipts] = useState<{ cost: CostDto; files: ProjectAttachmentDto[] } | null>(null);
  const keyRef = useRef(newKey());
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [shown, active] = await Promise.all([
        api<{ data: { costs: CostDto[]; subtotals: Record<string, string> } }>(`/projects/${project.id}/costs`, { query: { includeVoided: showVoided ? "true" : undefined } }),
        showVoided ? api<{ data: { costs: CostDto[] } }>(`/projects/${project.id}/costs`) : null,
      ]);
      setRows(shown.data.costs);
      setSubtotals(shown.data.subtotals);
      onCount((active ?? shown).data.costs.filter((c) => !c.voided).length);
    } catch (err) {
      setNotice({ kind: "error", message: errorMessage(err) });
    }
  }, [project.id, showVoided, onCount]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function add() {
    setSaving(true);
    setErrors({});
    try {
      const c = (
        await api<{ data: CostDto }>(`/projects/${project.id}/costs`, {
          method: "POST",
          body: { date: form.date || undefined, category: form.category, description: (form.description ?? "").trim(), amount: form.amount, vendorOrPayee: (form.vendorOrPayee ?? "").trim() || null, referenceNo: (form.referenceNo ?? "").trim() || null },
          headers: { "Idempotency-Key": keyRef.current },
        })
      ).data;
      if (receipt) {
        const fd = new FormData();
        fd.append("file", receipt);
        fd.append("label", "Receipt");
        await upload(`/projects/${project.id}/costs/${c.id}/attachments`, fd).catch((err) => setNotice({ kind: "error", message: `Cost added, but the receipt didn't upload: ${errorMessage(err)}` }));
      }
      setForm(emptyCost());
      setReceipt(null);
      if (fileInput.current) fileInput.current.value = "";
      setNotice((n) => n ?? { kind: "success", message: `${COST_CATEGORY_LABEL[c.category]} cost added.` });
      await load();
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors()).length) setErrors(err.fieldErrors());
      else setNotice({ kind: "error", message: errorMessage(err) });
    } finally {
      keyRef.current = newKey();
      setSaving(false);
    }
  }

  async function doVoid() {
    if (!voiding) return;
    setVoidError(undefined);
    try {
      await api(`/projects/${project.id}/costs/${voiding.id}/void`, { method: "POST", body: { reason: voidReason }, headers: { "Idempotency-Key": newKey() } });
      setVoiding(null);
      setVoidReason("");
      setNotice({ kind: "success", message: "Cost voided. It stays on record but no longer counts." });
      await load();
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors().reason) setVoidError(err.fieldErrors().reason);
      else {
        setVoiding(null);
        setNotice({ kind: "error", message: errorMessage(err) });
      }
    }
  }

  async function openReceipts(c: CostDto) {
    try {
      setReceipts({ cost: c, files: (await api<{ data: ProjectAttachmentDto[] }>(`/projects/${project.id}/costs/${c.id}/attachments`)).data });
    } catch (err) {
      setNotice({ kind: "error", message: errorMessage(err) });
    }
  }

  const canAdd = project.actions.addCost;
  return (
    <div className={stock.stack}>
      {notice ? (
        <Notification kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.message}
        </Notification>
      ) : null}

      {canAdd ? (
        <section className={stock.section} aria-labelledby="add-cost">
          <h2 id="add-cost" className={stock.sectionTitle} style={{ marginBottom: "var(--space-5)" }}>
            Add a cost
          </h2>
          <form
            className={styles.costForm}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <TextField label="Date" type="date" max={today()} value={form.date} onChange={(e) => set("date", e.target.value)} error={errors.date} />
            <SelectField label="Category" value={form.category} onChange={(e) => set("category", e.target.value)} error={errors.category}>
              {COST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {COST_CATEGORY_LABEL[c]}
                </option>
              ))}
            </SelectField>
            <TextField label="Description *" value={form.description} onChange={(e) => set("description", e.target.value)} error={errors.description} fieldClassName={styles.wide} />
            <TextField label="Amount (৳) *" inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value)} error={errors.amount} />
            <TextField label="Payee / vendor" value={form.vendorOrPayee} onChange={(e) => set("vendorOrPayee", e.target.value)} error={errors.vendorOrPayee} />
            <TextField label="Reference" value={form.referenceNo} onChange={(e) => set("referenceNo", e.target.value)} error={errors.referenceNo} placeholder="Bill / voucher no." />
            <div>
              <label className={stock.muted} htmlFor="receipt-file" style={{ display: "block", marginBottom: "var(--space-2)", fontSize: "var(--text-xs)" }}>
                Receipt (optional)
              </label>
              <input id="receipt-file" ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <Button type="submit" disabled={saving}>
                {saving ? "Adding…" : "Add cost"}
              </Button>
            </div>
          </form>
        </section>
      ) : project.status === "CLOSED" ? (
        <Notification kind="info">The project is closed: costs can no longer be added or voided.</Notification>
      ) : null}

      <div className={stock.toolbar} style={{ justifyContent: "flex-end" }}>
        <Checkbox label="Show voided costs" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />
      </div>
      {!rows ? (
        <p className={stock.muted}>Loading…</p>
      ) : !rows.length ? (
        <div className={styles.empty}>No labour, transport or other costs yet.</div>
      ) : (
        <div className={stock.linesWrap}>
          <table className={stock.lines}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Payee</th>
                <th>By</th>
                {caps.seeCost ? <th className={stock.right}>Amount (৳)</th> : null}
                <th>Receipt</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {COST_CATEGORIES.map((cat) => {
                const list = rows.filter((c) => c.category === cat);
                if (!list.length) return null;
                const sub = subtotals[cat === "LABOUR" ? "labourCost" : cat === "TRANSPORT" ? "transportCost" : "otherCost"];
                return (
                  <Fragment key={cat}>
                    {list.map((c) => (
                      <tr key={c.id} className={c.voided ? styles.voided : undefined}>
                        <td className={stock.nowrap}>{c.date}</td>
                        <td>
                          {c.categoryLabel} {c.voided ? <Tag kind="gray" title={c.voidReason ?? undefined}>Voided</Tag> : null}
                        </td>
                        <td>
                          {c.description}
                          {c.referenceNo ? <div className={stock.lineMeta}>Ref {c.referenceNo}</div> : null}
                          {c.voided && c.voidReason ? <div className={stock.lineMeta}>Voided: {c.voidReason}</div> : null}
                        </td>
                        <td>{c.vendorOrPayee ?? "—"}</td>
                        <td className={stock.nowrap}>{c.createdBy.name}</td>
                        {caps.seeCost ? <td className={`${stock.right} ${stock.num}`}>{formatMoney(c.amount)}</td> : null}
                        <td className={styles.keep}>
                          {c.attachmentCount ? (
                            <button type="button" className={stock.linkButton} onClick={() => openReceipts(c)} aria-label={`Receipts for ${c.description}`}>
                              📎 {c.attachmentCount}
                            </button>
                          ) : project.actions.upload ? (
                            <button type="button" className={stock.linkButton} onClick={() => openReceipts(c)}>
                              Add
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {project.actions.voidCost && !c.voided ? (
                            <Button kind="ghost" size="sm" onClick={() => (setVoiding(c), setVoidReason(""), setVoidError(undefined))}>
                              Void
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {caps.seeCost && sub !== undefined ? (
                      <tr className={styles.subtotal}>
                        <td colSpan={5}>{COST_CATEGORY_LABEL[cat]} subtotal</td>
                        <td className={`${stock.right} ${stock.num}`}>{formatMoney(sub)}</td>
                        <td colSpan={2} />
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {caps.seeCost && subtotals.costsTotal !== undefined ? (
                <tr className={styles.subtotal}>
                  <td colSpan={5}>Total (excluding voided)</td>
                  <td className={`${stock.right} ${stock.num}`}>{formatMoney(subtotals.costsTotal)}</td>
                  <td colSpan={2} />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!voiding} title="Void cost" label={voiding?.description} primaryText="Void cost" primaryKind="danger" onClose={() => setVoiding(null)} onSubmit={() => void doVoid()}>
        <p style={{ marginBottom: "var(--space-5)" }}>The cost stays on record (struck through) but no longer counts in the totals. This can&apos;t be undone.</p>
        <TextAreaField label="Reason" rows={3} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} error={voidError} required />
      </Modal>

      {receipts ? (
        <ReceiptsModal
          project={project}
          cost={receipts.cost}
          files={receipts.files}
          onClose={() => setReceipts(null)}
          onChanged={async () => {
            await openReceipts(receipts.cost);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function ReceiptsModal({ project, cost, files, onClose, onChanged }: { project: ProjectDto; cost: CostDto; files: ProjectAttachmentDto[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function add(list: FileList | null) {
    if (!list?.length) return;
    const fd = new FormData();
    for (const f of Array.from(list)) fd.append("file", f);
    fd.append("label", "Receipt");
    setBusy(true);
    try {
      await upload(`/projects/${project.id}/costs/${cost.id}/attachments`, fd);
      await onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open title="Receipts" label={cost.description} primaryText="Done" onClose={onClose} onSubmit={onClose} size="sm">
      {error ? <Notification kind="error">{error}</Notification> : null}
      {files.length ? (
        <ul className={stock.attachments}>
          {files.map((a) => (
            <li key={a.id} className={stock.attachment}>
              <a href={a.url} target="_blank" rel="noopener noreferrer">
                {a.fileName}
              </a>
              <span className={stock.muted}>{bytes(a.size)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={stock.muted}>No receipt yet.</p>
      )}
      {project.actions.upload ? (
        <div style={{ marginTop: "var(--space-4)" }}>
          <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => add(e.target.files)} />
          <Button kind="secondary" size="sm" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? "Uploading…" : "+ Add receipt"}
          </Button>
        </div>
      ) : null}
    </Modal>
  );
}

/* ───────────────────────────── 4. documents ───────────────────────────── */

export function DocumentsTab({ project, caps: _caps }: { project: ProjectDto; caps: ProjectsCaps }) {
  const [files, setFiles] = useState<ProjectAttachmentDto[] | null>(null);
  const [challans, setChallans] = useState<MovementDto[]>([]);
  const [label, setLabel] = useState("Work order");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [f, c] = await Promise.all([
        api<{ data: ProjectAttachmentDto[] }>(`/projects/${project.id}/attachments`),
        api<Page<MovementDto>>(`/projects/${project.id}/movements`, { query: { type: "ISSUE_TO_PROJECT", status: "POSTED", pageSize: 100 } }),
      ]);
      setFiles(f.data);
      setChallans(c.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [project.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    const fd = new FormData();
    for (const f of Array.from(list)) fd.append("file", f);
    fd.append("label", label);
    setBusy(true);
    setError(null);
    try {
      await upload(`/projects/${project.id}/attachments`, fd);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(a: ProjectAttachmentDto) {
    if (!window.confirm(`Remove ${a.fileName}?`)) return;
    try {
      await api(`/projects/${project.id}/attachments/${a.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className={stock.stack}>
      {error ? (
        <Notification kind="error" onClose={() => setError(null)}>
          {error}
        </Notification>
      ) : null}
      {project.actions.upload ? (
        <section className={stock.section} aria-labelledby="docs-up">
          <h2 id="docs-up" className={stock.sectionTitle} style={{ marginBottom: "var(--space-4)" }}>
            Upload
          </h2>
          <div className={stock.grid} style={{ marginBottom: "var(--space-4)" }}>
            <SelectField label="Document type" value={label} onChange={(e) => setLabel(e.target.value)}>
              {["Work order", "Drawing", "Handover papers", "Site photo", "Other"].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </SelectField>
          </div>
          <div
            className={`${styles.drop} ${over ? styles.dropActive : ""}`}
            onDragOver={(e) => (e.preventDefault(), setOver(true))}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              void add(e.dataTransfer.files);
            }}
          >
            Drag files here, or{" "}
            <button type="button" className={stock.linkButton} onClick={() => input.current?.click()} disabled={busy}>
              {busy ? "uploading…" : "choose files"}
            </button>
            . PDF, JPG, PNG or WebP up to 10 MB.
            <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => add(e.target.files)} />
          </div>
        </section>
      ) : null}

      <section className={stock.section} aria-labelledby="docs-list">
        <h2 id="docs-list" className={stock.sectionTitle} style={{ marginBottom: "var(--space-4)" }}>
          Files
        </h2>
        {!files ? (
          <p className={stock.muted}>Loading…</p>
        ) : files.length ? (
          <ul className={stock.attachments}>
            {files.map((a) => (
              <li key={a.id} className={stock.attachment}>
                <a href={a.url} target="_blank" rel="noopener noreferrer">
                  {a.fileName}
                </a>
                {a.label ? <Tag kind="gray">{a.label}</Tag> : null}
                <span className={stock.muted}>
                  {bytes(a.size)} · {a.uploadedBy.name} · {formatDateTime(a.createdAt)}
                </span>
                {project.actions.upload ? (
                  <button type="button" className={stock.linkButton} onClick={() => remove(a)} aria-label={`Remove ${a.fileName}`}>
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className={stock.muted}>No files yet: work orders, drawings, handover papers, site photos.</p>
        )}
      </section>

      <section className={stock.section} aria-labelledby="docs-challans">
        <h2 id="docs-challans" className={stock.sectionTitle} style={{ marginBottom: "var(--space-2)" }}>
          Delivery challans
        </h2>
        <p className={stock.sectionHelp} style={{ marginBottom: "var(--space-4)" }}>
          Every posted issue to this project. Open one to print its delivery challan.
        </p>
        {challans.length ? (
          <ul className={stock.attachments}>
            {challans.map((c) => (
              <li key={c.id} className={stock.attachment}>
                <Link href={`/stock/${c.id}`} className={stock.mono}>
                  {c.displayNumber}
                </Link>
                <span className={stock.muted}>
                  {c.entryDate} · {c.itemCount} item{c.itemCount === 1 ? "" : "s"} · {c.warehouse.code}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={stock.muted}>No posted issues yet.</p>
        )}
      </section>
    </div>
  );
}

/* ───────────────────────────── 5. activity ───────────────────────────── */

interface Activity {
  statusHistory: { id: string; fromLabel: string | null; toLabel: string; changedBy: { name: string }; reason: string | null; at: string }[];
  audit: { id: string; at: string; by: string | null; text: string }[];
}

export function ActivityTab({ project }: { project: ProjectDto }) {
  const [a, setA] = useState<Activity | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ data: Activity }>(`/projects/${project.id}/activity`)
      .then((r) => setA(r.data))
      .catch((err) => setError(errorMessage(err)));
  }, [project.id]);
  if (error) return <Notification kind="error">{error}</Notification>;
  if (!a) return <p className={stock.muted}>Loading…</p>;
  return (
    <div className={stock.detailLayout}>
      <section className={stock.section} aria-labelledby="act-log">
        <h2 id="act-log" className={stock.sectionTitle} style={{ marginBottom: "var(--space-5)" }}>
          Audit log
        </h2>
        <ol className={stock.timeline}>
          {a.audit.map((x) => (
            <li key={x.id}>
              <div className={stock.timelineEvent}>{x.text}</div>
              <div className={stock.muted}>
                {formatDateTime(x.at)}
                {x.by ? ` · ${x.by}` : ""}
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className={stock.section} aria-labelledby="act-status">
        <h2 id="act-status" className={stock.sectionTitle} style={{ marginBottom: "var(--space-5)" }}>
          Status history
        </h2>
        <ol className={stock.timeline}>
          {a.statusHistory.map((h) => (
            <li key={h.id}>
              <div className={stock.timelineEvent}>{h.fromLabel ? `${h.fromLabel} → ${h.toLabel}` : `Created as ${h.toLabel.toLowerCase()}`}</div>
              <div className={stock.muted}>
                {formatDateTime(h.at)} · {h.changedBy.name}
              </div>
              {h.reason ? <div className={stock.muted}>“{h.reason}”</div> : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
