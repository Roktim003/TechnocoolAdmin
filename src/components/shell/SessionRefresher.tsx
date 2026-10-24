"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { refreshSession } from "@/lib/api-client";
import styles from "./AppShell.module.css";

/**
 * Rendered when the access cookie is missing or expired. The refresh cookie is scoped to
 * /api/v1/auth, so only the browser can use it: rotate it, then re-render the page.
 */
export function SessionRefresher() {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    refreshSession().then((ok) => {
      if (cancelled) return;
      if (ok) router.refresh();
      else router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);
  return (
    <div className={styles.refreshing} role="status">
      Checking your session…
    </div>
  );
}
