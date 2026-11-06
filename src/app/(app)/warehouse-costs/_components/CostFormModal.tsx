"use client";

import { useEffect, useRef, useState } from "react";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { FilePicker } from "@/components/ui/FilePicker";
import { FormProblems } from "@/components/ui/FormProblems";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage, upload } from "@/lib/api-client";
import { collect, revealProblems, rules } from "@/lib/validation";
import { newKey } from "../../stock/_components/types";
import { addMonths, OVERHEAD_LABEL, SCOPE_CATEGORIES, thisMonth, type CostWarning, type OverheadScope, type WarehouseCostCategory, type WarehouseCostDto, type WarehouseOption } from "./types";
import css from "./warehouse-costs.module.css";

export type SavedCost = WarehouseCostDto & { warnings?: CostWarning[] };

interface Form {
  scope: OverheadScope;
  warehouseId: string;
  category: WarehouseCostCategory;
  month: string;
  amount: string;
  description: string;
  vendorOrPayee: string;
  referenceNo: string;
  reason: string;
}

const formOf = (c: WarehouseCostDto | null, warehouses: WarehouseOption[]): Form =>
  c
    ? {
        scope: c.scope,
        warehouseId: c.warehouse?.id ?? "",
        category: c.category,
        month: c.month.slice(0, 7),
        amount: c.amount,
        description: c.description,
        vendorOrPayee: c.vendorOrPayee ?? "",
        referenceNo: c.referenceNo ?? "",
        reason: "",
      }
    : { scope: "WAREHOUSE", warehouseId: warehouses.length === 1 ? warehouses[0]!.id : "", category: "STORE_CHARGE", month: thisMonth(), amount: "", description: "", vendorOrPayee: "", referenceNo: "", reason: "" };

const LABELS: Record<string, string> = {
  scope: "Scope",
  warehouseId: "Warehouse",
  category: "Category",
  month: "Month",
  amount: "Amount",
  vendorOrPayee: "Payee / vendor",
  description: "Description",
  referenceNo: "Reference",
  reason: "Reason",
};

/** Reasons (void, edit): 3–500 characters; an optional one may be left empty. */
export const reasonProblem = (v: string, required: boolean) =>
  !v.trim() ? (required ? "Give a reason (at least 3 characters)." : undefined) : v.trim().length < 3 ? "Give a reason (at least 3 characters)." : rules.maxLength(v, 500);

/** Add (cost = null) or edit one register line. Receipts upload after the line is created. */
export function CostFormModal({ cost, warehouses, onClose, onSaved }: { cost: WarehouseCostDto | null; warehouses: WarehouseOption[]; onClose: () => void; onSaved: (c: SavedCost, receiptError?: string) => void }) {
  // Editable warehouses: active ones in the user's scope (plus the line's own, if it was deactivated).
  const choices = warehouses.filter((w) => w.isActive || w.id === cost?.warehouse?.id);
  const [form, setForm] = useState<Form>(() => formOf(cost, choices));
  const [receipt, setReceipt] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef(newKey());
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const setScope = (scope: OverheadScope) =>
    setForm((f) => ({ ...f, scope, category: SCOPE_CATEGORIES[scope].includes(f.category) ? f.category : SCOPE_CATEGORIES[scope][0]!, warehouseId: scope === "COMPANY" ? "" : f.warehouseId }));

  // Browser-side checks (same rules as the server); every problem is shown at once after the first attempt.
  const latestMonth = addMonths(thisMonth(), 1);
  const problems = collect(
    ["scope", rules.chosen(form.scope, "warehouse or company")],
    ["warehouseId", form.scope === "WAREHOUSE" ? rules.chosen(form.warehouseId, "the warehouse") : undefined],
    ["category", rules.chosen(form.category, "a category")],
    ["month", rules.chosen(form.month, "the month") ?? rules.notAfter(form.month, latestMonth, "The month can be next month at the latest.")],
    ["amount", rules.required(form.amount, "the amount") ?? rules.money(form.amount, { positive: true })],
    ["vendorOrPayee", rules.maxLength(form.vendorOrPayee, 150)],
    ["description", rules.required(form.description, "a description") ?? rules.maxLength(form.description, 300)],
    ["referenceNo", rules.maxLength(form.referenceNo, 100)],
    ["reason", cost ? reasonProblem(form.reason, false) : undefined],
  );
  const shownErrors = { ...errors, ...(attempt ? problems : {}) };
  // A server error on a field disappears once the form is edited.
  useEffect(() => setErrors({}), [form]);

  async function save() {
    setAttempt(true);
    setError(null);
    if (Object.keys(problems).length) return revealProblems(gridRef.current?.parentElement);
    setSaving(true);
    setErrors({});
    const body = {
      scope: form.scope,
      warehouseId: form.scope === "WAREHOUSE" ? form.warehouseId || null : null,
      category: form.category,
      month: form.month,
      amount: form.amount.trim(),
      description: form.description.trim(),
      vendorOrPayee: form.vendorOrPayee.trim() || null,
      referenceNo: form.referenceNo.trim() || null,
    };
    try {
      if (cost) {
        const r = await api<{ data: SavedCost }>(`/warehouse-costs/${cost.id}`, { method: "PATCH", body: { ...body, ...(form.reason.trim() ? { reason: form.reason.trim() } : {}) } });
        onSaved(r.data);
        return;
      }
      const r = await api<{ data: SavedCost }>("/warehouse-costs", { method: "POST", body, headers: { "Idempotency-Key": keyRef.current } });
      let receiptError: string | undefined;
      if (receipt) {
        const fd = new FormData();
        fd.append("file", receipt);
        fd.append("label", "Receipt");
        await upload(`/warehouse-costs/${r.data.id}/attachments`, fd).catch((err) => (receiptError = errorMessage(err)));
      }
      onSaved(r.data, receiptError);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors()).length) setErrors(err.fieldErrors());
      else setError(errorMessage(err));
      revealProblems(gridRef.current?.parentElement);
    } finally {
      keyRef.current = newKey();
      setSaving(false);
    }
  }

  return (
    <Modal open title={cost ? "Edit cost" : "Add cost"} label="Warehouse costs" primaryText={cost ? "Save changes" : "Add cost"} submitting={saving} onClose={onClose} onSubmit={() => void save()}>
      {attempt ? <FormProblems problems={problems} labels={LABELS} /> : null}
      {error ? <Notification kind="error">{error}</Notification> : null}
      <div ref={gridRef} className={css.formGrid}>
        <SelectField label="Scope" value={form.scope} onChange={(e) => setScope(e.target.value as OverheadScope)} error={shownErrors.scope}>
          <option value="WAREHOUSE">Warehouse</option>
          <option value="COMPANY">Company</option>
        </SelectField>
        {form.scope === "WAREHOUSE" ? (
          <SelectField searchable label="Warehouse *" value={form.warehouseId} onChange={(e) => set("warehouseId", e.target.value)} error={shownErrors.warehouseId}>
            <option value="">Choose…</option>
            {choices.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <TextField label="Warehouse" value="Company-wide" disabled readOnly error={shownErrors.warehouseId} />
        )}
        <SelectField label="Category" value={form.category} onChange={(e) => set("category", e.target.value as WarehouseCostCategory)} error={shownErrors.category}>
          {SCOPE_CATEGORIES[form.scope].map((c) => (
            <option key={c} value={c}>
              {OVERHEAD_LABEL[c]}
            </option>
          ))}
        </SelectField>
        <TextField label="Month *" type="month" max={latestMonth} value={form.month} onChange={(e) => set("month", e.target.value)} error={shownErrors.month} />
        <TextField label="Amount (৳) *" kind="money" value={form.amount} onChange={(e) => set("amount", e.target.value)} error={shownErrors.amount} />
        <TextField label="Payee / vendor" value={form.vendorOrPayee} onChange={(e) => set("vendorOrPayee", e.target.value)} error={shownErrors.vendorOrPayee} />
        <TextField label="Description *" value={form.description} onChange={(e) => set("description", e.target.value)} error={shownErrors.description} fieldClassName={css.full} placeholder={form.scope === "COMPANY" ? "e.g. Head office rent and salaries" : "e.g. Godown rent, security"} />
        <TextField label="Reference" value={form.referenceNo} onChange={(e) => set("referenceNo", e.target.value)} error={shownErrors.referenceNo} placeholder="Bill / voucher no." />
        {cost ? null : <FilePicker label="Receipt (optional)" file={receipt} onChange={setReceipt} hint="PDF, JPG, PNG or WebP · up to 10 MB · uploaded when you add the cost" className={css.full} />}
        {cost ? <TextAreaField label="Reason for the change (optional)" rows={2} value={form.reason} onChange={(e) => set("reason", e.target.value)} error={shownErrors.reason} helper="Kept in the history." fieldClassName={css.full} /> : null}
      </div>
    </Modal>
  );
}
