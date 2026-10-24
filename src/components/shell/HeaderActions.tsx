"use client";

import { useState } from "react";
import { NotificationBell } from "./NotificationBell";
import styles from "./AppShell.module.css";

export function HeaderActions({ name, roleName }: { name: string; roleName: string }) {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    // The refresh cookie is only sent to /api/v1/auth, so log out through the API.
    await fetch("/api/v1/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    window.location.assign("/login");
  }

  return (
    <div className={styles.actions}>
      <NotificationBell />
      <div className={styles.user}>
        <span className={styles.userName}>{name}</span>
        <span className={styles.userRole}>{roleName}</span>
      </div>
      <button type="button" className={styles.logout} onClick={logout} disabled={busy}>
        {busy ? "Logging out…" : "Log out"}
      </button>
    </div>
  );
}
