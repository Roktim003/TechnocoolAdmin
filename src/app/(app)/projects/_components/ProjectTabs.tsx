"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox, SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { FilePicker } from "@/components/ui/FilePicker";
import { FormProblems } from "@/components/ui/FormProblems";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { Pagination } from "@/components/ui/Pagination";
import { SkeletonLines } from "@/components/ui/Skeleton";
import { Tag } from "@/components/ui/Tag";
import { api, ApiError, errorMessage, upload, type Page } from "@/lib/api-client";
import { collect, revealProblems, rules } from "@/lib/validation";
import { formatDateTime, formatMoney } from "@/shared/time/format";
import { ENTRY_TYPE_META, formatQty, newKey, STATUS_LABEL, STATUS_TAG } from "../../stock/_components/types";
import {
  COST_CATEGORIES,
  COST_CATEGORY_LABEL,
  COST_CATEGORY_TAG,
  COST_SUBTOTAL_KEY,
  DIRECT_COST_CATEGORIES,
  isOverhead,
  OVERHEAD_CATEGORIES,
  type CostCategory,
  type CostDto,
  type CostHistoryDto,
  type CostWarning,
  type MaterialDto,
  type MovementDto,
  type ProjectAttachmentDto,
  type ProjectDto,
  type ProjectsCaps,
} from "./types";
import stock from "../../stock/_components/stock.module.css";
import styles from "./projects.module.css";
import { confirmDialog } from "@/components/ui/ConfirmDialog";

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
  if (!rows) return <SkeletonLines lines={5} />;
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
  if (!result) return <SkeletonLines lines={5} />;
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

/* ───────────────────────────── 3. labour, transport & other (+ overheads) ───────────────────────────── */

const emptyCost = (category: string = "LABOUR") => ({ date: today(), category, description: "", amount: "", vendorOrPayee: "", referenceNo: "", periodFrom: "", periodTo: "", basisNote: "", reason: "" });
type CostForm = ReturnType<typeof emptyCost>;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-01" → "Oct 2026". */
const monthLabel = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}/.test(iso) ? `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : "—");
const periodLabel = (from?: string | null, to?: string | null) => {
  if (!from && !to) return null;
  const a = monthLabel(from ?? to);
  const b = monthLabel(to ?? from);
  return a === b ? a : `${a} – ${b}`;
};
/** Month input ("2026-11") → a date in that month for the API ("2026-11-01"). */
const monthToDate = (v: string) => (v ? `${v}-01` : null);
const trimOrNull = (v: string) => v.trim() || null;

const COST_LABELS: Record<string, string> = {
  date: "Date",
  category: "Category",
  description: "Description",
  amount: "Amount",
  vendorOrPayee: "Payee / vendor",
  referenceNo: "Reference",
  periodFrom: "Period from",
  periodTo: "Period to",
  basisNote: "Basis note",
  reason: "Reason",
};

/** Reasons (void, status change, closed-project edits): 3–500 characters; an optional one may be left empty. */
export const reasonProblem = (v: string, required: boolean) =>
  !v.trim() ? (required ? "Give a reason (at least 3 characters)." : undefined) : v.trim().length < 3 ? "Give a reason (at least 3 characters)." : rules.maxLength(v, 500);

/** Browser-side checks for a cost line: the same rules as the server's AddCostSchema / UpdateCostSchema. */
function costProblems(f: CostForm, o: { overhead: boolean; reason: "required" | "optional" | null; dateRequired?: boolean }) {
  return collect(
    ["date", o.dateRequired ? rules.chosen(f.date, "a date") : undefined],
    ["category", rules.chosen(f.category, "a category")],
    ["description", rules.required(f.description, "a description") ?? rules.maxLength(f.description, 300)],
    ["amount", rules.required(f.amount, "the amount") ?? rules.money(f.amount, { positive: true })],
    ["vendorOrPayee", rules.maxLength(f.vendorOrPayee, 150)],
    ["referenceNo", rules.maxLength(f.referenceNo, 100)],
    ["periodTo", o.overhead ? rules.notBefore(f.periodTo, f.periodFrom, "Period to can't be before period from.") : undefined],
    ["basisNote", o.overhead ? rules.maxLength(f.basisNote, 300) : undefined],
    ["reason", o.reason ? reasonProblem(f.reason, o.reason === "required") : undefined],
  );
}

/** Body fields an overhead line adds (period, basis note, reason). */
function overheadBody(f: CostForm) {
  return { periodFrom: monthToDate(f.periodFrom), periodTo: monthToDate(f.periodTo), basisNote: trimOrNull(f.basisNote), ...(f.reason.trim() ? { reason: f.reason.trim() } : {}) };
}

function OverheadFields({ form, set, errors, reasonRequired, wide }: { form: CostForm; set: (k: keyof CostForm, v: string) => void; errors: Record<string, string>; reasonRequired: boolean; wide?: string }) {
  return (
    <>
      <TextField label="Period from" type="month" value={form.periodFrom} onChange={(e) => set("periodFrom", e.target.value)} error={errors.periodFrom} />
      <TextField label="Period to" type="month" min={form.periodFrom || undefined} value={form.periodTo} onChange={(e) => set("periodTo", e.target.value)} error={errors.periodTo} />
      <TextField label="Basis note" value={form.basisNote} onChange={(e) => set("basisNote", e.target.value)} error={errors.basisNote} placeholder="e.g. 2% of material issued" fieldClassName={wide} />
      {reasonRequired ? <TextField label="Reason *" value={form.reason} onChange={(e) => set("reason", e.target.value)} error={errors.reason} placeholder="The project is closed: why is this added now?" fieldClassName={wide} /> : null}
    </>
  );
}

function WarningsNotice({ warnings, onClose }: { warnings: CostWarning[]; onClose: () => void }) {
  if (!warnings.length) return null;
  return (
    <Notification kind="warning" title="Saved — please double-check" onClose={onClose}>
      {warnings.length === 1 ? (
        warnings[0]!.message
      ) : (
        <ul style={{ margin: 0, paddingLeft: "var(--s-4)" }}>
          {warnings.map((w) => (
            <li key={w.code}>{w.message}</li>
          ))}
        </ul>
      )}
    </Notification>
  );
}

export function CostsTab({ project, caps, onCount, onChanged }: { project: ProjectDto; caps: ProjectsCaps; onCount: (n: number) => void; onChanged: () => void }) {
  const acts = project.actions;
  const oh = acts.seeOverheads;
  // Direct categories while the project is open (projects ≥ CREATE); overheads with overheads ≥ CREATE + seeCost, any status.
  const categories: CostCategory[] = [...(acts.addCost ? DIRECT_COST_CATEGORIES : []), ...(acts.addOverhead ? OVERHEAD_CATEGORIES : [])];
  const [rows, setRows] = useState<CostDto[] | null>(null);
  const [subtotals, setSubtotals] = useState<Record<string, string>>({});
  const [showVoided, setShowVoided] = useState(false);
  const [form, setForm] = useState<CostForm>(() => emptyCost(categories[0]));
  const [receipt, setReceipt] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [warnings, setWarnings] = useState<CostWarning[]>([]);
  const [saving, setSaving] = useState(false);
  const [voiding, setVoiding] = useState<CostDto | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState<string | undefined>();
  const [voidAttempt, setVoidAttempt] = useState(false);
  const [attempt, setAttempt] = useState(false);
  const addRef = useRef<HTMLElement>(null);
  const [receipts, setReceipts] = useState<{ cost: CostDto; files: ProjectAttachmentDto[] } | null>(null);
  const [editing, setEditing] = useState<CostDto | null>(null);
  const [history, setHistory] = useState<CostDto | null>(null);
  const keyRef = useRef(newKey());

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

  const set = (k: keyof CostForm, v: string) => setForm((f) => ({ ...f, [k]: v }));
  // The project can close while the tab is open: fall back to a category that is still allowed.
  const category = categories.includes(form.category as CostCategory) ? (form.category as CostCategory) : categories[0];
  const overheadChosen = !!category && isOverhead(category);

  // Browser-side checks (same rules as the server); every problem is shown at once after the first attempt.
  const problems = costProblems({ ...form, category: category ?? "" }, { overhead: overheadChosen, reason: overheadChosen && acts.overheadReasonRequired ? "required" : null });
  const shownErrors = { ...errors, ...(attempt ? problems : {}) };
  // A server error on a field disappears once the form is edited.
  useEffect(() => setErrors({}), [form]);

  const voidProblems = collect(["reason", reasonProblem(voidReason, true)]);

  async function add() {
    if (!category) return;
    setAttempt(true);
    if (Object.keys(problems).length) {
      addRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const c = (
        await api<{ data: CostDto & { warnings?: CostWarning[] } }>(`/projects/${project.id}/costs`, {
          method: "POST",
          body: {
            date: form.date || undefined,
            category,
            description: form.description.trim(),
            amount: form.amount,
            vendorOrPayee: trimOrNull(form.vendorOrPayee),
            referenceNo: trimOrNull(form.referenceNo),
            ...(overheadChosen ? overheadBody(form) : {}),
          },
          headers: { "Idempotency-Key": keyRef.current },
        })
      ).data;
      if (receipt) {
        const fd = new FormData();
        fd.append("file", receipt);
        fd.append("label", "Receipt");
        await upload(`/projects/${project.id}/costs/${c.id}/attachments`, fd).catch((err) => setNotice({ kind: "error", message: `Cost added, but the receipt didn't upload: ${errorMessage(err)}` }));
      }
      setForm(emptyCost(category));
      setAttempt(false);
      setReceipt(null);
      setNotice((n) => n ?? { kind: "success", message: isOverhead(c.category) ? `${COST_CATEGORY_LABEL[c.category]} added.` : `${COST_CATEGORY_LABEL[c.category]} cost added.` });
      setWarnings(c.warnings ?? []);
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
    setVoidAttempt(true);
    setVoidError(undefined);
    if (Object.keys(voidProblems).length) return;
    try {
      await api(`/projects/${project.id}/costs/${voiding.id}/void`, { method: "POST", body: { reason: voidReason.trim() }, headers: { "Idempotency-Key": newKey() } });
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

  const canAdd = categories.length > 0;
  const option = (c: CostCategory) => (
    <option key={c} value={c}>
      {COST_CATEGORY_LABEL[c]}
    </option>
  );
  return (
    <div className={stock.stack}>
      {notice ? (
        <Notification kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.message}
        </Notification>
      ) : null}
      <WarningsNotice warnings={warnings} onClose={() => setWarnings([])} />

      {canAdd ? (
        <section ref={addRef} className={stock.section} aria-labelledby="add-cost">
          <h2 id="add-cost" className={stock.sectionTitle} style={{ marginBottom: "var(--space-5)" }}>
            {!acts.addOverhead ? "Add a cost" : acts.addCost ? "Add a cost or overhead" : "Add an overhead"}
          </h2>
          {project.status === "CLOSED" ? (
            <Notification kind="info" className={styles.formNote}>
              The project is closed: labour, transport and other costs can no longer be added or voided. Overheads can still be added or corrected, with a reason.
            </Notification>
          ) : null}
          {attempt && Object.keys(problems).length ? (
            <div className={styles.formNote}>
              <FormProblems problems={problems} labels={COST_LABELS} />
            </div>
          ) : null}
          <form
            className={styles.costForm}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <TextField label="Date" type="date" max={today()} value={form.date} onChange={(e) => set("date", e.target.value)} error={shownErrors.date} />
            <SelectField searchable label="Category" value={category} onChange={(e) => set("category", e.target.value)} error={shownErrors.category}>
              {acts.addOverhead ? (
                <>
                  {acts.addCost ? <optgroup label="Direct costs">{DIRECT_COST_CATEGORIES.map(option)}</optgroup> : null}
                  <optgroup label="Overheads">{OVERHEAD_CATEGORIES.map(option)}</optgroup>
                </>
              ) : (
                categories.map(option)
              )}
            </SelectField>
            <TextField label="Description *" value={form.description} onChange={(e) => set("description", e.target.value)} error={shownErrors.description} fieldClassName={styles.wide} />
            <TextField label="Amount (৳) *" kind="money" value={form.amount} onChange={(e) => set("amount", e.target.value)} error={shownErrors.amount} />
            <TextField label="Payee / vendor" value={form.vendorOrPayee} onChange={(e) => set("vendorOrPayee", e.target.value)} error={shownErrors.vendorOrPayee} />
            <TextField label="Reference" value={form.referenceNo} onChange={(e) => set("referenceNo", e.target.value)} error={shownErrors.referenceNo} placeholder="Bill / voucher no." />
            {overheadChosen ? <OverheadFields form={form} set={set} errors={shownErrors} reasonRequired={acts.overheadReasonRequired} wide={styles.wide} /> : null}
            <FilePicker label="Receipt (optional)" file={receipt} onChange={setReceipt} hint="PDF, JPG, PNG or WebP · up to 10 MB · uploaded when you add the cost" />
            <div>
              <Button type="submit" disabled={saving}>
                {saving ? "Adding…" : overheadChosen ? "Add overhead" : "Add cost"}
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
        <SkeletonLines lines={5} />
      ) : !rows.length ? (
        <div className={styles.empty}>{oh ? "No labour, transport, other or overhead costs yet." : "No labour, transport or other costs yet."}</div>
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
                const sub = subtotals[COST_SUBTOTAL_KEY[cat]];
                return (
                  <Fragment key={cat}>
                    {list.map((c) => {
                      const period = periodLabel(c.periodFrom, c.periodTo);
                      return (
                        <tr key={c.id} className={c.voided ? styles.voided : undefined}>
                          <td className={stock.nowrap}>{c.date}</td>
                          <td>
                            {oh ? <Tag kind={COST_CATEGORY_TAG[c.category]}>{c.categoryLabel}</Tag> : c.categoryLabel} {c.voided ? <Tag kind="gray" title={c.voidReason ?? undefined}>Voided</Tag> : null}
                          </td>
                          <td>
                            {c.description}
                            {c.referenceNo ? <div className={stock.lineMeta}>Ref {c.referenceNo}</div> : null}
                            {period ? <div className={stock.lineMeta}>Period {period}</div> : null}
                            {c.basisNote ? <div className={stock.lineMeta}>Basis: {c.basisNote}</div> : null}
                            {c.updatedBy ? <div className={stock.lineMeta}>Edited by {c.updatedBy.name}</div> : null}
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
                            ) : canUploadFor(project, c) ? (
                              <button type="button" className={stock.linkButton} onClick={() => openReceipts(c)}>
                                Add
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <div className={styles.rowActions}>
                              {c.actions.edit ? (
                                <Button kind="ghost" size="sm" onClick={() => setEditing(c)}>
                                  Edit
                                </Button>
                              ) : null}
                              {oh && c.actions.history ? (
                                <button type="button" className={stock.linkButton} onClick={() => setHistory(c)} aria-label={`History of ${c.description}`}>
                                  History
                                </button>
                              ) : null}
                              {c.actions.void ? (
                                <Button kind="ghost" size="sm" onClick={() => (setVoiding(c), setVoidReason(""), setVoidError(undefined), setVoidAttempt(false))}>
                                  Void
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
                  <td colSpan={5}>{oh ? "Labour, transport & other total (excluding voided)" : "Total (excluding voided)"}</td>
                  <td className={`${stock.right} ${stock.num}`}>{formatMoney(subtotals.costsTotal)}</td>
                  <td colSpan={2} />
                </tr>
              ) : null}
              {caps.seeCost && subtotals.overheadCost !== undefined ? (
                <tr className={styles.subtotal}>
                  <td colSpan={5}>Overheads total (excluding voided)</td>
                  <td className={`${stock.right} ${stock.num}`}>{formatMoney(subtotals.overheadCost)}</td>
                  <td colSpan={2} />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!voiding} title="Void cost" label={voiding?.description} primaryText="Void cost" primaryKind="danger" onClose={() => setVoiding(null)} onSubmit={() => void doVoid()}>
        <FormProblems problems={voidAttempt ? voidProblems : {}} labels={COST_LABELS} />
        <p style={{ marginBottom: "var(--space-5)" }}>The cost stays on record (struck through) but no longer counts in the totals. This can&apos;t be undone.</p>
        <TextAreaField
          label="Reason *"
          rows={3}
          value={voidReason}
          onChange={(e) => (setVoidReason(e.target.value), setVoidError(undefined))}
          error={(voidAttempt ? voidProblems.reason : undefined) ?? voidError}
          required
        />
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

      {editing ? (
        <EditOverheadModal
          project={project}
          cost={editing}
          onClose={() => setEditing(null)}
          onSaved={async (c) => {
            setEditing(null);
            setNotice({ kind: "success", message: `${COST_CATEGORY_LABEL[c.category]} updated.` });
            setWarnings(c.warnings ?? []);
            await load();
            onChanged();
          }}
        />
      ) : null}

      {history ? <CostHistoryModal project={project} cost={history} onClose={() => setHistory(null)} /> : null}
    </div>
  );
}

/** Edit an overhead line (PATCH). A reason is required on a closed project and kept in the history. */
function EditOverheadModal({ project, cost, onClose, onSaved }: { project: ProjectDto; cost: CostDto; onClose: () => void; onSaved: (c: CostDto & { warnings?: CostWarning[] }) => Promise<void> }) {
  const reasonRequired = project.actions.overheadReasonRequired;
  const [form, setForm] = useState<CostForm>(() => ({
    date: cost.date,
    category: cost.category,
    description: cost.description,
    amount: cost.amount ?? "",
    vendorOrPayee: cost.vendorOrPayee ?? "",
    referenceNo: cost.referenceNo ?? "",
    periodFrom: cost.periodFrom?.slice(0, 7) ?? "",
    periodTo: cost.periodTo?.slice(0, 7) ?? "",
    basisNote: cost.basisNote ?? "",
    reason: "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const set = (k: keyof CostForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Browser-side checks (same rules as the server); every problem is shown at once after the first attempt.
  const problems = costProblems(form, { overhead: true, reason: reasonRequired ? "required" : "optional", dateRequired: true });
  const shownErrors = { ...errors, ...(attempt ? problems : {}) };
  // A server error on a field disappears once the form is edited.
  useEffect(() => setErrors({}), [form]);

  async function save() {
    setAttempt(true);
    setError(null);
    if (Object.keys(problems).length) return revealProblems(gridRef.current?.parentElement);
    setSaving(true);
    setErrors({});
    try {
      const r = await api<{ data: CostDto & { warnings?: CostWarning[] } }>(`/projects/${project.id}/costs/${cost.id}`, {
        method: "PATCH",
        body: {
          date: form.date,
          category: form.category,
          description: form.description.trim(),
          amount: form.amount,
          vendorOrPayee: trimOrNull(form.vendorOrPayee),
          referenceNo: trimOrNull(form.referenceNo),
          ...overheadBody(form),
        },
      });
      await onSaved(r.data);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors()).length) setErrors(err.fieldErrors());
      else setError(errorMessage(err));
      revealProblems(gridRef.current?.parentElement);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title="Edit overhead" label={`${project.code} · ${cost.categoryLabel}`} primaryText="Save changes" submitting={saving} onClose={onClose} onSubmit={() => void save()}>
      {attempt ? <FormProblems problems={problems} labels={COST_LABELS} /> : null}
      {error ? <Notification kind="error">{error}</Notification> : null}
      <div ref={gridRef} className={stock.grid}>
        <TextField label="Date *" type="date" max={today()} value={form.date} onChange={(e) => set("date", e.target.value)} error={shownErrors.date} />
        <SelectField searchable label="Category" value={form.category} onChange={(e) => set("category", e.target.value)} error={shownErrors.category}>
          {OVERHEAD_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {COST_CATEGORY_LABEL[c]}
            </option>
          ))}
        </SelectField>
        <TextField label="Description *" value={form.description} onChange={(e) => set("description", e.target.value)} error={shownErrors.description} fieldClassName={stock.full} />
        <TextField label="Amount (৳) *" kind="money" value={form.amount} onChange={(e) => set("amount", e.target.value)} error={shownErrors.amount} />
        <TextField label="Payee / vendor" value={form.vendorOrPayee} onChange={(e) => set("vendorOrPayee", e.target.value)} error={shownErrors.vendorOrPayee} />
        <TextField label="Reference" value={form.referenceNo} onChange={(e) => set("referenceNo", e.target.value)} error={shownErrors.referenceNo} placeholder="Bill / voucher no." />
        <OverheadFields form={form} set={set} errors={shownErrors} reasonRequired={false} wide={stock.full} />
        <TextAreaField
          label={reasonRequired ? "Reason *" : "Reason (optional)"}
          rows={2}
          value={form.reason}
          onChange={(e) => set("reason", e.target.value)}
          error={shownErrors.reason}
          helper={reasonRequired ? "The project is closed. The reason is kept in the history." : "Kept in the history."}
          fieldClassName={stock.full}
        />
      </div>
    </Modal>
  );
}

const HISTORY_FIELD_LABEL: Record<string, string> = {
  amount: "Amount",
  category: "Category",
  description: "Description",
  date: "Date",
  vendorOrPayee: "Payee / vendor",
  referenceNo: "Reference",
  periodFrom: "Period from",
  periodTo: "Period to",
  basisNote: "Basis note",
};

function historyValue(field: string, v: string | null) {
  if (v === null || v === "") return "—";
  if (field === "amount") return formatMoney(v);
  if (field === "category") return COST_CATEGORY_LABEL[v as CostCategory] ?? v;
  if (field === "periodFrom" || field === "periodTo") return monthLabel(v);
  return v;
}

/** Who changed a cost line and when: old → new amounts and fields, with the reason. */
function CostHistoryModal({ project, cost, onClose }: { project: ProjectDto; cost: CostDto; onClose: () => void }) {
  const [rows, setRows] = useState<CostHistoryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ data: { history: CostHistoryDto[] } }>(`/projects/${project.id}/costs/${cost.id}/history`)
      .then((r) => setRows(r.data.history))
      .catch((err) => setError(errorMessage(err)));
  }, [project.id, cost.id]);
  const title = (h: CostHistoryDto) => (h.action === "CREATED" ? "Added" : h.action === "VOIDED" ? "Voided" : "Edited");
  return (
    <Modal open title="History" label={cost.description} primaryText="Done" onClose={onClose} onSubmit={onClose} size="sm">
      {error ? <Notification kind="error">{error}</Notification> : null}
      {!rows && !error ? <SkeletonLines lines={4} /> : null}
      {rows ? (
        rows.length ? (
          <ol className={stock.timeline}>
            {rows.map((h) => (
              <li key={h.id}>
                <div className={stock.timelineEvent}>
                  {title(h)}
                  {h.action === "EDITED" && h.amountBefore !== undefined && h.amount !== undefined && h.amountBefore !== h.amount ? (
                    <>
                      {" "}
                      · {formatMoney(h.amountBefore)} → <strong>{formatMoney(h.amount)}</strong>
                    </>
                  ) : h.action !== "EDITED" && h.amount ? (
                    ` · ${formatMoney(h.amount)}`
                  ) : null}
                </div>
                {h.changes
                  .filter((c) => c.field !== "amount")
                  .map((c) => (
                    <div key={c.field} className={stock.muted}>
                      {HISTORY_FIELD_LABEL[c.field] ?? c.field}: {historyValue(c.field, c.from)} → {historyValue(c.field, c.to)}
                    </div>
                  ))}
                {h.reason ? <div className={stock.muted}>“{h.reason}”</div> : null}
                <div className={stock.muted}>
                  {formatDateTime(h.at)} · {h.by?.name ?? "System"}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className={stock.muted}>No history recorded.</p>
        )
      ) : null}
    </Modal>
  );
}

/** Receipts on an overhead line need overheads ≥ CREATE (Accounts has projects VIEW); other lines projects ≥ CREATE. */
const canUploadFor = (project: ProjectDto, c: CostDto) => (isOverhead(c.category) ? project.actions.addOverhead : project.actions.upload);

function ReceiptsModal({ project, cost, files, onClose, onChanged }: { project: ProjectDto; cost: CostDto; files: ProjectAttachmentDto[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canUpload = canUploadFor(project, cost);
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
      {canUpload ? (
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
    if (!(await confirmDialog({ title: `Remove ${a.fileName}?`, message: "The file is removed from this project. This can't be undone.", confirmText: "Remove file", danger: true }))) return;
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
          <SkeletonLines lines={5} />
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
  if (!a) return <SkeletonLines lines={5} />;
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
