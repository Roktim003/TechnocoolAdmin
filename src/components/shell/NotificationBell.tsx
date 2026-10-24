"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { formatDateTime } from "@/shared/time/format";
import styles from "./NotificationBell.module.css";

interface Item {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

const POLL_MS = 60_000;

/** Header bell: unread badge (polled every 60 s), the latest 10, "Mark all as read". */
export function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setCount((await api<{ data: { count: number } }>("/notifications/unread-count")).data.count);
    } catch {
      /* offline or logged out: keep the last value */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    api<{ data: Item[] }>("/notifications", { query: { pageSize: 10 } })
      .then((r) => setItems(r.data))
      .catch(() => setItems([]));
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function readAll() {
    await api("/notifications/read-all", { method: "POST" }).catch(() => undefined);
    setItems((xs) => xs?.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })) ?? null);
    setCount(0);
  }

  async function openItem(n: Item) {
    if (!n.readAt) {
      await api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => undefined);
      setCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.link) window.location.assign(n.link);
  }

  return (
    <div className={styles.wrap} ref={box}>
      <button type="button" className={styles.bell} aria-label={count ? `Notifications, ${count} unread` : "Notifications"} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true" fill="currentColor">
          <path d="M28.7 20.3 26 17.6V13a10 10 0 0 0-9-9.9V1h-2v2.1A10 10 0 0 0 6 13v4.6l-2.7 2.7A1 1 0 0 0 3 21v3a1 1 0 0 0 1 1h7v.8a5 5 0 0 0 10 0V25h7a1 1 0 0 0 1-1v-3a1 1 0 0 0-.3-.7ZM19 25.8a3 3 0 0 1-6 0V25h6ZM27 23H5v-1.6l2.7-2.7A1 1 0 0 0 8 18v-5a8 8 0 0 1 16 0v5a1 1 0 0 0 .3.7l2.7 2.7Z" />
        </svg>
        {count ? <span className={styles.badge}>{count > 99 ? "99+" : count}</span> : null}
      </button>
      {open ? (
        <div className={styles.panel} role="dialog" aria-label="Notifications">
          <div className={styles.head}>
            <strong>Notifications</strong>
            <button type="button" className={styles.link} onClick={readAll} disabled={!count}>
              Mark all as read
            </button>
          </div>
          <ul className={styles.list}>
            {items === null ? <li className={styles.empty}>Loading…</li> : null}
            {items?.length === 0 ? <li className={styles.empty}>You&apos;re all caught up.</li> : null}
            {items?.map((n) => (
              <li key={n.id}>
                <button type="button" className={`${styles.item} ${n.readAt ? "" : styles.unread}`} onClick={() => openItem(n)}>
                  <span className={styles.title}>{n.title}</span>
                  <span className={styles.body}>{n.body}</span>
                  <span className={styles.time}>{formatDateTime(n.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className={styles.foot}>
            <Link href="/notifications" onClick={() => setOpen(false)}>
              All notifications
            </Link>
            <Link href="/settings/notifications" onClick={() => setOpen(false)}>
              Settings
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
