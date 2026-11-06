"use client";

import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./FilePicker.module.css";

export const RECEIPT_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
const MB = 1024 * 1024;

export interface FilePickerProps {
  label: ReactNode;
  /** The chosen file (controlled); null = none. */
  file: File | null;
  onChange: (file: File | null) => void;
  /** MIME types, as for <input accept>. Default: PDF, JPG, PNG, WebP. */
  accept?: string;
  /** Default 10 MB (the server's attachment limit). */
  maxBytes?: number;
  /** Shown under the drop zone, e.g. "PDF, JPG, PNG or WebP · up to 10 MB". */
  hint?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

const formatSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / MB).toFixed(1)} MB`);

/**
 * Single-file picker in the design system: a dashed drop zone (click or drag a file onto it);
 * once chosen, a card with a preview (image thumbnail or PDF icon), the name and size, and
 * Change / Remove. Wrong type or too large is refused at once with a message under the field.
 */
export function FilePicker({ label, file, onChange, accept = RECEIPT_ACCEPT, maxBytes = 10 * MB, hint, error, disabled, className }: FilePickerProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const types = accept.split(",").map((t) => t.trim());
  const shownError = problem ?? error;

  // Thumbnail for images; revoked when the file changes.
  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function take(list: FileList | null | undefined) {
    const f = list?.[0];
    if (input.current) input.current.value = ""; // choosing the same file again still fires onChange
    if (!f) return;
    if (types.length && !types.includes(f.type)) return setProblem(`${f.name} isn't a ${describe(types)} file.`);
    if (f.size > maxBytes) return setProblem(`${f.name} is ${formatSize(f.size)}; the limit is ${formatSize(maxBytes)}.`);
    setProblem(null);
    onChange(f);
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (!disabled) take(e.dataTransfer.files);
  };

  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input ref={input} id={id} type="file" accept={accept} tabIndex={-1} className={styles.native} disabled={disabled} onChange={(e) => take(e.target.files)} aria-describedby={shownError ? `${id}-error` : `${id}-hint`} />

      {file ? (
        <div className={styles.chosen}>
          <span className={[styles.thumb, preview ? "" : styles.thumbPdf].filter(Boolean).join(" ")}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, nothing for next/image to optimise */}
            {preview ? <img src={preview} alt="" /> : <Icon name="fileText" size={20} />}
          </span>
          <span className={styles.info}>
            <span className={styles.name} title={file.name}>
              {file.name}
            </span>
            <span className={styles.meta}>
              <Icon name="checkCircle" size={12} className={styles.ok} /> Ready to upload · {formatSize(file.size)}
            </span>
          </span>
          <button type="button" className={styles.action} onClick={() => input.current?.click()} disabled={disabled}>
            Change
          </button>
          <button type="button" className={styles.remove} onClick={() => (setProblem(null), onChange(null))} disabled={disabled} aria-label={`Remove ${file.name}`}>
            <Icon name="x" size={15} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={[styles.zone, drag ? styles.drag : "", shownError ? styles.invalid : ""].filter(Boolean).join(" ")}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          disabled={disabled}
          aria-describedby={shownError ? `${id}-error` : `${id}-hint`}
        >
          <span className={styles.zoneIcon}>
            <Icon name="upload" size={16} />
          </span>
          <span className={styles.zoneText}>
            <span className={styles.zoneTitle}>
              <strong>Choose a file</strong> or drag it here
            </span>
            <span id={`${id}-hint`} className={styles.meta}>
              {hint ?? `${describe(types)} · up to ${formatSize(maxBytes)}`}
            </span>
          </span>
        </button>
      )}

      {shownError ? (
        <p id={`${id}-error`} className={styles.error} role="alert">
          {shownError}
        </p>
      ) : null}
    </div>
  );
}

/** "PDF, JPG, PNG or WebP" from MIME types. */
function describe(types: string[]): string {
  const names = types.map((t) => ({ "application/pdf": "PDF", "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WebP" })[t] ?? t.split("/").pop()!.toUpperCase());
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : (names[0] ?? "");
}
