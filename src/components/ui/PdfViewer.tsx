"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { errorMessage, refreshSession } from "@/lib/api-client";
import type { ReadyDocument } from "@/lib/documents";
import { downloadFile } from "@/lib/download";
import { Icon } from "./Icon";
import { SpreadsheetView } from "./SpreadsheetView";
import styles from "./PdfViewer.module.css";

export interface PdfRequest {
  /** e.g. "Sales Invoice". */
  title: string;
  /** e.g. the entry number, shown after the title. */
  subtitle?: string;
  /** "pdf" (default) shows the browser's PDF viewer; "xlsx" shows a spreadsheet preview. */
  format?: "pdf" | "xlsx";
  /** Creates the file and resolves when it's ready (the viewer shows a loader meanwhile). */
  load: (signal: AbortSignal) => Promise<ReadyDocument>;
}

type State = { phase: "loading" } | { phase: "ready"; src: string; blob: Blob; fileName: string } | { phase: "error"; message: string };

const MIME = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as const;

/**
 * In-app viewer for generated files (PDF documents and Excel exports): opens at once with
 * "Preparing…" while the worker renders the file, then shows it with Print, Download and
 * Open in new tab. Esc or the backdrop closes it.
 *
 * The file is fetched once into a blob URL, so print / download / new tab reuse the same bytes.
 */
export function PdfViewer({ request, onClose }: { request: PdfRequest | null; onClose: () => void }) {
  const titleId = useId();
  const [state, setState] = useState<State>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const printSheet = useRef<(() => void) | null>(null);
  const format = request?.format ?? "pdf";

  useEffect(() => {
    if (!request) return;
    const ctl = new AbortController();
    let blobUrl: string | null = null;
    setState({ phase: "loading" });
    (async () => {
      try {
        const doc = await request.load(ctl.signal);
        const get = () => fetch(doc.url, { credentials: "same-origin", signal: ctl.signal });
        let res = await get();
        if (res.status === 401 && (await refreshSession())) res = await get();
        if (!res.ok) throw new Error(`The file couldn't be loaded (HTTP ${res.status}).`);
        const blob = new Blob([await res.blob()], { type: MIME[request.format ?? "pdf"] });
        blobUrl = URL.createObjectURL(blob);
        setState({ phase: "ready", src: blobUrl, blob, fileName: doc.fileName });
      } catch (err) {
        if (ctl.signal.aborted) return;
        setState({ phase: "error", message: errorMessage(err) });
      }
    })();
    return () => {
      ctl.abort();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [request, attempt]);

  // Latest onClose without re-running the open/close effect (which moves focus) on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const open = !!request;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    // Capture phase + stop: Esc closes only the viewer, not a drawer or modal underneath.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = "";
      prev?.focus();
    };
  }, [open]);

  if (!request) return null;
  const ready = state.phase === "ready" ? state : null;
  const kindLabel = format === "xlsx" ? "Excel file" : "PDF";

  const print = () => {
    if (format === "xlsx") return printSheet.current?.();
    const w = frame.current?.contentWindow;
    try {
      w?.focus();
      w?.print();
    } catch {
      if (ready) window.open(ready.src, "_blank", "noopener");
    }
  };

  return createPortal(
    <div
      className={styles.overlay}
      onClick={(e) => {
        // Clicks don't bubble out to a drawer / modal that rendered the viewer.
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.viewer}>
        <header className={styles.bar}>
          <div className={styles.doc}>
            <span className={`${styles.docIcon} ${format === "xlsx" ? styles.docIconSheet : ""}`}>
              <Icon name={format === "xlsx" ? "table" : "fileText"} size={18} />
            </span>
            <div className={styles.docText}>
              <h2 id={titleId} className={styles.title}>
                {request.title}
                {request.subtitle ? <span className={styles.subtitle}> · {request.subtitle}</span> : null}
              </h2>
              <p className={styles.meta}>{ready ? `${ready.fileName} · ${formatSize(ready.blob.size)}` : state.phase === "error" ? "Not available" : `Preparing ${kindLabel}…`}</p>
            </div>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.action} onClick={print} disabled={!ready}>
              <Icon name="printer" size={15} />
              <span>Print</span>
            </button>
            <button type="button" className={styles.action} onClick={() => ready && downloadFile(ready.src, ready.fileName)} disabled={!ready}>
              <Icon name="download" size={15} />
              <span>Download</span>
            </button>
            {format === "pdf" ? (
              <button type="button" className={styles.action} onClick={() => ready && window.open(ready.src, "_blank", "noopener")} disabled={!ready} title="Open in a new tab">
                <Icon name="arrowUpRight" size={15} />
                <span className={styles.optional}>New tab</span>
              </button>
            ) : null}
            <span className={styles.divider} aria-hidden />
            <button ref={closeBtn} type="button" className={styles.close} onClick={onClose} aria-label={`Close ${kindLabel} viewer`}>
              <Icon name="x" size={18} />
            </button>
          </div>
        </header>

        <div className={styles.stage}>
          {ready ? (
            format === "xlsx" ? (
              <SpreadsheetView blob={ready.blob} printRef={printSheet} />
            ) : (
              <iframe ref={frame} className={styles.frame} src={`${ready.src}#view=FitH&toolbar=1`} title={`${request.title} PDF`} />
            )
          ) : state.phase === "error" ? (
            <div className={styles.status} role="alert">
              <span className={`${styles.statusIcon} ${styles.statusError}`}>
                <Icon name="alert" size={22} />
              </span>
              <p className={styles.statusTitle}>Couldn&apos;t create the {kindLabel}</p>
              <p className={styles.statusText}>{state.message}</p>
              <button type="button" className={styles.retry} onClick={() => setAttempt((a) => a + 1)}>
                Try again
              </button>
            </div>
          ) : (
            <div className={styles.status} role="status">
              <div className={`${styles.paper} ${format === "xlsx" ? styles.paperSheet : ""}`} aria-hidden>
                <span className={styles.lineWide} />
                <span className={styles.lineMid} />
                <span className={styles.block} />
                <span className={styles.line} />
                <span className={styles.line} />
                <span className={styles.lineMid} />
              </div>
              <p className={styles.statusTitle}>Preparing {request.title.toLowerCase()}…</p>
              <p className={styles.statusText}>{format === "xlsx" ? "Large reports can take a little longer." : "This usually takes a few seconds."}</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
