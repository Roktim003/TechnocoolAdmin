/**
 * Desktop pop-ups (the browser's Notification API) for new in-app notifications while a
 * StockBook tab is open. Per browser: the user allows it once; the on/off choice is kept in
 * localStorage. No service worker: when every StockBook tab is closed, nothing pops up.
 */

const SETTING = "sb.popups"; // "on" | "off" (unset: on once the browser permission is granted)
const SEEN_AT = "sb.popups.seenAt"; // createdAt of the newest notification already handled
const FOCUSED_TAB = "sb.popups.focusedTab"; // id of the StockBook tab that has focus, if any
export const POPUPS_CHANGED = "sb-popups-changed";

export type PopupStatus = "unsupported" | "insecure" | "blocked" | "off" | "on" | "ask";

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* private mode / storage full: pop-ups just repeat or stay off */
    }
  },
};

/**
 * - unsupported: the browser has no Notification API
 * - insecure: the site isn't on HTTPS (or localhost), so the browser won't allow it
 * - blocked: the user (or policy) blocked notifications for this site
 * - ask: not decided yet (the bell offers to turn it on)
 * - off / on
 */
export function popupStatus(): PopupStatus {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (!window.isSecureContext) return "insecure";
  const p = Notification.permission;
  if (p === "denied") return "blocked";
  const s = store.get(SETTING);
  if (s === "off") return "off";
  if (p === "granted") return "on";
  return "ask";
}

function changed() {
  window.dispatchEvent(new Event(POPUPS_CHANGED));
}

/** Must run from a click (browsers only show the permission prompt for a user gesture). */
export async function turnOnPopups(): Promise<PopupStatus> {
  if (!("Notification" in window) || !window.isSecureContext) return popupStatus();
  const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (p === "granted") store.set(SETTING, "on");
  changed();
  return popupStatus();
}

export function turnOffPopups() {
  store.set(SETTING, "off");
  changed();
}

/** Notifications at or before this time were already shown (or existed before pop-ups started). */
export function seenAt(): string | null {
  return store.get(SEEN_AT);
}

export function markSeen(createdAt: string) {
  const prev = store.get(SEEN_AT);
  if (!prev || createdAt > prev) store.set(SEEN_AT, createdAt);
}

/** Tracks whether any StockBook tab has focus, so a background tab doesn't pop up over the one you're using. */
export function trackFocus(): () => void {
  const id = Math.random().toString(36).slice(2);
  const onFocus = () => store.set(FOCUSED_TAB, id);
  const onBlur = () => store.get(FOCUSED_TAB) === id && store.set(FOCUSED_TAB, null);
  if (document.hasFocus()) onFocus();
  window.addEventListener("focus", onFocus);
  window.addEventListener("blur", onBlur);
  window.addEventListener("pagehide", onBlur);
  return () => {
    onBlur();
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("pagehide", onBlur);
  };
}

export function anyTabFocused(): boolean {
  return document.hasFocus() || !!store.get(FOCUSED_TAB);
}

/** Shows one pop-up. The tag (notification id) stops two tabs from showing the same one twice. */
export function showPopup(n: { id: string; title: string; body: string }, onClick: () => void) {
  try {
    const p = new Notification(n.title, { body: n.body, tag: n.id, icon: "/notification-icon.png", badge: "/notification-icon.png" });
    p.onclick = () => {
      window.focus();
      p.close();
      onClick();
    };
  } catch {
    /* some mobile browsers only allow notifications from a service worker */
  }
}
