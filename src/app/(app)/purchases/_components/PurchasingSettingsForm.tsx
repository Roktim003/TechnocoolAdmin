"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import styles from "../../stock/_components/stock.module.css";

export interface PurchasingSettingsDto {
  defaultTerms: string | null;
  defaultVatPercent: string;
}

export function PurchasingSettingsForm({ initial }: { initial: PurchasingSettingsDto }) {
  const [terms, setTerms] = useState(initial.defaultTerms ?? "");
  const [vat, setVat] = useState(initial.defaultVatPercent);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  async function save() {
    setSaving(true);
    setErrors({});
    try {
      const r = (await api<{ data: PurchasingSettingsDto }>("/purchasing-settings", { method: "PATCH", body: { defaultTerms: terms.trim() || null, defaultVatPercent: vat } })).data;
      setTerms(r.defaultTerms ?? "");
      setVat(r.defaultVatPercent);
      setNotice({ kind: "success", message: "Purchasing settings saved. New POs use them; existing POs keep their own terms." });
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setNotice({ kind: "error", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.section} style={{ maxWidth: 720 }}>
      <div className={styles.stack}>
        {notice ? (
          <Notification kind={notice.kind} onClose={() => setNotice(null)}>
            {notice.message}
          </Notification>
        ) : null}
        <TextField label="Default VAT % (local POs)" inputMode="decimal" value={vat} onChange={(e) => setVat(e.target.value)} error={errors.defaultVatPercent} />
        <TextAreaField label="Default terms & conditions" rows={8} value={terms} onChange={(e) => setTerms(e.target.value)} error={errors.defaultTerms} helper="Pre-filled on new POs and printed on the PO PDF." />
        <div>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>
    </section>
  );
}
