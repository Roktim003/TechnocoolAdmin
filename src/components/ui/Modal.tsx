"use client";

import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import { Button } from "./Button";
import styles from "./Modal.module.css";

export interface ModalProps {
  open: boolean;
  title: ReactNode;
  label?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  primaryText?: string;
  primaryKind?: "primary" | "danger";
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  submitting?: boolean;
  size?: "sm" | "md";
}

/** Carbon-style modal (square, header/body/footer, full-width footer buttons). Esc and the overlay close it. */
export function Modal({ open, title, label, onClose, children, primaryText = "Save", primaryKind = "primary", onSubmit, submitting, size = "md" }: ModalProps) {
  const titleId = useId();
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${styles.modal} ${styles[size]}`}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.(e);
        }}
        noValidate
      >
        <header className={styles.header}>
          <div>
            {label ? <p className={styles.label}>{label}</p> : null}
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        <footer className={styles.footer}>
          <Button kind="secondary" className={styles.footerButton} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" kind={primaryKind === "danger" ? "danger" : "primary"} className={`${styles.footerButton} ${primaryKind === "danger" ? styles.dangerFill : ""}`} disabled={submitting}>
            {submitting ? "Saving…" : primaryText}
          </Button>
        </footer>
      </form>
    </div>
  );
}
