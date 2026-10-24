"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField, Toggle } from "@/components/ui/Field";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import styles from "./stock.module.css";

export interface SettingsDto {
  defaultSalesVatPercent: string;
  adminWriteOffNeedsApproval: boolean;
  allowAdminBelowCostSale: boolean;
  fiscalYearStartMonth: number;
}

export function InventorySettingsForm({ initial }: { initial: SettingsDto }) {
  const [s, setS] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [vatError, setVatError] = useState<string | undefined>();

  async function save() {
    setSaving(true);
    setVatError(undefined);
    try {
      const r = await api<{ data: SettingsDto }>("/inventory-settings", {
        method: "PATCH",
        body: { defaultSalesVatPercent: s.defaultSalesVatPercent, adminWriteOffNeedsApproval: s.adminWriteOffNeedsApproval, allowAdminBelowCostSale: s.allowAdminBelowCostSale },
      });
      setS(r.data);
      setNotice({ kind: "success", message: "Settings saved." });
    } catch (err) {
      if (err instanceof ApiError) setVatError(err.fieldErrors().defaultSalesVatPercent);
      setNotice({ kind: "error", message: errorMessage(err) });
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
      <section className={styles.section}>
        <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-5)" }}>
          Sales
        </h2>
        <div className={styles.stack}>
          <TextField label="Default VAT %" inputMode="decimal" value={s.defaultSalesVatPercent} onChange={(e) => setS({ ...s, defaultSalesVatPercent: e.target.value })} error={vatError} helper="Pre-filled on new sales; can be changed per sale." />
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
