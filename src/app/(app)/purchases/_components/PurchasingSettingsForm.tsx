"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { FormProblems } from "@/components/ui/FormProblems";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { collect, revealProblems, rules } from "@/lib/validation";
import styles from "../../stock/_components/stock.module.css";

export interface PurchasingSettingsDto {
  defaultTerms: string | null;
  defaultVatPercent: string;
}

const LABELS: Record<string, string> = { defaultVatPercent: "Default VAT %", defaultTerms: "Default terms & conditions" };

export function PurchasingSettingsForm({ initial }: { initial: PurchasingSettingsDto }) {
  const [terms, setTerms] = useState(initial.defaultTerms ?? "");
  const [vat, setVat] = useState(initial.defaultVatPercent);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  // Browser-side checks (same rules as the server); every problem is shown at once.
  const problems = collect(
    ["defaultVatPercent", rules.required(vat, "the VAT % (0 if none)") ?? rules.percent(vat)],
    ["defaultTerms", rules.maxLength(terms, 5000)],
  );
  const shownErrors = { ...errors, ...(attempt ? problems : {}) };

  // A server error on a field disappears once that field is edited.
  useEffect(() => setErrors({}), [terms, vat]);

  async function save() {
    setAttempt(true);
    setNotice(null);
    if (Object.keys(problems).length) {
      revealProblems();
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const r = (await api<{ data: PurchasingSettingsDto }>("/purchasing-settings", { method: "PATCH", body: { defaultTerms: terms.trim() || null, defaultVatPercent: vat.trim() } })).data;
      setTerms(r.defaultTerms ?? "");
      setVat(r.defaultVatPercent);
      setAttempt(false);
      setNotice({ kind: "success", message: "Purchasing settings saved. New POs use them; existing POs keep their own terms." });
    } catch (err) {
      const fields = err instanceof ApiError ? err.fieldErrors() : {};
      setErrors(fields);
      // Field problems are marked on the fields; only say something general when there are none.
      setNotice({ kind: "error", message: Object.keys(fields).length ? "Some details need fixing. The fields are marked in red below." : errorMessage(err) });
      revealProblems();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.section} style={{ maxWidth: 720 }}>
      <form
        className={styles.stack}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {notice ? (
          <Notification kind={notice.kind} onClose={() => setNotice(null)}>
            {notice.message}
          </Notification>
        ) : null}
        {attempt ? <FormProblems problems={problems} labels={LABELS} /> : null}
        <TextField label="Default VAT % (local POs)" kind="percent" value={vat} onChange={(e) => setVat(e.target.value)} error={shownErrors.defaultVatPercent} helper="0 to 100, up to 2 decimals." />
        <TextAreaField label="Default terms & conditions" rows={8} value={terms} onChange={(e) => setTerms(e.target.value)} error={shownErrors.defaultTerms} helper="Pre-filled on new POs and printed on the PO PDF." />
        <div>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </form>
    </section>
  );
}
