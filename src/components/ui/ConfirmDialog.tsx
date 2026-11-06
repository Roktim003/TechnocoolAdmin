"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Modal } from "./Modal";

export interface ConfirmOptions {
  /** The question, e.g. "Cancel this count?" */
  title: string;
  /** What will happen, shown under the title. */
  message?: ReactNode;
  /** Text of the confirm button, e.g. "Cancel count". Name the action, not "OK". */
  confirmText?: string;
  /** Text of the button that backs out. Default "Cancel"; use e.g. "Keep counting" when the action itself is a cancel. */
  cancelText?: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let show: ((p: Pending) => void) | null = null;

/**
 * In-app replacement for `window.confirm()`: `if (!(await confirmDialog({ … }))) return;`
 * Resolves true on confirm, false on cancel / Esc / backdrop. Needs <ConfirmHost /> (in AppShell).
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (!show) return Promise.resolve(window.confirm([options.title, typeof options.message === "string" ? options.message : ""].filter(Boolean).join("\n\n")));
  return new Promise((resolve) => show!({ ...options, resolve }));
}

/** Renders the dialog for confirmDialog(); mount once. */
export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    show = (p) =>
      setPending((cur) => {
        cur?.resolve(false); // a new question replaces an unanswered one
        return p;
      });
    return () => {
      show = null;
    };
  }, []);

  const finish = useCallback(
    (ok: boolean) => {
      pending?.resolve(ok);
      setPending(null);
    },
    [pending],
  );
  const cancel = useCallback(() => finish(false), [finish]);

  return (
    <Modal
      open={!!pending}
      size="sm"
      title={pending?.title ?? ""}
      primaryText={pending?.confirmText ?? "Confirm"}
      primaryKind={pending?.danger ? "danger" : "primary"}
      cancelText={pending?.cancelText}
      initialFocus="cancel"
      onClose={cancel}
      onSubmit={() => finish(true)}
    >
      {pending?.message ? <p style={{ margin: 0, color: "var(--text-2)", lineHeight: 1.5 }}>{pending.message}</p> : null}
    </Modal>
  );
}
