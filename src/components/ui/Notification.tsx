import type { ReactNode } from "react";
import styles from "./Notification.module.css";

export type NotificationKind = "success" | "error" | "info" | "warning";

export interface NotificationProps {
  kind: NotificationKind;
  title?: ReactNode;
  children?: ReactNode;
  onClose?: () => void;
  className?: string;
}

const ICONS: Record<NotificationKind, string> = { success: "✓", error: "!", info: "i", warning: "!" };

/** Inline notification: tinted background with a 3px coloured left border. */
export function Notification({ kind, title, children, onClose, className }: NotificationProps) {
  return (
    <div className={[styles.notification, styles[kind], className].filter(Boolean).join(" ")} role={kind === "error" ? "alert" : "status"}>
      <span className={styles.icon} aria-hidden="true">
        {ICONS[kind]}
      </span>
      <div className={styles.text}>
        {title ? <p className={styles.title}>{title}</p> : null}
        {children ? <div className={styles.body}>{children}</div> : null}
      </div>
      {onClose ? (
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close notification">
          ×
        </button>
      ) : null}
    </div>
  );
}
