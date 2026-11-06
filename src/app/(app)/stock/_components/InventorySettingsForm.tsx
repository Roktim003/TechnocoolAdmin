"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox, FieldGroup, TextField, Toggle } from "@/components/ui/Field";
import { FormProblems } from "@/components/ui/FormProblems";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { collect, revealProblems, rules } from "@/lib/validation";
import { DOC_LABEL, DOC_TYPES, type ImportDocType } from "./import-docs";
import styles from "./stock.module.css";

export interface SettingsDto {
  defaultSalesVatPercent: string;
  adminWriteOffNeedsApproval: boolean;
  allowAdminBelowCostSale: boolean;
  fiscalYearStartMonth: number;
  importDocsRequiredToPost: ImportDocType[];
}

export function InventorySettingsForm({ initial }: { initial: SettingsDto }) {
  const [s, setS] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(false);

  // Same rule as the server's PercentSchema: 0–100 with at most 2 decimals.
  const problems = collect(["defaultSalesVatPercent", rules.required(s.defaultSalesVatPercent, "the default VAT %") ?? rules.percent(s.defaultSalesVatPercent)]);
  const errors = { ...serverErrors, ...(attempt ? problems : {}) };

  // A server error disappears once the settings are edited.
  useEffect(() => setServerErrors({}), [s]);

  async function save() {
    setAttempt(true);
    setNotice(null);
    if (Object.keys(problems).length) {
      revealProblems();
      return;
    }
    setSaving(true);
    setServerErrors({});
    try {
      const r = await api<{ data: SettingsDto }>("/inventory-settings", {
        method: "PATCH",
        body: {
          defaultSalesVatPercent: s.defaultSalesVatPercent.trim(),
          adminWriteOffNeedsApproval: s.adminWriteOffNeedsApproval,
          allowAdminBelowCostSale: s.allowAdminBelowCostSale,
          importDocsRequiredToPost: s.importDocsRequiredToPost,
        },
      });
      setS(r.data);
      setAttempt(false);
      setNotice({ kind: "success", message: "Settings saved." });
    } catch (err) {
      const fields = err instanceof ApiError ? err.fieldErrors() : {};
      setServerErrors(fields);
      setNotice({ kind: "error", message: Object.keys(fields).length ? "Some settings need fixing. The fields are marked in red below." : errorMessage(err) });
      revealProblems();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.stack} style={{ maxWidth: 720 }}>
      {notice ? (
        <Notification kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.message}
        </Notification>
      ) : null}
      {attempt ? <FormProblems problems={problems} labels={{ defaultSalesVatPercent: "Default VAT %" }} /> : null}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-5)" }}>
          Sales
        </h2>
        <div className={styles.stack}>
          <TextField label="Default VAT %" kind="percent" value={s.defaultSalesVatPercent} onChange={(e) => setS({ ...s, defaultSalesVatPercent: e.target.value })} error={errors.defaultSalesVatPercent} helper="0–100. Pre-filled on new sales; can be changed per sale." />
          <Toggle
            label="Admin may sell below average cost"
            description="When on, an Admin can confirm a sale priced below average cost (it is audit-logged). When off, nobody can."
            checked={s.allowAdminBelowCostSale}
            onChange={(v) => setS({ ...s, allowAdminBelowCostSale: v })}
          />
        </div>
      </section>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-5)" }}>
          Verification
        </h2>
        <Toggle
          label="Admin write-offs need verification"
          description="When on, even an Admin's damage/loss write-off goes to Pending verification and another approver must approve it."
          checked={s.adminWriteOffNeedsApproval}
          onChange={(v) => setS({ ...s, adminWriteOffNeedsApproval: v })}
        />
      </section>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-2)" }}>
          Import documents
        </h2>
        <p className={styles.sectionHelp} style={{ marginBottom: "var(--space-5)" }}>
          A GRN (Imported) can&apos;t be posted or approved until each document ticked here has its number and at least one file.
        </p>
        <FieldGroup legend="Required before posting">
          {DOC_TYPES.map((t) => (
            <Checkbox
              key={t}
              label={`${DOC_LABEL[t]} (${t})`}
              checked={s.importDocsRequiredToPost.includes(t)}
              onChange={(e) => setS({ ...s, importDocsRequiredToPost: e.target.checked ? DOC_TYPES.filter((d) => d === t || s.importDocsRequiredToPost.includes(d)) : s.importDocsRequiredToPost.filter((d) => d !== t) })}
            />
          ))}
        </FieldGroup>
      </section>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-3)" }}>
          Numbering
        </h2>
        <p className={styles.muted}>
          Document numbers run per type and fiscal year (July–June), e.g. GRN-L-2627-0001 for July 2026 – June 2027. They are assigned when an entry is submitted or posted, with no gaps.
        </p>
      </section>
      <div>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
