"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Checkbox, TextAreaField, TextField } from "@/components/ui/Field";
import { FormProblems } from "@/components/ui/FormProblems";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { Tag } from "@/components/ui/Tag";
import { api, ApiError, errorMessage, upload } from "@/lib/api-client";
import { collect, rules, sanitize } from "@/lib/validation";
import { PdfViewer, type PdfRequest } from "@/components/ui/PdfViewer";
import { waitForDocument } from "@/lib/documents";
import { allowedKinds, DOCUMENT_TITLES } from "@/modules/inventory/infrastructure/document-template";
import { formatDateTime, formatMoney } from "@/shared/time/format";
import { CHARGE_TYPES, formatAmount, formatQty, newKey, STATUS_LABEL, STATUS_TAG, type EntryDto, type StockCaps } from "./types";
import { checkShipment, ImportDocuments } from "./ImportDocuments";
import {
  DEFAULT_REQUIRED,
  emptyAttachments,
  localChecklist,
  missingRequired,
  missingTitle,
  removeRule,
  shipmentBody,
  toShipmentForm,
  type EntryDetailDto,
  type ImportAttachments,
  type ImportWarning,
} from "./import-docs";
import styles from "./stock.module.css";
import { confirmDialog } from "@/components/ui/ConfirmDialog";

interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  label: string | null;
  /** Set on GRN (Imported) document files, which are shown in the Import documents section. */
  docType?: string | null;
  uploadedBy: { name: string } | null;
  createdAt: string;
  url: string;
}

const SAVED: Record<string, string> = {
  draft: "Draft saved.",
  submit: "Submitted for verification. An approver in this warehouse will verify it.",
  post: "Posted. Stock and cost are updated.",
};

const REFERENCE_LABELS: Record<string, string> = {
  poNumberText: "PO number",
  supplierInvoiceNo: "Supplier invoice",
  lcNo: "LC number",
  billOfEntryNo: "Bill of entry",
  challanNo: "Challan no.",
  siteAddress: "Site address",
  receivedBy: "Received / returned by",
  vehicle: "Vehicle",
  reason: "Reason",
  description: "Description",
  customerPhone: "Customer phone",
  customerAddress: "Delivery address",
};

/** A quantity string ("5", "2.5", "5.000") as thousandths, so it compares without floats. */
const milli = (s: string) => {
  const [int = "0", frac = ""] = s.trim().split(".");
  return BigInt(int || "0") * 1000n + BigInt((frac + "000").slice(0, 3));
};

const bytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function EntryDetail({ caps, initial, saved }: { caps: StockCaps; initial: EntryDetailDto; saved: string | null }) {
  const router = useRouter();
  const [e, setE] = useState<EntryDetailDto>(initial);
  const [notice, setNotice] = useState<{ kind: "success" | "error" | "warning"; title?: string; message: ReactNode } | null>(saved && SAVED[saved] ? { kind: "success", message: SAVED[saved] } : null);
  // GRN (Imported) documents: kept apart from `e` because action responses don't carry them.
  const [shipment, setShipment] = useState(() => toShipmentForm(initial.importShipment, initial.references.billOfEntryNo));
  const [importFiles, setImportFiles] = useState<ImportAttachments>(() => initial.importAttachments ?? emptyAttachments());
  const [importWarnings, setImportWarnings] = useState<ImportWarning[]>(initial.importWarnings ?? []);
  const [docDraft, setDocDraft] = useState<ReturnType<typeof toShipmentForm> | null>(null);
  const [docErrors, setDocErrors] = useState<Record<string, string>>({});
  const [docSaving, setDocSaving] = useState(false);
  const [docAttempt, setDocAttempt] = useState(false);
  // A server error on a document field disappears once the details are edited.
  useEffect(() => setDocErrors({}), [docDraft]);
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<"reject" | "reverse" | "cancel" | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [reasonAttempt, setReasonAttempt] = useState(false);
  const [receiveAttempt, setReceiveAttempt] = useState(false);
  // Each time a reason modal opens or closes, start without errors.
  useEffect(() => setReasonAttempt(false), [modal]);
  const [belowCost, setBelowCost] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pdf, setPdf] = useState<PdfRequest | null>(null);
  const closePdf = useCallback(() => setPdf(null), []);
  const [received, setReceived] = useState<Record<string, string>>(() => Object.fromEntries(initial.lines.map((l) => [l.id, l.qty])));
  const [arrived, setArrived] = useState<Record<string, string[]>>(() => Object.fromEntries(initial.lines.map((l) => [l.id, l.serials.map((s) => s.serial)])));
  const keyRef = useRef(newKey());
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ data: Attachment[] }>(`/stock-entries/${e.id}/attachments`)
      .then((r) => setAttachments(r.data.filter((a) => !a.docType)))
      .catch(() => undefined);
  }, [e.id]);

  useEffect(() => {
    if (saved) {
      const url = new URL(window.location.href);
      url.searchParams.delete("saved");
      window.history.replaceState(null, "", url);
    }
  }, [saved]);

  async function act(action: "submit" | "post" | "approve" | "reject" | "cancel" | "reverse" | "receive", body?: unknown, success?: string) {
    setBusy(action);
    try {
      const res = await api<{ data: EntryDto | { original: EntryDto; reversal: EntryDto } | { entry: EntryDto; shortageEntry: EntryDto | null } }>(`/stock-entries/${e.id}/${action}`, {
        method: "POST",
        body: body ?? {},
        headers: { "Idempotency-Key": keyRef.current },
      });
      const d = res.data;
      if ("original" in d) {
        setE(d.original);
        setNotice({ kind: "success", message: `Reversed by ${d.reversal.number}. Stock and cost are restored.` });
      } else if ("entry" in d) {
        setE(d.entry);
        setNotice(
          d.shortageEntry
            ? { kind: "warning", title: "Received with a shortfall", message: `The missing quantity was booked to damaged stock, with write-off ${d.shortageEntry.number} pending verification.` }
            : { kind: "success", message: "Transfer received in full." },
        );
      } else {
        setE(d);
        setNotice({ kind: "success", message: success ?? "Done." });
      }
      setModal(null);
      setReason("");
      setBelowCost(false);
      router.refresh();
    } catch (err) {
      const missingDocs = err instanceof ApiError ? err.details.filter((d) => d.code === "IMPORT_DOCS_MISSING") : [];
      if (err instanceof ApiError && err.details[0]?.code === "BELOW_COST" && caps.canFull) setBelowCost(true);
      if (err instanceof ApiError && err.status === 400 && err.fieldErrors().reason) setReasonError(err.fieldErrors().reason);
      else if (missingDocs.length) {
        setModal(null);
        setNotice({
          kind: "error",
          title: "Import documents are missing",
          message: (
            <>
              Add these before posting:
              <ul style={{ margin: "var(--space-2) 0 0", paddingLeft: "var(--space-5)" }}>
                {missingDocs.map((d, i) => (
                  <li key={i}>{d.message}</li>
                ))}
              </ul>
            </>
          ),
        });
        document.getElementById("import-documents")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        setModal(null);
        setNotice({ kind: "error", title: "That didn't work", message: errorMessage(err) });
      }
    } finally {
      keyRef.current = newKey();
      setBusy(null);
    }
  }

  /** Opens the PDF viewer; it shows a loader while the worker renders the document. */
  function print(kind: string) {
    setPdf({
      title: DOCUMENT_TITLES[kind as keyof typeof DOCUMENT_TITLES] ?? "Document",
      subtitle: e.displayNumber,
      load: async (signal) => {
        const job = (await api<{ data: { jobId: string } }>(`/stock-entries/${e.id}/documents`, { method: "POST", body: { kind } })).data;
        return waitForDocument(job.jobId, `${e.displayNumber}.pdf`, signal);
      },
    });
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("file", f);
    setBusy("upload");
    try {
      await upload(`/stock-entries/${e.id}/attachments`, fd);
      setAttachments((await api<{ data: Attachment[] }>(`/stock-entries/${e.id}/attachments`)).data.filter((a) => !a.docType));
    } catch (err) {
      setNotice({ kind: "error", title: "Upload failed", message: errorMessage(err) });
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removeFile(a: Attachment) {
    if (!(await confirmDialog({ title: `Remove ${a.fileName}?`, message: "The file is removed from this entry. This can't be undone.", confirmText: "Remove file", danger: true }))) return;
    try {
      await api(`/stock-entries/${e.id}/attachments/${a.id}`, { method: "DELETE" });
      setAttachments((list) => list.filter((x) => x.id !== a.id));
    } catch (err) {
      setNotice({ kind: "error", message: errorMessage(err) });
    }
  }

  /** Saves the document details (PATCH import-shipment); never changes stock or cost. */
  async function saveDocs() {
    if (!docDraft) return;
    setDocAttempt(true);
    if (Object.keys(checkShipment(docDraft, caps.seeCost)).length) {
      document.getElementById("import-documents")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setDocSaving(true);
    setDocErrors({});
    try {
      const r = (await api<{ data: EntryDetailDto }>(`/stock-entries/${e.id}/import-shipment`, { method: "PATCH", body: shipmentBody(docDraft, caps.seeCost) })).data;
      setE(r);
      setShipment(toShipmentForm(r.importShipment));
      if (r.importAttachments) setImportFiles(r.importAttachments);
      setImportWarnings(r.importWarnings ?? []);
      setDocDraft(null);
      setDocAttempt(false);
      setNotice({ kind: "success", message: "Import document details saved." });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors()).length) setDocErrors(err.fieldErrors());
      else setNotice({ kind: "error", title: "Couldn't save the import documents", message: errorMessage(err) });
    } finally {
      setDocSaving(false);
    }
  }

  const x = e.actions;
  const isImport = e.type === "GRN_IMPORT";
  const requiredDocs = e.importDocsRequiredToPost ?? initial.importDocsRequiredToPost ?? DEFAULT_REQUIRED;
  // Approve / Post are refused (422) while required documents are incomplete.
  const docsMissing = isImport ? missingRequired(localChecklist(shipment, importFiles, requiredDocs)) : [];
  const docsBlockTitle = missingTitle(docsMissing);
  const showPrice = e.lines.some((l) => "unitPrice" in l && l.unitPrice !== undefined);
  const showCost = caps.seeCost && e.type !== "TRANSFER";
  // GRN (Imported): the bill of entry no. lives in the B/E document.
  const refs = Object.entries(e.references).filter(([k, v]) => v && !(isImport && k === "billOfEntryNo"));
  const isTransferReceive = x.receive;
  const priceHeader = e.type === "SALE" ? "Unit price" : e.type === "GRN_IMPORT" ? `Unit price (${e.currency})` : "Unit cost";

  // Import document details being edited: browser checks after the first save attempt, live afterwards.
  const docProblems = docDraft && docAttempt ? checkShipment(docDraft, caps.seeCost) : {};

  // Reject / reverse reason: 3–500 characters (server ReasonSchema).
  const reasonProblem = rules.required(reason, "a reason") ?? (reason.trim().length < 3 ? "Use at least 3 characters." : rules.maxLength(reason, 500));
  const shownReasonError = (reasonAttempt ? reasonProblem : undefined) ?? reasonError;
  const closeReason = () => {
    setModal(null);
    setReasonError(undefined);
    setReasonAttempt(false);
  };

  // Receive a transfer: what arrived per line, same rules as the server (0 … dispatched; whole units and
  // exactly that many ticked serials for serial-tracked products).
  const receiveProblems = isTransferReceive
    ? collect(
        ...e.lines.flatMap((l): [string, string | undefined][] => {
          const v = (received[l.id] ?? "").trim();
          const qtyProblem =
            rules.required(v, "the quantity that arrived (0 if none)") ??
            rules.qty(v, { whole: l.product.trackSerial }) ??
            (milli(v) > milli(l.qty) ? `Can't be more than the ${formatQty(l.qty)} dispatched.` : undefined);
          const short = !qtyProblem && milli(v) < milli(l.qty);
          const ticked = arrived[l.id]?.length ?? 0;
          const want = qtyProblem ? 0 : Number(milli(v) / 1000n);
          const serialProblem = short && l.product.trackSerial && l.serials.length > 0 && ticked !== want ? `Tick the ${want} serial number${want === 1 ? "" : "s"} that arrived (${ticked} ticked).` : undefined;
          return [
            [`qty:${l.id}`, qtyProblem],
            [`serials:${l.id}`, serialProblem],
          ];
        }),
      )
    : {};
  const receiveLabels = Object.fromEntries(e.lines.flatMap((l) => [[`qty:${l.id}`, `${l.product.code} received`] as const, [`serials:${l.id}`, `${l.product.code} serials`] as const]));
  const receiveErr = (k: string) => (receiveAttempt ? receiveProblems[k] : undefined);

  function confirmReceipt() {
    setReceiveAttempt(true);
    if (Object.keys(receiveProblems).length) {
      document.getElementById("receive")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    void act("receive", {
      lines: e.lines.map((l) => ({
        lineId: l.id,
        receivedQty: (received[l.id] ?? "").trim() || "0",
        ...(l.serials.length && received[l.id] !== l.qty ? { receivedSerials: arrived[l.id] ?? [] } : {}),
      })),
    });
  }

  return (
    <>
      <div className={styles.breadcrumb}>
        <Link href="/stock?tab=entries">Stock in / out</Link> / {e.displayNumber}
      </div>
      <div className={styles.detailHeader}>
        <div>
          <h1 className={styles.detailTitle}>
            <span className={styles.mono} style={{ fontSize: "inherit" }}>
              {e.displayNumber}
            </span>
            <Tag kind={STATUS_TAG[e.status]}>{STATUS_LABEL[e.status]}</Tag>
          </h1>
          <p className={styles.detailSub}>
            {e.typeLabel} · {e.warehouse.name}
            {e.toWarehouse ? ` → ${e.toWarehouse.name}` : ""} · {e.entryDate} · by {e.createdBy.name}
            {isImport && shipment.blNo ? (
              <>
                {" "}
                · BL <span className={styles.mono}>{shipment.blNo}</span>
              </>
            ) : null}
            {isImport && shipment.boeNo ? (
              <>
                {" "}
                · B/E <span className={styles.mono}>{shipment.boeNo}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className={styles.detailActions}>
          {x.edit ? (
            <Link href={`/stock/${e.id}/edit`}>
              <Button kind="secondary">Edit</Button>
            </Link>
          ) : null}
          {x.submit ? (
            <Button kind="secondary" onClick={() => act("submit", undefined, "Submitted for verification.")} disabled={!!busy}>
              Submit for verification
            </Button>
          ) : null}
          {/* Wrappers carry the tooltip naming missing import documents (disabled buttons get no hover). */}
          {x.post ? (
            <span title={docsBlockTitle}>
              <Button onClick={() => act("post", belowCost ? { confirmBelowCost: true } : undefined, "Posted.")} disabled={!!busy || docsMissing.length > 0}>
                {e.type === "TRANSFER" ? "Dispatch" : "Post"}
              </Button>
            </span>
          ) : null}
          {x.approve ? (
            <span title={docsBlockTitle}>
              <Button onClick={() => act("approve", belowCost ? { confirmBelowCost: true } : undefined, e.type === "TRANSFER" ? "Approved and dispatched." : "Approved and posted.")} disabled={!!busy || docsMissing.length > 0}>
                {busy === "approve" ? "Approving…" : belowCost ? "Approve below cost" : "Approve"}
              </Button>
            </span>
          ) : null}
          {x.reject ? (
            <Button kind="danger" onClick={() => setModal("reject")} disabled={!!busy}>
              Reject
            </Button>
          ) : null}
          {x.cancel ? (
            <Button kind="danger" onClick={() => setModal("cancel")} disabled={!!busy}>
              Cancel entry
            </Button>
          ) : null}
          {x.reverse ? (
            <Button kind="danger" onClick={() => setModal("reverse")} disabled={!!busy}>
              Reverse
            </Button>
          ) : null}
          {e.status !== "DRAFT"
            ? allowedKinds(e.type).map((k) => (
                <Button key={k} kind="secondary" onClick={() => print(k)} disabled={!!pdf}>
                  {`PDF: ${DOCUMENT_TITLES[k]}`}
                </Button>
              ))
            : null}
          <PdfViewer request={pdf} onClose={closePdf} />
        </div>
      </div>

      <div className={styles.stack}>
        {notice ? (
          <Notification kind={notice.kind} title={notice.title} onClose={() => setNotice(null)}>
            {notice.message}
          </Notification>
        ) : null}
        {belowCost ? <Notification kind="warning" title="Below average cost">This sale is priced below average cost. As Admin you can still approve it; the override is recorded in the audit log.</Notification> : null}
        {x.waitingForOtherApprover ? <Notification kind="info">Waiting for verification. Another approver for {e.warehouse.name} must approve it; you can&apos;t approve your own entry.</Notification> : null}
        {e.status === "REJECTED" && e.rejectionReason ? (
          <Notification kind="error" title={`Rejected by ${e.verifiedBy?.name ?? "approver"}`}>
            {e.rejectionReason}
            {x.edit ? " — edit it and submit again." : ""}
          </Notification>
        ) : null}
        {e.status === "REVERSED" ? (
          <Notification kind="info" title="Reversed">
            {e.reversalReason}
            {e.reversedBy ? (
              <>
                {" "}
                · <Link href={`/stock/${e.reversedBy.id}`}>{e.reversedBy.number}</Link>
              </>
            ) : null}
          </Notification>
        ) : null}

        <div className={styles.detailLayout}>
          <div className={styles.stack}>
            <section className={styles.section} aria-labelledby="d-details">
              <h2 id="d-details" className={styles.sectionTitle} style={{ marginBottom: "var(--space-5)" }}>
                Details
              </h2>
              <dl className={styles.specs}>
                {e.supplier ? <Spec label="Supplier">{e.supplier.name}</Spec> : null}
                {e.purchaseOrder ? (
                  <Spec label="Purchase order">
                    <Link href={`/purchases/${e.purchaseOrder.id}`}>{e.purchaseOrder.number}</Link>
                  </Spec>
                ) : null}
                {e.customer ? <Spec label="Customer">{e.customer.name}</Spec> : null}
                {e.project ? <Spec label="Project">{`${e.project.code} — ${e.project.name}`}</Spec> : null}
                {e.originalEntry ? (
                  <Spec label="Original entry">
                    <Link href={`/stock/${e.originalEntry.id}`}>{e.originalEntry.number}</Link>
                  </Spec>
                ) : null}
                {e.reversalOf ? (
                  <Spec label="Reverses">
                    <Link href={`/stock/${e.reversalOf.id}`}>{e.reversalOf.number}</Link>
                  </Spec>
                ) : null}
                {e.relatedEntry ? (
                  <Spec label="Related">
                    <Link href={`/stock/${e.relatedEntry.id}`}>{e.relatedEntry.number}</Link>
                  </Spec>
                ) : null}
                {e.type === "GRN_IMPORT" ? <Spec label="Exchange rate">{`1 ${e.currency} = ৳ ${e.exchangeRate}`}</Spec> : null}
                {refs.map(([k, v]) => (
                  <Spec key={k} label={REFERENCE_LABELS[k] ?? k}>
                    {v}
                  </Spec>
                ))}
                {e.notes ? <Spec label="Notes">{e.notes}</Spec> : null}
              </dl>
            </section>

            <section className={styles.section} aria-labelledby="d-lines">
              <h2 id="d-lines" className={styles.sectionTitle} style={{ marginBottom: "var(--space-5)" }}>
                Products ({e.itemCount})
              </h2>
              <div className={styles.linesWrap}>
                <table className={styles.lines}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Product</th>
                      <th className={styles.right}>Qty</th>
                      {e.lines.some((l) => l.condition === "DAMAGED") ? <th>Condition</th> : null}
                      {isImport ? <th>Origin</th> : null}
                      {showPrice ? <th className={styles.right}>{priceHeader}</th> : null}
                      {showPrice ? <th className={styles.right}>Amount</th> : null}
                      {showCost ? <th className={styles.right}>Unit cost (৳)</th> : null}
                      {showCost ? <th className={styles.right}>Cost (৳)</th> : null}
                      {e.receivedAt ? <th className={styles.right}>Received</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {e.lines.map((l) => (
                      <tr key={l.id}>
                        <td>{l.lineNo}</td>
                        <td>
                          <div>{l.product.name}</div>
                          <div className={styles.lineMeta}>
                            <Link href={`/stock/products/${l.product.id}`} className={styles.mono}>
                              {l.product.code}
                            </Link>
                          </div>
                          {l.serials.length ? (
                            <div className={styles.chips}>
                              {l.serials.map((s) => (
                                <span key={s.serial} className={styles.chip} style={{ cursor: "default", opacity: s.received === false ? 0.5 : 1 }} title={s.received === false ? "Did not arrive" : undefined}>
                                  {s.serial}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </td>
                        <td className={`${styles.right} ${styles.num}`}>
                          {l.adjustDirection ? <span className={l.adjustDirection === "GAIN" ? styles.positive : styles.negative}>{l.adjustDirection === "GAIN" ? "+" : "−"}</span> : null}
                          {formatQty(l.qty)} {l.product.unitCode}
                          {l.adjustDirection ? <div className={styles.lineMeta}>{l.adjustDirection === "GAIN" ? "found" : "missing"}</div> : null}
                        </td>
                        {e.lines.some((y) => y.condition === "DAMAGED") ? <td>{l.condition === "DAMAGED" ? <Tag kind="red">Damaged</Tag> : "Good"}</td> : null}
                        {isImport ? <td>{l.countryOfOrigin ?? "—"}</td> : null}
                        {showPrice ? <td className={`${styles.right} ${styles.num}`}>{formatAmount(l.unitPrice, e.type === "GRN_IMPORT" ? e.currency : "BDT")}</td> : null}
                        {showPrice ? <td className={`${styles.right} ${styles.num}`}>{formatMoney(l.amount)}</td> : null}
                        {showCost ? <td className={`${styles.right} ${styles.num}`}>{formatMoney(l.landedUnitCost ?? l.unitCostBdt)}</td> : null}
                        {showCost ? <td className={`${styles.right} ${styles.num}`}>{formatMoney(l.costAmount)}</td> : null}
                        {e.receivedAt ? <td className={`${styles.right} ${styles.num}`}>{formatQty(l.receivedQty)}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {e.charges.length && caps.seeCost ? (
                <>
                  <h3 className={styles.sectionTitle} style={{ margin: "var(--space-6) 0 var(--space-3)" }}>
                    Landed cost charges
                  </h3>
                  <table className={styles.lines}>
                    <tbody>
                      {e.charges.map((c) => (
                        <tr key={c.id}>
                          <td>{c.label ?? c.type.replace(/_/g, " ").toLowerCase().replace(/^\w/, (s) => s.toUpperCase())}</td>
                          <td className={styles.muted}>{c.mode === "PERCENT_OF_GOODS" ? `${c.value}% of goods` : "Fixed amount"}</td>
                          <td>{c.includeInCost ? <Tag kind="blue">In cost</Tag> : <Tag kind="gray">Not in cost</Tag>}</td>
                          <td className={`${styles.right} ${styles.num}`}>{formatMoney(c.amountBdt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}

              <dl className={styles.totals} style={{ marginTop: "var(--space-5)", marginLeft: "auto", maxWidth: 380 }}>
                {e.subtotal !== undefined ? (
                  <>
                    <dt>Subtotal</dt>
                    <dd>{formatMoney(e.subtotal)}</dd>
                  </>
                ) : null}
                {e.type === "SALE" ? (
                  <>
                    <dt>Discount</dt>
                    <dd>− {formatMoney(e.discountAmount)}</dd>
                    <dt>VAT {e.vatPercent}%</dt>
                    <dd>{formatMoney(e.vatAmount)}</dd>
                  </>
                ) : null}
                {e.grandTotal !== undefined ? (
                  <>
                    <dt className={styles.grand}>Total</dt>
                    <dd className={styles.grand}>{formatMoney(e.grandTotal)}</dd>
                  </>
                ) : null}
                {showCost && e.costTotal !== undefined ? (
                  <>
                    <dt>Stock value</dt>
                    <dd>{formatMoney(e.costTotal)}</dd>
                  </>
                ) : null}
                {e.profit !== undefined ? (
                  <>
                    <dt>Profit</dt>
                    <dd className={e.profit.startsWith("-") ? styles.negative : styles.positive}>{formatMoney(e.profit)}</dd>
                  </>
                ) : null}
                <dt>Total quantity</dt>
                <dd>{formatQty(e.totalQty)}</dd>
              </dl>
            </section>

            {isImport ? (
              <ImportDocuments
                shipment={docDraft ?? shipment}
                onChange={docDraft ? setDocDraft : undefined}
                files={importFiles}
                onFilesChange={(docType, update) => setImportFiles((f) => ({ ...f, [docType]: update(f[docType]) }))}
                required={requiredDocs}
                seeCost={caps.seeCost}
                entryId={e.id}
                canUpload={x.editImportDocs}
                removeRule={(a) => removeRule(caps, { status: e.status, warehouseId: e.warehouse.id }, a)}
                warnings={importWarnings}
                errors={{ ...docErrors, ...docProblems }}
                problems={docProblems}
                layout="gallery"
                onError={(message) => setNotice({ kind: "error", message })}
                actions={
                  x.editImportDocs ? (
                    docDraft ? (
                      <>
                        <Button kind="ghost" size="sm" onClick={() => (setDocDraft(null), setDocErrors({}), setDocAttempt(false))} disabled={docSaving}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={saveDocs} disabled={docSaving}>
                          {docSaving ? "Saving…" : "Save details"}
                        </Button>
                      </>
                    ) : (
                      <Button kind="secondary" size="sm" onClick={() => setDocDraft(shipment)}>
                        Edit details
                      </Button>
                    )
                  ) : null
                }
              />
            ) : null}

            {x.editLandedCost ? (
              <LandedCostEditor
                entry={e}
                onSaved={(saved) => {
                  setE(saved);
                  setNotice({ kind: "success", message: "Landed cost saved. Approve the GRN to post it with these costs." });
                }}
                onError={(message) => setNotice({ kind: "error", title: "Couldn't save the landed cost", message })}
              />
            ) : null}

            {isTransferReceive ? (
              <section className={styles.section} id="receive" aria-labelledby="d-receive">
                <h2 id="d-receive" className={styles.sectionTitle}>
                  Receive at {e.toWarehouse?.name}
                </h2>
                <p className={styles.sectionHelp} style={{ margin: "var(--space-2) 0 var(--space-5)" }}>
                  Enter what actually arrived. Any shortfall goes to damaged stock at {e.toWarehouse?.code} with a write-off for verification.
                </p>
                {receiveAttempt ? (
                  <div style={{ marginBottom: "var(--space-5)" }}>
                    <FormProblems problems={receiveProblems} labels={receiveLabels} title={Object.keys(receiveProblems).length === 1 ? "1 thing to fix before confirming" : `${Object.keys(receiveProblems).length} things to fix before confirming`} />
                  </div>
                ) : null}
                <table className={styles.lines}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className={styles.right}>Dispatched</th>
                      <th className={styles.right}>Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.lines.map((l) => (
                      <tr key={l.id}>
                        <td>
                          {l.product.code} — {l.product.name}
                          {l.serials.length && received[l.id] !== l.qty ? (
                            <div className={styles.chips} aria-label="Serials that arrived">
                              {l.serials.map((s) => {
                                const on = arrived[l.id]?.includes(s.serial) ?? false;
                                return (
                                  <button
                                    key={s.serial}
                                    type="button"
                                    aria-pressed={on}
                                    className={`${styles.chip} ${on ? styles.chipOn : ""}`}
                                    onClick={() => setArrived((a) => ({ ...a, [l.id]: on ? a[l.id]!.filter((v) => v !== s.serial) : [...(a[l.id] ?? []), s.serial] }))}
                                  >
                                    {s.serial}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                          {receiveErr(`serials:${l.id}`) ? <div className={styles.lineWarn}>{receiveErr(`serials:${l.id}`)}</div> : null}
                        </td>
                        <td className={`${styles.right} ${styles.num}`}>{formatQty(l.qty)}</td>
                        <td className={styles.right} style={{ width: 140 }}>
                          <input
                            className={`${styles.cellInput} ${receiveErr(`qty:${l.id}`) ? styles.cellInputError : ""}`}
                            inputMode="decimal"
                            aria-label={`Received quantity of ${l.product.code}`}
                            aria-invalid={receiveErr(`qty:${l.id}`) ? true : undefined}
                            value={received[l.id] ?? ""}
                            onChange={(ev) => setReceived((r) => ({ ...r, [l.id]: sanitize("qty", ev.target.value) }))}
                          />
                          {receiveErr(`qty:${l.id}`) ? <div className={styles.lineWarn}>{receiveErr(`qty:${l.id}`)}</div> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: "var(--space-5)" }}>
                  <Button onClick={confirmReceipt} disabled={!!busy}>
                    {busy === "receive" ? "Receiving…" : "Confirm receipt"}
                  </Button>
                </div>
              </section>
            ) : null}
          </div>

          <div className={styles.stack}>
            <section className={styles.section} aria-labelledby="d-timeline">
              <h2 id="d-timeline" className={styles.sectionTitle} style={{ marginBottom: "var(--space-5)" }}>
                Timeline
              </h2>
              <ol className={styles.timeline}>
                {e.timeline.map((t, i) => (
                  <li key={i}>
                    <div className={styles.timelineEvent}>{t.event.charAt(0) + t.event.slice(1).toLowerCase()}</div>
                    <div className={styles.muted}>
                      {formatDateTime(t.at)}
                      {t.by ? ` · ${t.by}` : ""}
                    </div>
                    {t.note ? <div className={styles.muted}>“{t.note}”</div> : null}
                  </li>
                ))}
              </ol>
              {e.relatedEntries.length ? (
                <div style={{ marginTop: "var(--space-5)" }}>
                  <div className={styles.muted}>Linked entries</div>
                  {e.relatedEntries.map((r) => (
                    <div key={r.id}>
                      <Link href={`/stock/${r.id}`} className={styles.mono}>
                        {r.number ?? "Draft"}
                      </Link>{" "}
                      <Tag kind={STATUS_TAG[r.status]}>{STATUS_LABEL[r.status]}</Tag>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className={styles.section} aria-labelledby="d-files">
              <div className={styles.sectionHead} style={{ marginBottom: 0 }}>
                <h2 id="d-files" className={styles.sectionTitle}>
                  Attachments
                </h2>
                {caps.canCreate ? (
                  <>
                    <input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple hidden onChange={(ev) => addFiles(ev.target.files)} />
                    <Button kind="secondary" size="sm" onClick={() => fileInput.current?.click()} disabled={busy === "upload"}>
                      {busy === "upload" ? "Uploading…" : "+ Add files"}
                    </Button>
                  </>
                ) : null}
              </div>
              {attachments.length ? (
                <ul className={styles.attachments}>
                  {attachments.map((a) => (
                    <li key={a.id} className={styles.attachment}>
                      <a href={a.url} target="_blank" rel="noopener noreferrer">
                        {a.fileName}
                      </a>
                      <span className={styles.muted}>{bytes(a.size)}</span>
                      {caps.canCreate ? (
                        <button type="button" className={styles.linkButton} onClick={() => removeFile(a)} aria-label={`Remove ${a.fileName}`}>
                          Remove
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.muted} style={{ marginTop: "var(--space-3)" }}>
                  Invoices, challans, photos — PDF, JPG, PNG or WebP up to 10 MB.
                </p>
              )}
            </section>
          </div>
        </div>
      </div>

      <Modal
        open={modal === "reject"}
        title="Reject entry"
        label={e.displayNumber}
        primaryText="Reject"
        primaryKind="danger"
        submitting={busy === "reject"}
        onClose={closeReason}
        onSubmit={(ev) => {
          ev.preventDefault();
          setReasonAttempt(true);
          if (reasonProblem) return;
          void act("reject", { reason: reason.trim() }, "Rejected. The creator can fix and resubmit it.");
        }}
      >
        {reasonAttempt && reasonProblem ? <FormProblems problems={{ reason: reasonProblem }} labels={{ reason: "Reason" }} title="1 thing to fix before rejecting" /> : null}
        <p style={{ marginBottom: "var(--space-5)" }}>Any reserved stock is released. The creator sees your reason and can edit and resubmit.</p>
        <TextAreaField label="Reason" rows={3} value={reason} onChange={(ev) => (setReason(ev.target.value), setReasonError(undefined))} error={shownReasonError} helper="3–500 characters." required />
      </Modal>

      <Modal
        open={modal === "reverse"}
        title="Reverse entry"
        label={e.displayNumber}
        primaryText="Reverse"
        primaryKind="danger"
        submitting={busy === "reverse"}
        onClose={closeReason}
        onSubmit={(ev) => {
          ev.preventDefault();
          setReasonAttempt(true);
          if (reasonProblem) return;
          void act("reverse", { reason: reason.trim() });
        }}
      >
        {reasonAttempt && reasonProblem ? <FormProblems problems={{ reason: reasonProblem }} labels={{ reason: "Reason" }} title="1 thing to fix before reversing" /> : null}
        <p style={{ marginBottom: "var(--space-5)" }}>
          A reversal entry undoes this entry&apos;s stock and cost exactly. It&apos;s refused if stock would go negative or if serial numbers have moved since. This can&apos;t be undone.
        </p>
        <TextAreaField label="Reason" rows={3} value={reason} onChange={(ev) => (setReason(ev.target.value), setReasonError(undefined))} error={shownReasonError} helper="3–500 characters." required />
      </Modal>

      <Modal
        open={modal === "cancel"}
        title="Cancel entry"
        label={e.displayNumber}
        primaryText="Cancel entry"
        primaryKind="danger"
        size="sm"
        submitting={busy === "cancel"}
        onClose={() => setModal(null)}
        onSubmit={(ev) => {
          ev.preventDefault();
          void act("cancel", undefined, "Cancelled. Any reserved stock was released.");
        }}
      >
        <p>The entry is kept for the record but can no longer be posted.</p>
      </Modal>
    </>
  );
}

interface ChargeRow {
  key: string;
  type: (typeof CHARGE_TYPES)[number][0];
  mode: "PERCENT_OF_GOODS" | "AMOUNT_BDT";
  value: string;
  includeInCost: boolean;
  label: string;
}

/**
 * Verifier (inventory APPROVE + seeCost) on a pending imported GRN: sets the customs exchange
 * rate and the landed-cost charges before approving. Often the Store Manager received the goods
 * without seeing any cost.
 */
function LandedCostEditor({ entry, onSaved, onError }: { entry: EntryDto; onSaved: (e: EntryDto) => void; onError: (message: string) => void }) {
  const [rate, setRate] = useState(entry.exchangeRate ?? "");
  const [rows, setRows] = useState<ChargeRow[]>(() =>
    entry.charges.map((c) => ({ key: c.id, type: c.type as ChargeRow["type"], mode: c.mode as ChargeRow["mode"], value: "value" in c && c.value ? String(c.value) : "", includeInCost: c.includeInCost, label: c.label ?? "" })),
  );
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(false);

  // Same rules as the server's LandedCostSchema; rows without a value are left out when saving.
  const sent = rows.filter((c) => c.value !== "");
  const problems = collect(
    ["exchangeRate", rules.rate(rate, { positive: true })],
    ...rows.flatMap((c): [string, string | undefined][] => [
      [`charge:${c.key}:value`, rules.rate(c.value)],
      [`charge:${c.key}:label`, c.type === "OTHER" ? rules.maxLength(c.label, 100) : undefined],
    ]),
    ["charges", sent.length > 20 ? "Enter at most 20 charges." : undefined],
  );
  const errors: Record<string, string> = { ...serverErrors, ...(attempt ? problems : {}) };
  const rowNo = (key: string) => rows.findIndex((r) => r.key === key) + 1;
  const labels: Record<string, string> = {
    exchangeRate: "Customs exchange rate",
    charges: "Charges",
    ...Object.fromEntries(rows.flatMap((c) => [[`charge:${c.key}:value`, `Charge ${rowNo(c.key)} value`] as const, [`charge:${c.key}:label`, `Charge ${rowNo(c.key)} label`] as const])),
  };

  // A server error disappears once the form is edited.
  useEffect(() => setServerErrors({}), [rate, rows]);

  async function save() {
    setAttempt(true);
    if (Object.keys(problems).length) return;
    setSaving(true);
    setServerErrors({});
    try {
      const body = { exchangeRate: rate.trim() || undefined, charges: sent.map(({ key: _k, label, ...c }) => ({ ...c, label: label.trim() || null })) };
      onSaved((await api<{ data: EntryDto }>(`/stock-entries/${entry.id}/landed-cost`, { method: "PUT", body })).data);
      setAttempt(false);
    } catch (err) {
      const fields = err instanceof ApiError ? err.fieldErrors() : {};
      if (Object.keys(fields).length) {
        // Server paths count only the rows that were sent (charges.<n>.<field>): map them back to the rows on screen.
        const mapped: Record<string, string> = {};
        for (const [path, message] of Object.entries(fields)) {
          const m = /^charges\.(\d+)\.(value|label)/.exec(path);
          const row = m ? sent[Number(m[1])] : undefined;
          mapped[row ? `charge:${row.key}:${m![2]}` : path.startsWith("charges") ? "charges" : path] = message;
        }
        setServerErrors(mapped);
      } else onError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="d-landed">
      <div className={styles.sectionHead}>
        <div>
          <h2 id="d-landed" className={styles.sectionTitle}>
            Landed cost (verification)
          </h2>
          <p className={styles.sectionHelp}>Enter the customs rate and the duties and charges from the bill of entry. Charges marked “in cost” are spread over the lines by goods value.</p>
        </div>
        <Button kind="secondary" size="sm" onClick={() => setRows((cs) => [...cs, { key: newKey(), type: "CUSTOMS_DUTY", mode: "PERCENT_OF_GOODS", value: "", includeInCost: true, label: "" }])}>
          + Add charge
        </Button>
      </div>
      {attempt && Object.keys(problems).length ? (
        <div style={{ marginBottom: "var(--space-5)" }}>
          <FormProblems problems={problems} labels={labels} />
        </div>
      ) : null}
      <div className={styles.grid} style={{ marginBottom: "var(--space-5)" }}>
        <TextField label={`Customs exchange rate (৳ per ${entry.currency})`} kind="rate" value={rate} onChange={(ev) => setRate(ev.target.value)} error={errors.exchangeRate} />
      </div>
      {rows.length ? (
        <div className={styles.linesWrap}>
          <table className={styles.lines}>
            <thead>
              <tr>
                <th>Charge</th>
                <th>Basis</th>
                <th className={styles.right}>Value</th>
                <th>In cost</th>
                <th>
                  <span className="visually-hidden">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => {
                const upd = (patch: Partial<ChargeRow>) => setRows((cs) => cs.map((y) => (y.key === c.key ? { ...y, ...patch } : y)));
                return (
                  <tr key={c.key}>
                    <td>
                      <Select className={styles.cellInput} aria-label={`Charge type ${i + 1}`} value={c.type} onChange={(ev) => upd({ type: ev.target.value as ChargeRow["type"], includeInCost: !["IMPORT_VAT", "AIT"].includes(ev.target.value) })}>
                        {CHARGE_TYPES.map(([v, label]) => (
                          <option key={v} value={v}>
                            {label}
                          </option>
                        ))}
                      </Select>
                      {c.type === "OTHER" ? (
                        <input
                          className={`${styles.cellInput} ${errors[`charge:${c.key}:label`] ? styles.cellInputError : ""}`}
                          style={{ marginTop: "var(--space-2)" }}
                          aria-label="Charge label"
                          aria-invalid={errors[`charge:${c.key}:label`] ? true : undefined}
                          placeholder="Label"
                          value={c.label}
                          onChange={(ev) => upd({ label: ev.target.value })}
                        />
                      ) : null}
                      {errors[`charge:${c.key}:label`] ? <div className={styles.lineWarn}>{errors[`charge:${c.key}:label`]}</div> : null}
                    </td>
                    <td>
                      <Select className={styles.cellInput} aria-label={`Charge basis ${i + 1}`} value={c.mode} onChange={(ev) => upd({ mode: ev.target.value as ChargeRow["mode"] })}>
                        <option value="PERCENT_OF_GOODS">% of goods</option>
                        <option value="AMOUNT_BDT">Amount ৳</option>
                      </Select>
                    </td>
                    <td className={styles.right}>
                      <input
                        className={`${styles.cellInput} ${errors[`charge:${c.key}:value`] ? styles.cellInputError : ""}`}
                        inputMode="decimal"
                        aria-label={`Charge value ${i + 1}`}
                        aria-invalid={errors[`charge:${c.key}:value`] ? true : undefined}
                        value={c.value}
                        onChange={(ev) => upd({ value: sanitize("rate", ev.target.value) })}
                      />
                      {errors[`charge:${c.key}:value`] ? <div className={styles.lineWarn}>{errors[`charge:${c.key}:value`]}</div> : null}
                    </td>
                    <td>
                      <Checkbox label="In cost" checked={c.includeInCost} onChange={(ev) => upd({ includeInCost: ev.target.checked })} />
                    </td>
                    <td>
                      <Button kind="ghost" size="sm" aria-label={`Remove charge ${i + 1}`} onClick={() => setRows((cs) => cs.filter((y) => y.key !== c.key))}>
                        ✕
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.muted}>No charges: stock cost will be the converted goods value.</p>
      )}
      {errors.charges ? <p className={styles.negative}>{errors.charges}</p> : null}
      <div style={{ marginTop: "var(--space-5)" }}>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save landed cost"}
        </Button>
      </div>
    </section>
  );
}

function Spec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
