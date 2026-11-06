"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SkeletonLines } from "@/components/ui/Skeleton";
import { api } from "@/lib/api-client";
import { anyTabFocused, markSeen, popupStatus, POPUPS_CHANGED, seenAt, showPopup, trackFocus, turnOffPopups, turnOnPopups, type PopupStatus } from "@/lib/browser-popups";
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

/** Badge refresh: every 60 s while the tab is visible; every 30 s, also in the background, while pop-ups are on. */
const POLL_MS = 60_000;
const POPUP_POLL_MS = 30_000;
/** More new notifications than this at once â†’ one summary pop-up instead. */
const MAX_POPUPS = 3;
const TITLE_PREFIX = /^\(\d+\+?\) /;

/**
 * Header bell: unread badge, the latest 10, "Mark all as read". Also shows the unread count in
 * the tab title and, when the user turned them on, desktop pop-ups for new notifications while
 * no StockBook tab has focus.
 */
export function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [popups, setPopups] = useState<PopupStatus>("unsupported");
  const box = useRef<HTMLDivElement>(null);
  const lastCount = useRef<number | null>(null);

  // Pop-up setting: read after mount (browser only) and whenever it changes here or in another tab.
  useEffect(() => {
    const sync = () => setPopups(popupStatus());
    sync();
    window.addEventListener(POPUPS_CHANGED, sync);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync); // permission may have changed in the browser's site settings
    const untrack = trackFocus();
    return () => {
      window.removeEventListener(POPUPS_CHANGED, sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      untrack();
    };
  }, []);

  const markRead = useCallback(async (id: string) => {
    await api(`/notifications/${id}/read`, { method: "POST" }).catch(() => undefined);
    setCount((c) => Math.max(0, c - 1));
  }, []);

  /** Pop-ups for notifications newer than the last one handled (in any tab). */
  const popNew = useCallback(async () => {
    const since = seenAt();
    const latest = (await api<{ data: Item[] }>("/notifications", { query: { unread: "true", pageSize: 10 } })).data;
    const fresh = latest.filter((n) => !since || n.createdAt > since).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (!fresh.length) return;
    const newest = fresh[fresh.length - 1]!;
    markSeen(newest.createdAt);
    if (anyTabFocused()) return; // the user is looking at StockBook: the badge is enough
    if (fresh.length > MAX_POPUPS) {
      showPopup({ id: `summary-${newest.id}`, title: `${fresh.length} new notifications`, body: fresh.map((n) => n.title).slice(0, 4).join(" · ") }, () => window.location.assign("/notifications"));
      return;
    }
    for (const n of fresh)
      showPopup(n, () => {
        void markRead(n.id);
        window.location.assign(n.link ?? "/notifications");
      });
  }, [markRead]);

  /** First run with pop-ups on: everything that already exists counts as seen. */
  const baseline = useCallback(async () => {
    if (seenAt()) return;
    const latest = (await api<{ data: Item[] }>("/notifications", { query: { pageSize: 1 } })).data[0];
    markSeen(latest?.createdAt ?? new Date(0).toISOString());
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = (await api<{ data: { count: number } }>("/notifications/unread-count")).data.count;
      setCount(next);
      const prev = lastCount.current;
      lastCount.current = next;
      if (popupStatus() !== "on") return;
      if (prev === null) await baseline();
      else if (next > 0 && next !== prev) await popNew();
    } catch {
      /* offline or logged out: keep the last value */
    }
  }, [baseline, popNew]);

  useEffect(() => {
    void refresh();
    const on = popups === "on";
    const t = setInterval(
      () => {
        if (on || document.visibilityState === "visible") void refresh();
      },
      on ? POPUP_POLL_MS : POLL_MS,
    );
    return () => clearInterval(t);
  }, [refresh, popups]);

  // Turning pop-ups on: start from "everything so far is seen".
  useEffect(() => {
    if (popups === "on") void baseline().catch(() => undefined);
  }, [popups, baseline]);

  // "(3) Stock in / out — StockBook": keep the unread count in the tab title, also after navigation.
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(TITLE_PREFIX, "");
      const want = count ? `(${count > 99 ? "99+" : count}) ${base}` : base;
      if (document.title !== want) document.title = want;
    };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => obs.disconnect();
  }, [count]);

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
    if (!n.readAt) await markRead(n.id);
    setOpen(false);
    if (n.link) window.location.assign(n.link);
  }

  return (
    <div className={styles.wrap} ref={box}>
      <button type="button" className={styles.bell} aria-label={count ? `Notifications, ${count} unread` : "Notifications"} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        <Icon name="bell" size={16} />
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
          {popups === "ask" ? (
            <div className={styles.offer}>
              <Icon name="bell" size={16} />
              <div>
                <p className={styles.offerText}>Get a desktop pop-up when something needs you, even while you work in another app.</p>
                <div className={styles.offerActions}>
                  <button type="button" className={styles.offerOn} onClick={() => void turnOnPopups()}>
                    Turn on pop-ups
                  </button>
                  <button type="button" className={styles.link} onClick={turnOffPopups}>
                    Not now
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          <ul className={styles.list}>
            {items === null ? (
              <li className={styles.skeleton}>
                <SkeletonLines lines={6} label="Loading notifications" />
              </li>
            ) : null}
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
