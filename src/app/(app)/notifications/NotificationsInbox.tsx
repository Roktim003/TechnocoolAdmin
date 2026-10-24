"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Field";
import { Notification } from "@/components/ui/Notification";
import { Pagination } from "@/components/ui/Pagination";
import { api, errorMessage, type Page } from "@/lib/api-client";
import { formatDateTime } from "@/shared/time/format";
import styles from "../stock/_components/stock.module.css";

interface Item {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationsInbox() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<Page<Item> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setResult(await api<Page<Item>>("/notifications", { query: { page, pageSize, unread: unreadOnly ? "true" : undefined } }));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [page, pageSize, unreadOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function read(n: Item) {
    if (!n.readAt) await api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => undefined);
  }

  return (
    <div className={styles.stack} style={{ maxWidth: 820 }}>
      {error ? <Notification kind="error">{error}</Notification> : null}
      <div className={styles.toolbar}>
        <Checkbox label="Unread only" checked={unreadOnly} onChange={(e) => (setUnreadOnly(e.target.checked), setPage(1))} />
        <div className={styles.toolbarActions}>
          <Button kind="secondary" size="sm" onClick={async () => (await api("/notifications/read-all", { method: "POST" }), load())}>
            Mark all as read
          </Button>
          <Link href="/settings/notifications" className={styles.link}>
            Email settings
          </Link>
        </div>
      </div>
      <section className={styles.section} style={{ padding: 0 }}>
        {result?.data.length === 0 ? <p className={styles.muted} style={{ padding: "var(--space-6) var(--space-5)" }}>No notifications.</p> : null}
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {result?.data.map((n) => (
            <li key={n.id} style={{ borderBottom: "1px solid var(--color-border)", padding: "var(--space-4) var(--space-5)", boxShadow: n.readAt ? undefined : "inset 3px 0 0 var(--color-primary)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap" }}>
                {n.link ? (
                  <Link href={n.link} onClick={() => read(n)} style={{ fontWeight: n.readAt ? undefined : 600 }}>
                    {n.title}
                  </Link>
                ) : (
                  <strong>{n.title}</strong>
                )}
                <span className={styles.muted}>{formatDateTime(n.createdAt)}</span>
              </div>
              <div className={styles.muted} style={{ marginTop: "var(--space-2)" }}>
                {n.body}
              </div>
            </li>
          ))}
        </ul>
      </section>
      {result ? <Pagination page={page} pageSize={pageSize} total={result.meta.total} onChange={(p, s) => (setPage(p), setPageSize(s))} /> : null}
    </div>
  );
}
