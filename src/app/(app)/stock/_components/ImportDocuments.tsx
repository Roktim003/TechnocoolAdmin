"use client";

import Link from "next/link";
import { useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import fieldStyles from "@/components/ui/Field.module.css";
import { FormProblems } from "@/components/ui/FormProblems";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { Tag } from "@/components/ui/Tag";
import { api, ApiError, download, errorMessage, uploadWithProgress } from "@/lib/api-client";
import { collect, rules, type Problems } from "@/lib/validation";
import {
  CI_CURRENCIES,
  CUSTOMS_STATIONS,
  DOC_LABEL,
  DOC_TYPES,
  FILE_ACCEPT,
  fileProblem,
  fileSize,
  INCOTERMS,
  joinLabels,
  localChecklist,
  MAX_FILES_PER_DOC,
  missingRequired,
  missingText,
  type AttachmentDocType,
  type DocChecklistItem,
  type ImportAttachment,
  type ImportAttachments,
  type ImportDocType,
  type ImportWarning,
  type ShipmentForm,
} from "./import-docs";
import stockStyles from "./stock.module.css";
import styles from "./import-docs.module.css";
import { confirmDialog } from "@/components/ui/ConfirmDialog";

type FieldKey = keyof ShipmentForm;
interface FieldDef {
  key: FieldKey;
  label: string;
  kind?: "date" | "integer" | "qty" | "money" | "currency" | "incoterm" | "containers" | "station";
  /** Max characters (server ImportShipmentSchema). */
  max?: number;
  full?: boolean;
  /** Hidden without seeCost. */
  cost?: boolean;
  mono?: boolean;
}

const FIELDS: Record<ImportDocType, FieldDef[]> = {
  BL: [
    { key: "blNo", label: "BL no.", mono: true, max: 100 },
    { key: "blDate", label: "BL date", kind: "date" },
    { key: "shippingLine", label: "Shipping line", max: 150 },
    { key: "vesselVoyage", label: "Vessel / voyage", max: 150 },
    { key: "portOfLoading", label: "Port of loading", max: 150 },
    { key: "portOfDischarge", label: "Port of discharge", max: 150 },
    { key: "containerNumbers", label: "Container numbers", kind: "containers", full: true },
  ],
  CO: [
    { key: "coNo", label: "CO no.", mono: true, max: 100 },
    { key: "coDate", label: "CO date", kind: "date" },
    { key: "countryOfOrigin", label: "Country of origin", max: 100 },
    { key: "coIssuingAuthority", label: "Issuing authority", max: 150 },
  ],
  PL: [
    { key: "plNo", label: "PL no.", mono: true, max: 100 },
    { key: "plDate", label: "PL date", kind: "date" },
    { key: "packageCount", label: "Packages", kind: "integer" },
    { key: "grossWeightKg", label: "Gross weight (kg)", kind: "qty" },
    { key: "netWeightKg", label: "Net weight (kg)", kind: "qty" },
  ],
  CI: [
    { key: "ciNo", label: "CI no.", mono: true, max: 100 },
    { key: "ciDate", label: "CI date", kind: "date" },
    { key: "ciCurrency", label: "Currency", kind: "currency" },
    { key: "ciValue", label: "Invoice value", kind: "money", cost: true },
    { key: "incoterm", label: "Incoterm", kind: "incoterm" },
  ],
  BOE: [
    { key: "boeNo", label: "B/E no.", mono: true, max: 100 },
    { key: "boeDate", label: "B/E date", kind: "date" },
    { key: "customsStation", label: "Customs station", kind: "station", full: true, max: 150 },
  ],
};

/** Field names for the problem summary, e.g. "Packing List: Packages". */
export const SHIPMENT_LABELS: Record<string, string> = Object.fromEntries(DOC_TYPES.flatMap((t) => FIELDS[t].map((f) => [f.key, `${DOC_LABEL[t]}: ${f.label}`])));

/**
 * Browser-side checks of the shipment details (same rules as the server's ImportShipmentSchema):
 * lengths, whole package count, weights with ≤ 3 decimals, invoice value with ≤ 2 decimals, container numbers.
 */
export function checkShipment(s: ShipmentForm, seeCost: boolean): Problems {
  return collect(
    ...DOC_TYPES.flatMap((t) =>
      FIELDS[t].map((f): [string, string | undefined] => {
        if (f.key === "containerNumbers") {
          const long = s.containerNumbers.find((c) => c.length > 20);
          return [f.key, long ? `${long} is too long: a container number has at most 20 characters.` : s.containerNumbers.length > 100 ? "Enter at most 100 container numbers." : undefined];
        }
        const v = s[f.key];
        if (f.cost && !seeCost) return [f.key, undefined];
        if (f.kind === "integer") return [f.key, rules.integer(v, { min: 0, max: 1_000_000 })];
        if (f.kind === "qty") return [f.key, rules.qty(v)];
        if (f.kind === "money") return [f.key, rules.money(v)];
        return [f.key, f.max ? rules.maxLength(v, f.max) : undefined];
      }),
    ),
  );
}

export interface ImportDocumentsProps {
  shipment: ShipmentForm;
  /** Omit to show the details read-only. */
  onChange?: (next: ShipmentForm) => void;
  files: ImportAttachments;
  onFilesChange: (docType: AttachmentDocType, update: (prev: ImportAttachment[]) => ImportAttachment[]) => void;
  required: readonly ImportDocType[];
  seeCost: boolean;
  /** The saved entry (uploads need one). */
  entryId: string | null;
  /** New entry: saves a draft and returns its id (null when that failed). */
  ensureEntryId?: () => Promise<string | null>;
  canUpload: boolean;
  removeRule: (a: ImportAttachment) => { allowed: boolean; reasonRequired: boolean };
  /** Import warnings from the server (the missing-documents list is computed here). */
  warnings: Pick<ImportWarning, "code" | "message" | "link">[];
  /** Field errors keyed by shipment field (e.g. "blDate"). */
  errors?: Record<string, string>;
  /** Browser-side problems (checkShipment) to list at the top of the section after a save attempt. */
  problems?: Record<string, string>;
  /** Buttons at the top right (detail page: Edit / Save). */
  actions?: ReactNode;
  layout?: "list" | "gallery";
  onError: (message: string) => void;
}

/** "Import documents" section of a GRN (Imported): checklist, five document boxes, warnings. */
export function ImportDocuments(p: ImportDocumentsProps) {
  const headingId = useId();
  const checklist = localChecklist(p.shipment, p.files, p.required);
  const missing = missingRequired(checklist);
  const [removing, setRemoving] = useState<ImportAttachment | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [reasonAttempt, setReasonAttempt] = useState(false);
  const [busy, setBusy] = useState(false);

  // Removing a file from a posted entry: reason of 3–500 characters (server RemoveAttachmentSchema).
  const reasonProblem = rules.required(reason, "a reason") ?? (reason.trim().length < 3 ? "Use at least 3 characters." : rules.maxLength(reason, 500));
  const shownReasonError = (reasonAttempt ? reasonProblem : undefined) ?? reasonError;

  async function remove(a: ImportAttachment, why?: string) {
    if (!p.entryId) return;
    setBusy(true);
    try {
      await api(`/stock-entries/${p.entryId}/attachments/${a.id}`, { method: "DELETE", body: why ? { reason: why } : undefined });
      p.onFilesChange(a.docType ?? "OTHER", (list) => list.filter((x) => x.id !== a.id));
      setRemoving(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.fieldErrors().reason) setReasonError(err.fieldErrors().reason);
      else {
        setRemoving(null);
        p.onError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  function askRemove(a: ImportAttachment) {
    const rule = p.removeRule(a);
    if (!rule.allowed) return;
    if (rule.reasonRequired) {
      setReason("");
      setReasonError(undefined);
      setReasonAttempt(false);
      setRemoving(a);
    } else void confirmDialog({ title: `Remove ${a.fileName}?`, message: "The document is removed from this import. This can't be undone.", confirmText: "Remove document", danger: true }).then((ok) => {
        if (ok) void remove(a);
      });
  }

  const canRemove = (a: ImportAttachment) => p.removeRule(a).allowed;

  return (
    <section className={stockStyles.section} aria-labelledby={headingId} id="import-documents">
      <div className={stockStyles.sectionHead}>
        <div>
          <h2 id={headingId} className={stockStyles.sectionTitle}>
            Import documents
          </h2>
          <p className={stockStyles.sectionHelp}>
            Enter each document&apos;s details and upload its file (PDF, JPG or PNG).{" "}
            {p.required.length ? `Required before posting: ${joinLabels(p.required)}.` : "No documents are required before posting."}
          </p>
        </div>
        <div className={styles.headRight}>
          <DocChecklist items={checklist} />
          {p.actions}
        </div>
      </div>

      {p.problems && Object.keys(p.problems).length ? (
        <div style={{ marginBottom: "var(--space-5)" }}>
          <FormProblems problems={p.problems} labels={SHIPMENT_LABELS} />
        </div>
      ) : null}

      <div className={styles.grid}>
        {DOC_TYPES.map((t) => (
          <DocBox key={t} docType={t} item={checklist.find((c) => c.docType === t)!} props={p} canRemove={canRemove} onRemove={askRemove} />
        ))}
      </div>

      {p.files.OTHER.length ? (
        <div className={styles.other}>
          <h3 className={styles.otherTitle}>Other import documents</h3>
          <FileList files={p.files.OTHER} layout={p.layout} canRemove={canRemove} onRemove={askRemove} onError={p.onError} />
        </div>
      ) : null}

      <ImportWarningsNote missing={missing} warnings={p.warnings} />

      <Modal
        open={!!removing}
        title="Remove file"
        label={removing?.fileName}
        primaryText="Remove"
        primaryKind="danger"
        submitting={busy}
        onClose={() => setRemoving(null)}
        onSubmit={() => {
          setReasonAttempt(true);
          if (reasonProblem) return;
          if (removing) void remove(removing, reason.trim());
        }}
      >
        {reasonAttempt && reasonProblem ? <FormProblems problems={{ reason: reasonProblem }} labels={{ reason: "Reason" }} title="1 thing to fix before removing" /> : null}
        <p style={{ marginBottom: "var(--space-5)" }}>The entry is posted, so removing a document file is recorded in the audit log with your reason.</p>
        <TextAreaField label="Reason" rows={3} value={reason} onChange={(ev) => (setReason(ev.target.value), setReasonError(undefined))} error={shownReasonError} helper="3–500 characters." required />
      </Modal>
    </section>
  );
}

/** One pill per document: "BL · Done" (green) / "BL · Missing" (gray, red outline when required). */
export function DocChecklist({ items, compact }: { items: DocChecklistItem[]; compact?: boolean }) {
  return (
    <ul className={styles.checklist} aria-label="Import documents checklist">
      {items.map((c) => {
        const state = c.complete ? "done" : c.required ? `missing (${missingText(c).split(": ")[1]}), required before posting` : "missing";
        return (
          <li key={c.docType} className={!c.complete && c.required ? styles.requiredMissing : undefined} title={`${c.label}: ${state}`}>
            <Tag kind={c.complete ? "green" : "gray"}>
              {compact ? c.docType : `${c.docType} · ${c.complete ? "Done" : "Missing"}`}
              <span className="visually-hidden">{compact ? ` ${state}` : c.required && !c.complete ? ", required" : ""}</span>
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}

/** What is still needed before posting, plus the other import warnings (duplicates link to the other GRN). */
export function ImportWarningsNote({ missing, warnings }: { missing: DocChecklistItem[]; warnings: Pick<ImportWarning, "code" | "message" | "link">[] }) {
  const other = warnings.filter((w) => w.code !== "IMPORT_DOCS_MISSING");
  if (!missing.length && !other.length) return null;
  return (
    <Notification kind="warning" title={missing.length ? "Needed before posting" : "Check the import documents"} className={styles.note}>
      <ul className={styles.noteList}>
        {missing.map((c) => (
          <li key={c.docType}>{missingText(c)}</li>
        ))}
        {other.map((w, i) => (
          <li key={`${w.code}-${i}`}>
            {w.message}
            {w.link ? (
              <>
                {" "}
                <Link href={w.link.href} target="_blank" rel="noopener noreferrer" className={stockStyles.link}>
                  Open {w.link.number ?? "the other GRN"}
                </Link>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </Notification>
  );
}

function DocBox({
  docType,
  item,
  props: p,
  canRemove,
  onRemove,
}: {
  docType: ImportDocType;
  item: DocChecklistItem;
  props: ImportDocumentsProps;
  canRemove: (a: ImportAttachment) => boolean;
  onRemove: (a: ImportAttachment) => void;
}) {
  const fields = FIELDS[docType].filter((f) => !f.cost || p.seeCost);
  return (
    <fieldset className={`${styles.box} ${item.required && !item.complete ? styles.boxRequired : ""}`}>
      <legend className={styles.legend}>
        <span className={styles.legendName}>{DOC_LABEL[docType]}</span>
        <span className={styles.code}>{docType}</span>
        {item.required ? <Tag kind="red">Required</Tag> : null}
        {item.complete ? <Tag kind="green">Done</Tag> : null}
      </legend>
      <div className={styles.boxBody}>
        {p.onChange ? (
          <div className={styles.fields}>
            {fields.map((f) => (
              <DocField key={f.key} def={f} shipment={p.shipment} onChange={p.onChange!} error={fieldError(p.errors, f.key)} />
            ))}
          </div>
        ) : (
          <dl className={styles.specs}>
            {fields.map((f) => (
              <div key={f.key} className={f.full ? styles.full : undefined}>
                <dt>{f.label}</dt>
                <dd className={f.mono ? stockStyles.mono : undefined}>{displayValue(f, p.shipment)}</dd>
              </div>
            ))}
          </dl>
        )}
        <div>
          <h4 className={styles.filesTitle}>Files</h4>
          <FileList files={p.files[docType]} layout={p.layout} canRemove={canRemove} onRemove={onRemove} onError={p.onError} />
        </div>
        {p.canUpload ? (
          <UploadArea
            docType={docType}
            existing={p.files[docType].length}
            entryId={p.entryId}
            ensureEntryId={p.ensureEntryId}
            onUploaded={(added) => p.onFilesChange(docType, (list) => [...list, ...added])}
          />
        ) : null}
      </div>
    </fieldset>
  );
}

const fieldError = (errors: Record<string, string> | undefined, key: string) => (errors ? (errors[key] ?? Object.entries(errors).find(([k]) => k.startsWith(`${key}.`))?.[1]) : undefined);

function displayValue(f: FieldDef, s: ShipmentForm): ReactNode {
  if (f.key === "containerNumbers") {
    return s.containerNumbers.length ? (
      <span className={stockStyles.chips}>
        {s.containerNumbers.map((c) => (
          <span key={c} className={stockStyles.chip} style={{ cursor: "default" }}>
            {c}
          </span>
        ))}
      </span>
    ) : (
      "—"
    );
  }
  const v = s[f.key];
  return v || "—";
}

function DocField({ def: f, shipment, onChange, error }: { def: FieldDef; shipment: ShipmentForm; onChange: (next: ShipmentForm) => void; error?: string }) {
  const listId = useId();
  const cls = f.full ? styles.full : undefined;
  if (f.key === "containerNumbers") {
    return <ContainerInput label={f.label} values={shipment.containerNumbers} onChange={(containerNumbers) => onChange({ ...shipment, containerNumbers })} error={error} className={cls} />;
  }
  const key = f.key;
  const value = shipment[key];
  const set = (v: string) => onChange({ ...shipment, [key]: v });
  if (f.kind === "currency" || f.kind === "incoterm") {
    const options = f.kind === "currency" ? CI_CURRENCIES : INCOTERMS;
    return (
      <SelectField label={f.label} value={value} onChange={(e) => set(e.target.value)} error={error} fieldClassName={cls}>
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o === "OTHER" ? "Other" : o}
          </option>
        ))}
      </SelectField>
    );
  }
  return (
    <>
      <TextField
        label={f.label}
        type={f.kind === "date" ? "date" : "text"}
        kind={f.kind === "integer" || f.kind === "qty" || f.kind === "money" ? f.kind : undefined}
        mono={f.mono}
        value={value}
        onChange={(e) => set(e.target.value)}
        error={error}
        fieldClassName={cls}
        list={f.kind === "station" ? listId : undefined}
        placeholder={f.kind === "station" ? "Chattogram Custom House" : undefined}
        autoComplete="off"
      />
      {f.kind === "station" ? (
        <datalist id={listId}>
          {CUSTOMS_STATIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}

/** Tag-style input: type a container number, Enter or comma adds it, × removes it. */
function ContainerInput({ label, values, onChange, error, className }: { label: string; values: string[]; onChange: (v: string[]) => void; error?: string; className?: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const commit = (raw: string) => {
    const parts = raw
      .split(/[,;\s]+/)
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean);
    if (parts.length) onChange([...new Set([...values, ...parts])]);
    setDraft("");
  };
  return (
    <div className={[fieldStyles.field, className].filter(Boolean).join(" ")}>
      <label htmlFor={id} className={fieldStyles.label}>
        {label}
      </label>
      {/* Clicking the box focuses the text input (the chips' buttons stay keyboard reachable). */}
      <div className={`${styles.tagInput} ${error ? styles.tagInputInvalid : ""}`} onClick={() => input.current?.focus()}>
        {values.map((v) => (
          <span key={v} className={styles.tagChip}>
            {v}
            <button type="button" className={styles.tagRemove} aria-label={`Remove container ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
              <Icon name="x" size={12} />
            </button>
          </span>
        ))}
        <input
          ref={input}
          id={id}
          className={styles.tagField}
          value={draft}
          placeholder={values.length ? "" : "e.g. MSKU1234565"}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help`}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => (/[,;]/.test(e.target.value) ? commit(e.target.value) : setDraft(e.target.value))}
          onBlur={() => draft.trim() && commit(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
          }}
        />
      </div>
      {error ? (
        <p className={fieldStyles.error} role="alert">
          {error}
        </p>
      ) : (
        <p id={`${id}-help`} className={fieldStyles.helper}>
          Type a number, then Enter or comma.
        </p>
      )}
    </div>
  );
}

interface Pending {
  key: string;
  name: string;
  size: number;
  progress: number;
  error: string | null;
}

let pendingSeq = 0;

function uploadError(err: unknown): string {
  if (!(err instanceof ApiError)) return errorMessage(err);
  const code = err.details[0]?.code ?? err.code;
  if (code === "INVALID_FILE_TYPE") return "Only PDF, JPG and PNG files are allowed.";
  if (code === "FILE_TOO_LARGE") return "Larger than 10 MB.";
  return err.message;
}

/** Dashed drop zone + "Take photo" (phones); one request per file so each gets its own progress bar. */
function UploadArea({ docType, existing, entryId, ensureEntryId, onUploaded }: { docType: ImportDocType; existing: number; entryId: string | null; ensureEntryId?: () => Promise<string | null>; onUploaded: (added: ImportAttachment[]) => void }) {
  const hintId = useId();
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [items, setItems] = useState<Pending[]>([]);
  const active = items.filter((i) => !i.error).length;

  const patch = (key: string, change: Partial<Pending>) => setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...change } : i)));

  async function add(list: FileList | null) {
    const chosen = Array.from(list ?? []);
    if (input.current) input.current.value = "";
    if (camera.current) camera.current.value = "";
    if (!chosen.length) return;
    let room = MAX_FILES_PER_DOC - existing - active;
    const queue: { file: File; item: Pending }[] = [];
    const rejected: Pending[] = [];
    for (const file of chosen) {
      const problem = fileProblem(file) ?? (room <= 0 ? `A document can have at most ${MAX_FILES_PER_DOC} files.` : null);
      const item: Pending = { key: `u${++pendingSeq}`, name: file.name, size: file.size, progress: 0, error: problem };
      if (problem) rejected.push(item);
      else {
        room--;
        queue.push({ file, item });
      }
    }
    // Earlier failures are dismissed by a new attempt.
    setItems((cur) => [...cur.filter((i) => !i.error), ...queue.map((q) => q.item), ...rejected]);
    if (!queue.length) return;
    const id = entryId ?? (ensureEntryId ? await ensureEntryId() : null);
    if (!id) {
      for (const q of queue) patch(q.item.key, { error: "Save the entry as a draft first, then upload." });
      return;
    }
    for (const { file, item } of queue) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("docType", docType);
      try {
        const r = await uploadWithProgress<{ data: ImportAttachment[] }>(`/stock-entries/${id}/attachments`, fd, (progress) => patch(item.key, { progress }));
        onUploaded(r.data);
        setItems((cur) => cur.filter((i) => i.key !== item.key));
      } catch (err) {
        patch(item.key, { error: uploadError(err) });
      }
    }
  }

  return (
    <div className={styles.upload}>
      <button
        type="button"
        className={`${styles.drop} ${drag ? styles.dragging : ""}`}
        aria-describedby={hintId}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void add(e.dataTransfer.files);
        }}
      >
        <Icon name="upload" size={18} className={styles.dropIcon} />
        <span className={styles.dropTitle}>Upload {docType} file(s)</span>
        <span id={hintId} className={styles.dropHint}>
          Click or drop files · PDF, JPG or PNG · up to 10 MB, {MAX_FILES_PER_DOC} files
        </span>
      </button>
      <Button kind="secondary" size="sm" className={styles.photo} onClick={() => camera.current?.click()}>
        <Icon name="camera" size={14} /> Take photo
      </Button>
      <input ref={input} type="file" accept={FILE_ACCEPT} multiple hidden onChange={(e) => void add(e.target.files)} />
      <input ref={camera} type="file" accept="image/jpeg,image/png" capture="environment" hidden onChange={(e) => void add(e.target.files)} />
      {!entryId && ensureEntryId ? <p className={styles.dropHint}>Uploading saves this entry as a draft first.</p> : null}
      {items.length ? (
        <ul className={styles.progressList} aria-live="polite">
          {items.map((i) => (
            <li key={i.key} className={styles.progressItem}>
              <div className={styles.progressHead}>
                <span className={styles.fileName} title={i.name}>
                  {i.name}
                </span>
                <span className={styles.fileMeta}>{i.error ? fileSize(i.size) : `${Math.round(i.progress * 100)}%`}</span>
                {i.error ? (
                  <button type="button" className={styles.iconBtn} aria-label={`Dismiss ${i.name}`} onClick={() => setItems((cur) => cur.filter((x) => x.key !== i.key))}>
                    <Icon name="x" size={14} />
                  </button>
                ) : null}
              </div>
              {i.error ? (
                <p className={styles.progressError} role="alert">
                  {i.error}
                </p>
              ) : (
                <div className={styles.bar} role="progressbar" aria-label={`Uploading ${i.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(i.progress * 100)}>
                  <span style={{ width: `${Math.max(2, i.progress * 100)}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const apiPath = (url: string) => url.replace(/^\/api\/v1/, "");

/** Uploaded files: thumbnail or file icon, name, size, View (new tab), Download, Remove. */
export function FileList({
  files,
  layout = "list",
  canRemove,
  onRemove,
  onError,
}: {
  files: ImportAttachment[];
  layout?: "list" | "gallery";
  canRemove: (a: ImportAttachment) => boolean;
  onRemove: (a: ImportAttachment) => void;
  onError: (message: string) => void;
}) {
  if (!files.length) return <p className={styles.empty}>No file uploaded yet.</p>;
  const save = (a: ImportAttachment) => download(apiPath(a.downloadUrl), {}, a.fileName).catch((err) => onError(errorMessage(err)));
  return (
    <ul className={layout === "gallery" ? styles.gallery : styles.files}>
      {files.map((a) => (
        <li key={a.id} className={layout === "gallery" ? styles.card : styles.file}>
          <a href={`${a.downloadUrl}?inline=1`} target="_blank" rel="noopener noreferrer" className={layout === "gallery" ? styles.cardPreview : styles.preview} tabIndex={-1} aria-hidden="true">
            {a.thumbnailUrl ? (
              // Authenticated, same-origin thumbnail: next/image can't add the cookie-based auth.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.thumbnailUrl} alt="" loading="lazy" />
            ) : (
              <span className={styles.fileIcon}>
                <Icon name="fileText" size={layout === "gallery" ? 28 : 18} />
                {layout === "gallery" ? <span>{a.mimeType === "application/pdf" ? "PDF" : "File"}</span> : null}
              </span>
            )}
          </a>
          <div className={styles.fileText}>
            <span className={styles.fileName} title={a.fileName}>
              {a.fileName}
            </span>
            <span className={styles.fileMeta}>
              {fileSize(a.size)} · {a.uploadedBy.name}
            </span>
          </div>
          <div className={styles.fileActions}>
            <a href={`${a.downloadUrl}?inline=1`} target="_blank" rel="noopener noreferrer" className={styles.iconBtn} aria-label={`View ${a.fileName}`} title="View">
              <Icon name="eye" size={15} />
            </a>
            <button type="button" className={styles.iconBtn} aria-label={`Download ${a.fileName}`} title="Download" onClick={() => void save(a)}>
              <Icon name="download" size={15} />
            </button>
            {canRemove(a) ? (
              <button type="button" className={`${styles.iconBtn} ${styles.danger}`} aria-label={`Remove ${a.fileName}`} title="Remove" onClick={() => onRemove(a)}>
                <Icon name="x" size={15} />
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
