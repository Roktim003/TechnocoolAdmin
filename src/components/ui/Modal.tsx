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
  /** Text of the back-out button (default "Cancel"). */
  cancelText?: string;
  /** "cancel": focus the back-out button first (confirmations); default: the first field. */
  initialFocus?: "first" | "cancel";
}

/** First thing to type in or press inside the body (skips hidden native inputs behind custom controls). */
const FIRST_FIELD = 'input:not([type="hidden"]):not([tabindex="-1"]):not(:disabled), textarea:not(:disabled), button:not(:disabled), [tabindex="0"]';

/** Carbon-style modal (square, header/body/footer, full-width footer buttons). Esc and the overlay close it. */
export function Modal({ open, title, label, onClose, children, primaryText = "Save", primaryKind = "primary", onSubmit, submitting, size = "md", cancelText = "Cancel", initialFocus = "first" }: ModalProps) {
  const titleId = useId();
  const ref = useRef<HTMLFormElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Latest onClose without making it an effect dependency: callers often pass an inline arrow,
  // and re-running the effect on every keystroke would move focus away from the field being typed in.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const focusRef = useRef(initialFocus);
  focusRef.current = initialFocus;

  // Runs only when the modal opens / closes.
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    if (focusRef.current === "cancel") cancelRef.current?.focus();
    else (bodyRef.current?.querySelector<HTMLElement>(FIRST_FIELD) ?? cancelRef.current)?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus();
    };
  }, [open]);

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
        <div ref={bodyRef} className={styles.body}>
          {children}
        </div>
        <footer className={styles.footer}>
          <Button ref={cancelRef} kind="secondary" className={styles.footerButton} onClick={onClose}>
            {cancelText}
          </Button>
          <Button type="submit" kind={primaryKind === "danger" ? "danger" : "primary"} className={`${styles.footerButton} ${primaryKind === "danger" ? styles.dangerFill : ""}`} disabled={submitting}>
            {submitting ? "Saving…" : primaryText}
          </Button>
        </footer>
      </form>
    </div>
  );
}
