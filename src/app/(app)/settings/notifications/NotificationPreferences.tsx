"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Field";
import { Notification } from "@/components/ui/Notification";
import { api, errorMessage } from "@/lib/api-client";
import { popupStatus, POPUPS_CHANGED, showPopup, turnOffPopups, turnOnPopups, type PopupStatus } from "@/lib/browser-popups";
import styles from "../../stock/_components/stock.module.css";

interface Pref {
  type: string;
  label: string;
  description: string;
  inApp: boolean;
  email: boolean;
  /** Push to the mobile app (in-app types only). */
  push: boolean;
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

  const set = (type: string, change: Partial<Pref>) => setPrefs((xs) => xs!.map((x) => (x.type === type ? { ...x, ...change } : x)));

  async function save() {
    if (!prefs) return;
    setSaving(true);
    try {
      const body = { preferences: prefs.map((p) => (p.inApp ? { type: p.type, email: p.email, push: p.push } : { type: p.type, email: p.email })) };
      setPrefs((await api<{ data: Pref[] }>("/notification-preferences", { method: "PATCH", body })).data);
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
      <BrowserPopups />
      <section className={styles.section}>
        <p className={styles.muted} style={{ marginBottom: "var(--space-5)" }}>
          In-app notifications (the bell) are always on. Choose which ones also come by email (you need an email address on your user) and as a push
          notification on the phones where you use the TechnoCool Inventory app.
        </p>
        <div className={styles.stack}>
          {prefs?.map((p) => (
            <div key={p.type}>
              <strong>
                {p.label}
                {p.inApp ? "" : " (email only)"}
              </strong>
              <p className={styles.muted}>{p.description}</p>
              <div className={styles.toolbar}>
                <Toggle label="Email" checked={p.email} onChange={(v) => set(p.type, { email: v })} />
                {p.inApp ? <Toggle label="Push to phone" checked={p.push} onChange={(v) => set(p.type, { push: v })} /> : null}
              </div>
            </div>
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

const POPUP_HELP: Record<PopupStatus, string> = {
  on: "A pop-up appears on this computer for each new notification while TechnoCool Inventory is open in a tab you're not looking at. Click it to open the item.",
  off: "Turn on to get a pop-up on this computer for each new notification while TechnoCool Inventory is open in a tab you're not looking at.",
  ask: "Turn on to get a pop-up on this computer for each new notification while TechnoCool Inventory is open in a tab you're not looking at. Your browser will ask you to allow it.",
  blocked: "Notifications are blocked for this site in your browser. Click the icon left of the address bar → Site settings → Notifications → Allow, then reload the page.",
  insecure: "Pop-ups need the site to be opened over HTTPS. Ask your administrator to use the https:// address.",
  unsupported: "This browser doesn't support desktop pop-ups. Use a current Chrome, Edge or Firefox.",
};

/** Desktop pop-ups: a per-browser choice, so it's kept in this browser, not on the server. */
function BrowserPopups() {
  const [status, setStatus] = useState<PopupStatus>("unsupported");
  useEffect(() => {
    const sync = () => setStatus(popupStatus());
    sync();
    window.addEventListener(POPUPS_CHANGED, sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener(POPUPS_CHANGED, sync);
      window.removeEventListener("focus", sync);
    };
  }, []);
  const usable = status === "on" || status === "off" || status === "ask";
  return (
    <section className={styles.section}>
      <strong>Desktop pop-ups on this computer</strong>
      <p className={styles.muted} style={{ margin: "var(--space-2) 0 var(--space-4)" }}>
        {POPUP_HELP[status]}
      </p>
      <div className={styles.toolbar}>
        <Toggle label="Show pop-ups" checked={status === "on"} disabled={!usable} onChange={(v) => (v ? void turnOnPopups().then(setStatus) : turnOffPopups())} />
        {status === "on" ? (
          <Button kind="secondary" size="sm" onClick={() => showPopup({ id: "test", title: "TechnoCool Inventory pop-ups are on", body: "New notifications will appear like this." }, () => undefined)}>
            Send a test pop-up
          </Button>
        ) : null}
      </div>
    </section>
  );
}
