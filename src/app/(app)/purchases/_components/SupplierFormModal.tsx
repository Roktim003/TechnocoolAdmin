"use client";

import { useEffect, useRef, useState } from "react";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { FormProblems } from "@/components/ui/FormProblems";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { collect, revealProblems, rules } from "@/lib/validation";
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

const LABELS: Record<string, string> = {
  name: "Name",
  type: "Type",
  defaultCurrency: "Default currency",
  contactPerson: "Contact person",
  phone: "Phone",
  email: "Email",
  brandsSupplied: "Brands supplied",
  address: "Address",
  paymentTermsNote: "Payment terms",
  notes: "Notes",
};

/** Add or edit a supplier (purchasing FULL). The code (SUP-001…) is assigned by the server. */
export function SupplierFormModal({ open, supplier, onClose, onSaved }: { open: boolean; supplier?: SupplierDto | null; onClose: () => void; onSaved: (s: SupplierDto) => void }) {
  const [f, setF] = useState<Form>(formOf(supplier));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setF(formOf(supplier));
      setErrors({});
      setError(null);
      setAttempt(false);
    }
  }, [open, supplier]);

  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  // Browser-side checks (same rules as the server's supplier DTO); every problem is shown at once.
  const problems = collect(
    ["name", rules.required(f.name, "the supplier's name") ?? rules.maxLength(f.name, 150)],
    ["defaultCurrency", f.type === "FOREIGN" ? rules.chosen(f.defaultCurrency, "a currency") : undefined],
    ["contactPerson", rules.maxLength(f.contactPerson, 100)],
    ["phone", rules.phone(f.phone)],
    ["email", rules.email(f.email)],
    ["brandsSupplied", rules.maxLength(f.brandsSupplied, 300)],
    ["address", rules.maxLength(f.address, 300)],
    ["paymentTermsNote", rules.maxLength(f.paymentTermsNote, 500)],
    ["notes", rules.maxLength(f.notes, 2000)],
  );
  const shownErrors = { ...errors, ...(attempt ? problems : {}) };

  // A server error on a field disappears once the form is edited.
  useEffect(() => setErrors({}), [f]);

  async function save() {
    setAttempt(true);
    setError(null);
    // The modal body is the scroll area that holds the summary.
    if (Object.keys(problems).length) return revealProblems(topRef.current?.parentElement);
    setSaving(true);
    setErrors({});
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
      const fields = err instanceof ApiError ? err.fieldErrors() : {};
      setErrors(fields);
      // Field problems are marked on the fields; only say something general when there are none.
      setError(Object.keys(fields).length ? "Some details need fixing. The fields are marked in red below." : errorMessage(err));
      revealProblems(topRef.current?.parentElement);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title={supplier ? "Edit supplier" : "Add supplier"} label={supplier?.code} submitting={saving} onClose={onClose} onSubmit={() => void save()}>
      <div ref={topRef} className={styles.stack}>
        {attempt ? <FormProblems problems={problems} labels={LABELS} /> : null}
        {error ? (
          <Notification kind="error" onClose={() => setError(null)}>
            {error}
          </Notification>
        ) : null}
        <div className={styles.grid}>
          <TextField label="Name *" value={f.name} onChange={(e) => set("name", e.target.value)} error={shownErrors.name} required fieldClassName={styles.full} helper={supplier ? undefined : "The code (SUP-001, SUP-002…) is assigned automatically."} />
          <SelectField
            label="Type"
            value={f.type}
            onChange={(e) => {
              set("type", e.target.value);
              set("defaultCurrency", e.target.value === "LOCAL" ? "BDT" : f.defaultCurrency === "BDT" ? "USD" : f.defaultCurrency!);
            }}
            error={shownErrors.type}
            helper="Foreign suppliers get imported POs in their currency."
          >
            <option value="LOCAL">Local</option>
            <option value="FOREIGN">Foreign</option>
          </SelectField>
          <SelectField label="Default currency" value={f.defaultCurrency} onChange={(e) => set("defaultCurrency", e.target.value)} error={shownErrors.defaultCurrency} disabled={f.type === "LOCAL"}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectField>
          <TextField label="Contact person" value={f.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} error={shownErrors.contactPerson} />
          <TextField label="Phone" kind="phone" placeholder="e.g. 01711-000000" value={f.phone} onChange={(e) => set("phone", e.target.value)} error={shownErrors.phone} />
          <TextField label="Email" type="email" placeholder="name@company.com" value={f.email} onChange={(e) => set("email", e.target.value)} error={shownErrors.email} helper="POs are emailed here." />
          <TextField label="Brands supplied" value={f.brandsSupplied} onChange={(e) => set("brandsSupplied", e.target.value)} error={shownErrors.brandsSupplied} placeholder="LG, Daikin" />
          <TextAreaField label="Address" rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} error={shownErrors.address} fieldClassName={styles.full} />
          <TextField label="Payment terms" value={f.paymentTermsNote} onChange={(e) => set("paymentTermsNote", e.target.value)} error={shownErrors.paymentTermsNote} placeholder="30 days after delivery" fieldClassName={styles.full} />
          <TextAreaField label="Notes" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} error={shownErrors.notes} fieldClassName={styles.full} />
        </div>
      </div>
    </Modal>
  );
}
