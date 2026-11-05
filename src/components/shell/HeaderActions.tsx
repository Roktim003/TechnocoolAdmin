"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { NotificationBell } from "./NotificationBell";
import styles from "./AppShell.module.css";

/** Top-bar actions (right side). */
export function HeaderActions() {
  return (
    <div className={styles.actions}>
      <NotificationBell />
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

/** Sidebar footer: avatar, name and role, and a log-out icon button. */
export function UserMenu({ name, roleName }: { name: string; roleName: string }) {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    // The refresh cookie is only sent to /api/v1/auth, so log out through the API.
    await fetch("/api/v1/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    window.location.assign("/login");
  }

  return (
    <div className={styles.user}>
      <span className={styles.avatar} aria-hidden="true">
        {initials(name)}
      </span>
      <span className={styles.userText}>
        <span className={styles.userName}>{name}</span>
        <span className={styles.userRole}>{roleName}</span>
      </span>
      <button type="button" className={styles.logout} onClick={logout} disabled={busy} aria-label={busy ? "Logging out" : "Log out"} title="Log out">
        <Icon name="logout" size={15} />
      </button>
    </div>
  );
}
