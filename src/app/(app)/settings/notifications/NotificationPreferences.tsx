"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Field";
import { Notification } from "@/components/ui/Notification";
import { api, errorMessage } from "@/lib/api-client";
import styles from "../../stock/_components/stock.module.css";

interface Pref {
  type: string;
  label: string;
  description: string;
  inApp: boolean;
  email: boolean;
}

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Pref[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    api<{ data: Pref[] }>("/notification-preferences")
      .then((r) => setPrefs(r.data))
      .catch((err) => setNotice({ kind: "error", message: errorMessage(err) }));
  }, []);

  async function save() {
    if (!prefs) return;
    setSaving(true);
    try {
      setPrefs((await api<{ data: Pref[] }>("/notification-preferences", { method: "PATCH", body: { preferences: prefs.map((p) => ({ type: p.type, email: p.email })) } })).data);
      setNotice({ kind: "success", message: "Preferences saved." });
    } catch (err) {
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
        <p className={styles.muted} style={{ marginBottom: "var(--space-5)" }}>
          In-app notifications (the bell) are always on. Choose which ones also come by email; you need an email address on your user.
        </p>
        <div className={styles.stack}>
          {prefs?.map((p) => (
            <Toggle
              key={p.type}
              label={`${p.label}${p.inApp ? "" : " (email only)"}`}
              description={p.description}
              checked={p.email}
              onChange={(v) => setPrefs((xs) => xs!.map((x) => (x.type === p.type ? { ...x, email: v } : x)))}
            />
          ))}
        </div>
      </section>
      <div>
        <Button onClick={save} disabled={saving || !prefs}>
          {saving ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </div>
  );
}
