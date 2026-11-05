"use client";

import { useRef, useState } from "react";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage, upload } from "@/lib/api-client";
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

/** Add (cost = null) or edit one register line. Receipts upload after the line is created. */
export function CostFormModal({ cost, warehouses, onClose, onSaved }: { cost: WarehouseCostDto | null; warehouses: WarehouseOption[]; onClose: () => void; onSaved: (c: SavedCost, receiptError?: string) => void }) {
  // Editable warehouses: active ones in the user's scope (plus the line's own, if it was deactivated).
  const choices = warehouses.filter((w) => w.isActive || w.id === cost?.warehouse?.id);
  const [form, setForm] = useState<Form>(() => formOf(cost, choices));
  const [receipt, setReceipt] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const keyRef = useRef(newKey());
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const setScope = (scope: OverheadScope) =>
    setForm((f) => ({ ...f, scope, category: SCOPE_CATEGORIES[scope].includes(f.category) ? f.category : SCOPE_CATEGORIES[scope][0]!, warehouseId: scope === "COMPANY" ? "" : f.warehouseId }));

  async function save() {
    setSaving(true);
    setErrors({});
    setError(null);
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
    } finally {
      keyRef.current = newKey();
      setSaving(false);
    }
  }

  return (
    <Modal open title={cost ? "Edit cost" : "Add cost"} label="Warehouse costs" primaryText={cost ? "Save changes" : "Add cost"} submitting={saving} onClose={onClose} onSubmit={() => void save()}>
      {error ? <Notification kind="error">{error}</Notification> : null}
      <div className={css.formGrid}>
        <SelectField label="Scope" value={form.scope} onChange={(e) => setScope(e.target.value as OverheadScope)} error={errors.scope}>
          <option value="WAREHOUSE">Warehouse</option>
          <option value="COMPANY">Company</option>
        </SelectField>
        {form.scope === "WAREHOUSE" ? (
          <SelectField label="Warehouse *" value={form.warehouseId} onChange={(e) => set("warehouseId", e.target.value)} error={errors.warehouseId}>
            <option value="">Choose…</option>
            {choices.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <TextField label="Warehouse" value="Company-wide" disabled readOnly error={errors.warehouseId} />
        )}
        <SelectField label="Category" value={form.category} onChange={(e) => set("category", e.target.value as WarehouseCostCategory)} error={errors.category}>
          {SCOPE_CATEGORIES[form.scope].map((c) => (
            <option key={c} value={c}>
              {OVERHEAD_LABEL[c]}
            </option>
          ))}
        </SelectField>
        <TextField label="Month *" type="month" max={addMonths(thisMonth(), 1)} value={form.month} onChange={(e) => set("month", e.target.value)} error={errors.month} />
        <TextField label="Amount (৳) *" inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value)} error={errors.amount} />
        <TextField label="Payee / vendor" value={form.vendorOrPayee} onChange={(e) => set("vendorOrPayee", e.target.value)} error={errors.vendorOrPayee} />
        <TextField label="Description *" value={form.description} onChange={(e) => set("description", e.target.value)} error={errors.description} fieldClassName={css.full} placeholder={form.scope === "COMPANY" ? "e.g. Head office rent and salaries" : "e.g. Godown rent, security"} />
        <TextField label="Reference" value={form.referenceNo} onChange={(e) => set("referenceNo", e.target.value)} error={errors.referenceNo} placeholder="Bill / voucher no." />
        {cost ? null : (
          <div>
            <label className={css.fileLabel} htmlFor="wc-receipt">
              Receipt (optional)
            </label>
            <input id="wc-receipt" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
          </div>
        )}
        {cost ? <TextAreaField label="Reason for the change (optional)" rows={2} value={form.reason} onChange={(e) => set("reason", e.target.value)} error={errors.reason} helper="Kept in the history." fieldClassName={css.full} /> : null}
      </div>
    </Modal>
  );
}
