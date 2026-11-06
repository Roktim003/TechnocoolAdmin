"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox, TextField, Toggle } from "@/components/ui/Field";
import { FormProblems } from "@/components/ui/FormProblems";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { collect, rules } from "@/lib/validation";
import styles from "./stock.module.css";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface AlertSettingsDto {
  lowStockRoleIds: string[];
  digestEnabled: boolean;
  digestTime: string;
  roles: { id: string; name: string }[];
}

export function AlertSettingsForm({ initial }: { initial: AlertSettingsDto }) {
  const [s, setS] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(false);

  // Same rule as the server: the digest time is HH:mm (24-hour); only checked while the digest is on.
  const timeValid = TIME.test(s.digestTime ?? "");
  const problems = collect(["digestTime", s.digestEnabled ? (rules.required(s.digestTime, "the digest time") ?? (timeValid ? undefined : "Use HH:mm (24-hour), e.g. 09:00.")) : undefined]);
  const errors = { ...serverErrors, ...(attempt ? problems : {}) };

  // A server error disappears once the settings are edited.
  useEffect(() => setServerErrors({}), [s]);

  async function save() {
    setAttempt(true);
    setNotice(null);
    if (Object.keys(problems).length) return;
    setSaving(true);
    setServerErrors({});
    try {
      // A blank / odd time is left out while the digest is off, so it doesn't block saving the roles.
      const body = { lowStockRoleIds: s.lowStockRoleIds, digestEnabled: s.digestEnabled, ...(timeValid ? { digestTime: s.digestTime } : {}) };
      setS((await api<{ data: AlertSettingsDto }>("/alert-settings", { method: "PATCH", body })).data);
      setAttempt(false);
      setNotice({ kind: "success", message: "Alert settings saved." });
    } catch (err) {
      const fields = err instanceof ApiError ? err.fieldErrors() : {};
      setServerErrors(fields);
      setNotice({ kind: "error", message: Object.keys(fields).length ? "Some settings need fixing. The fields are marked in red below." : errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.section} id="alerts" style={{ maxWidth: 720 }}>
      <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-3)" }}>
        Low-stock alerts
      </h2>
      <p className={styles.muted} style={{ marginBottom: "var(--space-5)" }}>
        An alert fires once when a product&apos;s available stock (all warehouses) drops below its minimum, and again only after it has recovered.
      </p>
      {notice ? (
        <Notification kind={notice.kind} onClose={() => setNotice(null)} className={styles.full}>
          {notice.message}
        </Notification>
      ) : null}
      {attempt ? <FormProblems problems={problems} labels={{ digestTime: "Digest time" }} /> : null}
      <div className={styles.stack}>
        <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
          <legend className={styles.muted} style={{ marginBottom: "var(--space-3)" }}>
            Who receives low-stock alerts
          </legend>
          <div className={styles.stack} style={{ gap: "var(--space-3)" }}>
            {s.roles.map((r) => (
              <Checkbox
                key={r.id}
                label={r.name}
                checked={s.lowStockRoleIds.includes(r.id)}
                onChange={(e) => setS({ ...s, lowStockRoleIds: e.target.checked ? [...s.lowStockRoleIds, r.id] : s.lowStockRoleIds.filter((x) => x !== r.id) })}
              />
            ))}
          </div>
        </fieldset>
        <Toggle label="Daily digest email" description="Every morning, the full low-stock list by email (users can switch it off in their notification settings)." checked={s.digestEnabled} onChange={(v) => setS({ ...s, digestEnabled: v })} />
        {s.digestEnabled ? <TextField label="Digest time (Asia/Dhaka)" type="time" value={s.digestTime} onChange={(e) => setS({ ...s, digestTime: e.target.value })} error={errors.digestTime} style={{ maxWidth: 160 }} /> : null}
        <div>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save alert settings"}
          </Button>
        </div>
      </div>
    </section>
  );
}
