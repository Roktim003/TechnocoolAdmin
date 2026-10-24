"use client";

import { useEffect, useState } from "react";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { CURRENCIES, type SupplierDto } from "./types";
import styles from "../../stock/_components/stock.module.css";

type Form = Record<string, string>;

const nul = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
const formOf = (s?: SupplierDto | null): Form => ({
  name: s?.name ?? "",
  type: s?.type ?? "LOCAL",
  defaultCurrency: s?.defaultCurrency ?? "BDT",
  contactPerson: s?.contactPerson ?? "",
  phone: s?.phone ?? "",
  email: s?.email ?? "",
  address: s?.address ?? "",
  brandsSupplied: s?.brandsSupplied ?? "",
  paymentTermsNote: s?.paymentTermsNote ?? "",
  notes: s?.notes ?? "",
});

/** Add or edit a supplier (purchasing FULL). The code (SUP-001…) is assigned by the server. */
export function SupplierFormModal({ open, supplier, onClose, onSaved }: { open: boolean; supplier?: SupplierDto | null; onClose: () => void; onSaved: (s: SupplierDto) => void }) {
  const [f, setF] = useState<Form>(formOf(supplier));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setF(formOf(supplier));
      setErrors({});
      setError(null);
    }
  }, [open, supplier]);

  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    setSaving(true);
    setError(null);
    const body = {
      name: f.name?.trim(),
      type: f.type,
      defaultCurrency: f.type === "LOCAL" ? "BDT" : f.defaultCurrency,
      contactPerson: nul(f.contactPerson),
      phone: nul(f.phone),
      email: nul(f.email),
      address: nul(f.address),
      brandsSupplied: nul(f.brandsSupplied),
      paymentTermsNote: nul(f.paymentTermsNote),
      notes: nul(f.notes),
    };
    try {
      const r = supplier ? await api<{ data: SupplierDto }>(`/suppliers/${supplier.id}`, { method: "PATCH", body }) : await api<{ data: SupplierDto }>("/suppliers", { method: "POST", body });
      onSaved(r.data);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      if (!(err instanceof ApiError) || !Object.keys(err.fieldErrors()).length) setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title={supplier ? "Edit supplier" : "Add supplier"} label={supplier?.code} submitting={saving} onClose={onClose} onSubmit={() => void save()}>
      {error ? (
        <div style={{ marginBottom: "var(--space-5)" }}>
          <Notification kind="error">{error}</Notification>
        </div>
      ) : null}
      <div className={styles.grid}>
        <TextField label="Name" value={f.name} onChange={(e) => set("name", e.target.value)} error={errors.name} required fieldClassName={styles.full} helper={supplier ? undefined : "The code (SUP-001, SUP-002…) is assigned automatically."} />
        <SelectField
          label="Type"
          value={f.type}
          onChange={(e) => {
            set("type", e.target.value);
            set("defaultCurrency", e.target.value === "LOCAL" ? "BDT" : f.defaultCurrency === "BDT" ? "USD" : f.defaultCurrency!);
          }}
          helper="Foreign suppliers get imported POs in their currency."
        >
          <option value="LOCAL">Local</option>
          <option value="FOREIGN">Foreign</option>
        </SelectField>
        <SelectField label="Default currency" value={f.defaultCurrency} onChange={(e) => set("defaultCurrency", e.target.value)} error={errors.defaultCurrency} disabled={f.type === "LOCAL"}>
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </SelectField>
        <TextField label="Contact person" value={f.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} error={errors.contactPerson} />
        <TextField label="Phone" value={f.phone} onChange={(e) => set("phone", e.target.value)} error={errors.phone} />
        <TextField label="Email" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} error={errors.email} helper="POs are emailed here." />
        <TextField label="Brands supplied" value={f.brandsSupplied} onChange={(e) => set("brandsSupplied", e.target.value)} error={errors.brandsSupplied} placeholder="LG, Daikin" />
        <TextAreaField label="Address" rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} error={errors.address} fieldClassName={styles.full} />
        <TextField label="Payment terms" value={f.paymentTermsNote} onChange={(e) => set("paymentTermsNote", e.target.value)} error={errors.paymentTermsNote} placeholder="30 days after delivery" fieldClassName={styles.full} />
        <TextAreaField label="Notes" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} error={errors.notes} fieldClassName={styles.full} />
      </div>
    </Modal>
  );
}
