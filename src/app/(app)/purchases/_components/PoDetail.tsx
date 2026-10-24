"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox, TextAreaField, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { Tag } from "@/components/ui/Tag";
import { api, ApiError, errorMessage, upload } from "@/lib/api-client";
import { formatDateTime, formatMoney } from "@/shared/time/format";
import { ProductPicker } from "../../stock/_components/ProductPicker";
import { formatAmount, formatQty, newKey, STATUS_LABEL, STATUS_TAG, type ProductOption } from "../../stock/_components/types";
import { Progress } from "./Progress";
import { PO_STATUS_LABEL, PO_STATUS_TAG, type PoDetailDto, type PurchasesCaps } from "./types";
import styles from "../../stock/_components/stock.module.css";
import p from "./purchases.module.css";

const SAVED: Record<string, string> = {
  draft: "Draft saved.",
  submit: "Submitted for approval. The purchasing approvers have been notified.",
  approve: "Approved. Send it to the supplier, then receive the goods against it.",
};

type ModalKind = "reject" | "sent" | "email" | "amend" | "close" | "cancel" | null;

interface AmendLine {
  key: string;
  id: string | null;
  product: ProductOption | null;
  qty: string;
  unitPrice: string;
  min: string;
  note: string | null;
}

const bytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const trimZeros = (v: string) => (v.includes(".") ? v.replace(/\.?0+$/, "") : v);
const pretty = (event: string) => event.charAt(0) + event.slice(1).toLowerCase();

export function PoDetail({ caps, initial, saved }: { caps: PurchasesCaps; initial: PoDetailDto; saved: string | null }) {
  const router = useRouter();
  const [po, setPo] = useState(initial);
  const [notice, setNotice] = useState<{ kind: "success" | "error" | "warning" | "info"; title?: string; message: string } | null>(saved && SAVED[saved] ? { kind: "success", message: SAVED[saved] } : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [emailSupplier, setEmailSupplier] = useState(!!initial.supplier.email);
  const [to, setTo] = useState(initial.supplier.email ?? "");
  const [cc, setCc] = useState("");
  const [message, setMessage] = useState("");
  const [amendLines, setAmendLines] = useState<AmendLine[]>([]);
  const [amendDate, setAmendDate] = useState("");
  const [amendRate, setAmendRate] = useState("");
  const keyRef = useRef(newKey());
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (saved) {
      const url = new URL(window.location.href);
      url.searchParams.delete("saved");
      window.history.replaceState(null, "", url);
    }
  }, [saved]);

  const close = () => {
    setModal(null);
    setFieldErrors({});
  };

  /** Workflow POSTs (Idempotency-Key per user action). */
  async function act(action: "submit" | "approve" | "reject" | "mark-sent" | "close" | "cancel" | "amend", body: unknown, success: string) {
    setBusy(action);
    setFieldErrors({});
    try {
      const r = await api<{ data: PoDetailDto & { email?: { to: string } | null } }>(`/purchase-orders/${po.id}/${action}`, { method: "POST", body, headers: { "Idempotency-Key": keyRef.current } });
      setPo(r.data);
      setNotice({ kind: "success", message: r.data.email ? `${success} The PO PDF is being emailed to ${r.data.email.to}.` : success });
      setModal(null);
      setReason("");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors()).length && modal) setFieldErrors(err.fieldErrors());
      else {
        setModal(null);
        setNotice({ kind: "error", title: "That didn't work", message: errorMessage(err) });
      }
    } finally {
      keyRef.current = newKey();
      setBusy(null);
    }
  }

  async function sendEmail() {
    setBusy("email");
    setFieldErrors({});
    try {
      const r = await api<{ data: { to: string } }>(`/purchase-orders/${po.id}/email`, { method: "POST", body: { to: to || undefined, cc: cc || undefined, message: message || null }, headers: { "Idempotency-Key": keyRef.current } });
      setNotice({ kind: "success", message: `The PO PDF is being emailed to ${r.data.to}.` });
      setModal(null);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors()).length) setFieldErrors(err.fieldErrors());
      else {
        setModal(null);
        setNotice({ kind: "error", title: "Couldn't send the email", message: errorMessage(err) });
      }
    } finally {
      keyRef.current = newKey();
      setBusy(null);
    }
  }

  async function pdf() {
    setBusy("pdf");
    try {
      const job = (await api<{ data: { jobId: string } }>(`/purchase-orders/${po.id}/documents`, { method: "POST", body: {} })).data;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 800));
        const s = (await api<{ data: { status: string; downloadUrl: string | null; failedReason: string | null } }>(`/documents/${job.jobId}`)).data;
        if (s.status === "completed" && s.downloadUrl) {
          window.open(s.downloadUrl, "_blank", "noopener");
          return;
        }
        if (s.status === "failed") throw new Error(s.failedReason ?? "The PDF couldn't be created.");
      }
      throw new Error("The PDF is taking too long. Try again in a minute.");
    } catch (err) {
      setNotice({ kind: "error", title: "Couldn't create the PDF", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("file", f);
    setBusy("upload");
    try {
      await upload(`/purchase-orders/${po.id}/attachments`, fd);
      const r = await api<{ data: PoDetailDto["attachments"] }>(`/purchase-orders/${po.id}/attachments`);
      setPo((x) => ({ ...x, attachments: r.data }));
    } catch (err) {
      setNotice({ kind: "error", title: "Upload failed", message: errorMessage(err) });
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removeFile(a: PoDetailDto["attachments"][number]) {
    if (!window.confirm(`Remove ${a.fileName}?`)) return;
    try {
      await api(`/purchase-orders/${po.id}/attachments/${a.id}`, { method: "DELETE" });
      setPo((x) => ({ ...x, attachments: x.attachments.filter((y) => y.id !== a.id) }));
    } catch (err) {
      setNotice({ kind: "error", message: errorMessage(err) });
    }
  }

  function openAmend() {
    setAmendLines(
      po.lines.map((l) => ({
        key: l.id,
        id: l.id,
        product: { id: l.product.id, code: l.product.code, name: l.product.name, model: null, unit: { code: l.product.unitCode }, sellingPrice: "", trackSerial: l.product.trackSerial, status: l.product.status },
        qty: trimZeros(l.qty),
        unitPrice: l.unitPrice ? trimZeros(l.unitPrice) : "",
        min: (Number(l.receivedQty) + Number(l.pendingReceiptQty)).toString(),
        note: l.note,
      })),
    );
    setAmendDate(po.expectedDeliveryDate ?? "");
    setAmendRate(po.type === "IMPORTED" ? trimZeros(po.exchangeRate) : "");
    setReason("");
    setModal("amend");
  }

  function amendBody() {
    return {
      reason,
      expectedDeliveryDate: amendDate || null,
      ...(po.type === "IMPORTED" && amendRate ? { exchangeRate: amendRate } : {}),
      // Prices are purchase costs: only roles with seeCost can change the lines.
      ...(caps.seeCost ? { lines: amendLines.filter((l) => l.product).map((l) => ({ ...(l.id ? { id: l.id } : {}), productId: l.product!.id, qty: l.qty || "0", unitPrice: l.unitPrice || "0", note: l.note })) } : {}),
    };
  }

  const x = po.actions;
  const local = po.type === "LOCAL";
  const showPrice = caps.seeCost && po.lines.some((l) => l.unitPrice !== undefined);
  const price = (v: string | undefined) => (local ? formatMoney(v) : formatAmount(v, po.currency));

  return (
    <>
      <div className={styles.breadcrumb}>
        <Link href="/purchases">Purchases</Link> / {po.displayNumber}
      </div>
      <div className={styles.detailHeader}>
        <div>
          <h1 className={styles.detailTitle}>
            <span className={styles.mono} style={{ fontSize: "inherit" }}>
              {po.displayNumber}
            </span>
            <Tag kind={PO_STATUS_TAG[po.status]}>{PO_STATUS_LABEL[po.status]}</Tag>
            {po.revision ? <Tag kind="gray">Rev {po.revision}</Tag> : null}
            {po.overdue ? <Tag kind="red">Overdue</Tag> : null}
          </h1>
          <p className={styles.detailSub}>
            <Link href={`/purchases/suppliers/${po.supplier.id}`}>{po.supplier.name}</Link> · {local ? "Local" : `Imported (${po.currency})`} · deliver to {po.deliverTo.name} · {po.poDate} · by {po.createdBy.name}
          </p>
        </div>
        <div className={styles.detailActions}>
          {x.receive ? (
            <Link href={`/stock?tab=new&po=${po.id}`}>
              <Button>Receive goods (GRN)</Button>
            </Link>
          ) : null}
          {x.edit ? (
            <Link href={`/purchases/${po.id}/edit`}>
              <Button kind="secondary">Edit</Button>
            </Link>
          ) : null}
          {x.submit ? (
            <Button kind={x.approve ? "secondary" : "primary"} onClick={() => act("submit", undefined, "Submitted for approval.")} disabled={!!busy}>
              {busy === "submit" ? "Submitting…" : "Submit for approval"}
            </Button>
          ) : null}
          {x.approve ? (
            <Button onClick={() => act("approve", undefined, "Approved.")} disabled={!!busy}>
              {busy === "approve" ? "Approving…" : "Approve"}
            </Button>
          ) : null}
          {x.reject ? (
            <Button kind="danger" onClick={() => (setReason(""), setModal("reject"))} disabled={!!busy}>
              Reject
            </Button>
          ) : null}
          {x.markSent ? (
            <Button onClick={() => setModal("sent")} disabled={!!busy}>
              Mark as sent
            </Button>
          ) : null}
          {x.email ? (
            <Button kind="secondary" onClick={() => setModal("email")} disabled={!!busy}>
              Email supplier
            </Button>
          ) : null}
          {x.pdf ? (
            <Button kind="secondary" onClick={pdf} disabled={busy === "pdf"}>
              {busy === "pdf" ? "Preparing PDF…" : "PDF"}
            </Button>
          ) : null}
          {x.amend ? (
            <Button kind="secondary" onClick={openAmend} disabled={!!busy}>
              Amend
            </Button>
          ) : null}
          {x.close ? (
            <Button kind="ghost" onClick={() => (setReason(""), setModal("close"))} disabled={!!busy}>
              Close PO
            </Button>
          ) : null}
          {x.cancel ? (
            <Button kind="ghost" onClick={() => (setReason(""), setModal("cancel"))} disabled={!!busy}>
              Cancel PO
            </Button>
          ) : null}
        </div>
      </div>

      <div className={styles.stack}>
        {notice ? (
          <Notification kind={notice.kind} title={notice.title} onClose={() => setNotice(null)}>
            {notice.message}
          </Notification>
        ) : null}
        {x.waitingForOtherApprover ? <Notification kind="info">Waiting for approval by another purchasing approver; you can&apos;t approve your own PO.</Notification> : null}
        {po.status === "REJECTED" && po.rejectionReason ? (
          <Notification kind="error" title={`Rejected by ${po.rejectedBy?.name ?? "approver"}`}>
            {po.rejectionReason}
            {x.edit ? " — edit it and submit again." : ""}
          </Notification>
        ) : null}
        {po.overdue ? (
          <Notification kind="warning" title="Overdue">
            Expected by {po.expectedDeliveryDate}; {formatQty(po.progress.orderedQty)} ordered, {formatQty(po.progress.receivedQty)} received. Follow up with the supplier or amend the expected date.
          </Notification>
        ) : null}
        {po.status === "CLOSED" ? <Notification kind="info" title="Closed">{po.closedReason} — the remaining quantities will not be received.</Notification> : null}
        {po.status === "CANCELLED" ? <Notification kind="info" title="Cancelled">{po.cancelledReason}</Notification> : null}

        <div className={styles.detailLayout}>
          <div className={styles.stack}>
            <section className={styles.section} aria-labelledby="po-details">
              <h2 id="po-details" className={styles.sectionTitle} style={{ marginBottom: "var(--space-5)" }}>
                Details
              </h2>
              <dl className={styles.specs}>
                <Spec label="Supplier">
                  <Link href={`/purchases/suppliers/${po.supplier.id}`}>{po.supplier.name}</Link> <span className={styles.mono}>{po.supplier.code}</span>
                </Spec>
                <Spec label="Deliver to">{po.deliverTo.name}</Spec>
                <Spec label="Expected delivery">{po.expectedDeliveryDate ?? "—"}</Spec>
                {po.project ? <Spec label="Project">{`${po.project.code} — ${po.project.name}`}</Spec> : null}
                {po.supplierQuoteRef ? <Spec label="Supplier quote">{po.supplierQuoteRef}</Spec> : null}
                {!local ? <Spec label="Exchange rate (indicative)">{Number(po.exchangeRate) ? `1 ${po.currency} = ৳ ${po.exchangeRate}` : "Not set"}</Spec> : null}
                {local ? <Spec label="VAT">{`${po.vatPercent}%`}</Spec> : null}
                {po.approvedBy ? <Spec label="Approved by">{`${po.approvedBy.name} · ${formatDateTime(po.approvedAt!)}`}</Spec> : null}
                {po.sentAt ? <Spec label="Sent">{formatDateTime(po.sentAt)}</Spec> : null}
                {po.notes ? <Spec label="Internal notes">{po.notes}</Spec> : null}
              </dl>
              {po.terms ? (
                <div style={{ marginTop: "var(--space-5)" }}>
                  <div className={styles.muted}>Terms &amp; conditions</div>
                  <p style={{ whiteSpace: "pre-wrap", margin: "var(--space-2) 0 0" }}>{po.terms}</p>
                </div>
              ) : null}
            </section>

            <section className={styles.section} aria-labelledby="po-lines">
              <div className={styles.sectionHead}>
                <h2 id="po-lines" className={styles.sectionTitle}>
                  Products ({po.lines.length})
                </h2>
                <span title={`${formatQty(po.progress.receivedQty)} of ${formatQty(po.progress.orderedQty)} received`}>
                  <Progress percent={po.progress.percent} />
                </span>
              </div>
              <div className={styles.linesWrap}>
                <table className={styles.lines}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Product</th>
                      <th className={styles.right}>Ordered</th>
                      <th className={styles.right}>Received</th>
                      <th className={styles.right}>Pending GRN</th>
                      <th className={styles.right}>Remaining</th>
                      {showPrice ? <th className={styles.right}>Unit price{local ? "" : ` (${po.currency})`}</th> : null}
                      {showPrice ? <th className={styles.right}>Amount</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {po.lines.map((l) => (
                      <tr key={l.id}>
                        <td>{l.lineNo}</td>
                        <td>
                          <div>{l.product.name}</div>
                          <div className={styles.lineMeta}>
                            <Link href={`/stock/products/${l.product.id}`} className={styles.mono}>
                              {l.product.code}
                            </Link>
                            {l.note ? ` · ${l.note}` : ""}
                          </div>
                        </td>
                        <td className={`${styles.right} ${styles.num}`}>
                          {formatQty(l.qty)} {l.product.unitCode}
                        </td>
                        <td className={`${styles.right} ${styles.num}`}>{formatQty(l.receivedQty)}</td>
                        <td className={`${styles.right} ${styles.num}`}>{Number(l.pendingReceiptQty) ? formatQty(l.pendingReceiptQty) : "—"}</td>
                        <td className={`${styles.right} ${styles.num}`}>{formatQty(l.remainingQty)}</td>
                        {showPrice ? <td className={`${styles.right} ${styles.num}`}>{price(l.unitPrice)}</td> : null}
                        {showPrice ? <td className={`${styles.right} ${styles.num}`}>{price(l.amount)}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {po.total !== undefined ? (
                <dl className={styles.totals} style={{ marginTop: "var(--space-5)", marginLeft: "auto", maxWidth: 380 }}>
                  <dt>Subtotal</dt>
                  <dd>{price(po.subtotal)}</dd>
                  {local ? (
                    <>
                      <dt>Discount</dt>
                      <dd>− {formatMoney(po.discountAmount)}</dd>
                      <dt>VAT {po.vatPercent}%</dt>
                      <dd>{formatMoney(po.vatAmount)}</dd>
                    </>
                  ) : null}
                  <dt className={styles.grand}>Total</dt>
                  <dd className={styles.grand}>{price(po.total)}</dd>
                  {!local ? (
                    <>
                      <dt>BDT equivalent</dt>
                      <dd>{Number(po.totalBdt) ? formatMoney(po.totalBdt) : "—"}</dd>
                    </>
                  ) : null}
                </dl>
              ) : null}
            </section>

            <section className={styles.section} aria-labelledby="po-grns">
              <h2 id="po-grns" className={styles.sectionTitle} style={{ marginBottom: "var(--space-5)" }}>
                Goods received
              </h2>
              {po.receipts.length ? (
                <table className={styles.lines}>
                  <thead>
                    <tr>
                      <th>GRN</th>
                      <th>Date</th>
                      <th className={styles.right}>Qty</th>
                      <th>Status</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.receipts.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link href={`/stock/${r.id}`} className={styles.mono}>
                            {r.displayNumber}
                          </Link>
                        </td>
                        <td>{r.entryDate}</td>
                        <td className={`${styles.right} ${styles.num}`}>{formatQty(r.totalQty)}</td>
                        <td>
                          <Tag kind={STATUS_TAG[r.status as keyof typeof STATUS_TAG]}>{STATUS_LABEL[r.status as keyof typeof STATUS_LABEL]}</Tag>
                        </td>
                        <td>{r.createdBy.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className={styles.muted}>No goods received yet.{x.receive ? " Use “Receive goods” when the delivery arrives." : ""}</p>
              )}
            </section>

            {po.revisions.length ? (
              <section className={styles.section} aria-labelledby="po-revs">
                <h2 id="po-revs" className={styles.sectionTitle} style={{ marginBottom: "var(--space-5)" }}>
                  Amendments
                </h2>
                <ol className={styles.timeline}>
                  {po.revisions.map((r) => (
                    <li key={r.id}>
                      <div className={styles.timelineEvent}>Revision {r.revision}</div>
                      <div className={styles.muted}>
                        {formatDateTime(r.createdAt)} · {r.changedBy.name} · “{r.reason}”
                      </div>
                      {r.changes.length ? (
                        <ul className={p.changes}>
                          {r.changes.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>

          <div className={styles.stack}>
            <section className={styles.section} aria-labelledby="po-timeline">
              <h2 id="po-timeline" className={styles.sectionTitle} style={{ marginBottom: "var(--space-5)" }}>
                Timeline
              </h2>
              <ol className={styles.timeline}>
                {po.timeline.map((t, i) => (
                  <li key={i}>
                    <div className={styles.timelineEvent}>{t.link ? <Link href={t.link}>{pretty(t.event)}</Link> : pretty(t.event)}</div>
                    <div className={styles.muted}>
                      {formatDateTime(t.at)}
                      {t.by ? ` · ${t.by}` : ""}
                    </div>
                    {t.note ? <div className={styles.muted}>“{t.note}”</div> : null}
                  </li>
                ))}
              </ol>
            </section>

            <section className={styles.section} aria-labelledby="po-files">
              <div className={styles.sectionHead} style={{ marginBottom: 0 }}>
                <h2 id="po-files" className={styles.sectionTitle}>
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
              {po.attachments.length ? (
                <ul className={styles.attachments}>
                  {po.attachments.map((a) => (
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
                  Supplier quotations, proforma invoices — PDF, JPG, PNG or WebP up to 10 MB.
                </p>
              )}
            </section>
          </div>
        </div>
      </div>

      <ReasonModal
        open={modal === "reject"}
        title="Reject purchase order"
        label={po.displayNumber}
        text="The creator sees your reason and can edit and resubmit the PO."
        primary="Reject"
        reason={reason}
        setReason={setReason}
        error={fieldErrors.reason}
        busy={busy === "reject"}
        onClose={close}
        onSubmit={() => act("reject", { reason }, "Rejected. The creator was notified.")}
      />
      <ReasonModal
        open={modal === "close"}
        title="Close purchase order"
        label={po.displayNumber}
        text="Closing ends the PO with what was received; the remaining quantities won't be received. The reason is recorded."
        primary="Close PO"
        reason={reason}
        setReason={setReason}
        error={fieldErrors.reason}
        busy={busy === "close"}
        onClose={close}
        onSubmit={() => act("close", { reason }, "Closed.")}
      />
      <ReasonModal
        open={modal === "cancel"}
        title="Cancel purchase order"
        label={po.displayNumber}
        text="Nothing was received against this PO. Cancelling keeps it for the record; it can no longer be received against."
        primary="Cancel PO"
        reason={reason}
        setReason={setReason}
        error={fieldErrors.reason}
        busy={busy === "cancel"}
        onClose={close}
        onSubmit={() => act("cancel", { reason }, "Cancelled.")}
      />

      <Modal
        open={modal === "sent"}
        title="Mark as sent to supplier"
        label={po.displayNumber}
        primaryText={emailSupplier ? "Mark sent & email" : "Mark sent"}
        submitting={busy === "mark-sent"}
        onClose={close}
        onSubmit={() => act("mark-sent", emailSupplier ? { emailSupplier: true, to: to || undefined, message: message || null } : {}, "Marked as sent.")}
      >
        <div className={styles.stack}>
          <Checkbox label="Also email the PO PDF to the supplier" checked={emailSupplier} onChange={(e) => setEmailSupplier(e.target.checked)} />
          {emailSupplier ? (
            <>
              <TextField label="To" type="email" value={to} onChange={(e) => setTo(e.target.value)} error={fieldErrors.to} helper={po.supplier.email ? undefined : "The supplier has no email on file."} />
              <TextAreaField label="Message (optional)" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} error={fieldErrors.message} />
            </>
          ) : null}
        </div>
      </Modal>

      <Modal open={modal === "email"} title="Email PO to supplier" label={po.displayNumber} primaryText="Send" submitting={busy === "email"} onClose={close} onSubmit={() => void sendEmail()}>
        <div className={styles.stack}>
          <TextField label="To" type="email" value={to} onChange={(e) => setTo(e.target.value)} error={fieldErrors.to} />
          <TextField label="Cc (optional)" type="email" value={cc} onChange={(e) => setCc(e.target.value)} error={fieldErrors.cc} />
          <TextAreaField label="Message (optional)" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} error={fieldErrors.message} helper="The PO PDF is attached." />
        </div>
      </Modal>

      <Modal open={modal === "amend"} title="Amend purchase order" label={po.displayNumber} primaryText="Save amendment" submitting={busy === "amend"} onClose={close} onSubmit={() => act("amend", amendBody(), "Amended. The previous version is kept as a revision.")}>
        <div className={styles.stack}>
          <p className={styles.muted}>A line can&apos;t go below what was already received or is pending on a GRN. The PO keeps its number; the old version is saved as a revision.</p>
          {fieldErrors.lines ? <Notification kind="error">{fieldErrors.lines}</Notification> : null}
          {caps.seeCost ? (
            <div className={styles.linesWrap}>
              <table className={styles.lines}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className={styles.right}>Qty</th>
                    <th className={styles.right}>Unit price{local ? "" : ` (${po.currency})`}</th>
                    <th>
                      <span className="visually-hidden">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {amendLines.map((l, i) => {
                    const upd = (patch: Partial<AmendLine>) => setAmendLines((ls) => ls.map((y) => (y.key === l.key ? { ...y, ...patch } : y)));
                    return (
                      <tr key={l.key}>
                        <td>
                          {l.id ? (
                            <>
                              <span className={styles.mono}>{l.product?.code}</span> {l.product?.name}
                            </>
                          ) : (
                            <ProductPicker value={l.product} onChange={(prod) => upd({ product: prod })} />
                          )}
                          {Number(l.min) ? <div className={styles.lineMeta}>At least {formatQty(l.min)} (received + pending)</div> : null}
                        </td>
                        <td className={styles.right}>
                          <input className={styles.cellInput} inputMode="decimal" aria-label={`Quantity, line ${i + 1}`} value={l.qty} onChange={(e) => upd({ qty: e.target.value })} />
                        </td>
                        <td className={styles.right}>
                          <input className={styles.cellInput} inputMode="decimal" aria-label={`Unit price, line ${i + 1}`} value={l.unitPrice} onChange={(e) => upd({ unitPrice: e.target.value })} />
                        </td>
                        <td>
                          {Number(l.min) ? null : (
                            <Button kind="ghost" size="sm" aria-label={`Remove line ${i + 1}`} onClick={() => setAmendLines((ls) => ls.filter((y) => y.key !== l.key))}>
                              ✕
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ marginTop: "var(--space-3)" }}>
                <Button kind="secondary" size="sm" onClick={() => setAmendLines((ls) => [...ls, { key: newKey(), id: null, product: null, qty: "", unitPrice: "", min: "0", note: null }])}>
                  + Add product
                </Button>
              </div>
            </div>
          ) : (
            <p className={styles.muted}>Quantities and prices can be amended by roles that can see costs. You can change the expected delivery date.</p>
          )}
          <div className={styles.grid}>
            <TextField label="Expected delivery" type="date" value={amendDate} onChange={(e) => setAmendDate(e.target.value)} error={fieldErrors.expectedDeliveryDate} />
            {!local ? <TextField label={`Exchange rate (৳ per ${po.currency})`} inputMode="decimal" value={amendRate} onChange={(e) => setAmendRate(e.target.value)} error={fieldErrors.exchangeRate} /> : null}
          </div>
          <TextAreaField label="Reason for the amendment" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} error={fieldErrors.reason} required />
        </div>
      </Modal>
    </>
  );
}

function ReasonModal(props: { open: boolean; title: string; label: string; text: string; primary: string; reason: string; setReason: (v: string) => void; error?: string; busy: boolean; onClose: () => void; onSubmit: () => void }) {
  return (
    <Modal open={props.open} title={props.title} label={props.label} primaryText={props.primary} primaryKind="danger" submitting={props.busy} onClose={props.onClose} onSubmit={props.onSubmit}>
      <p style={{ marginBottom: "var(--space-5)" }}>{props.text}</p>
      <TextAreaField label="Reason" rows={3} value={props.reason} onChange={(e) => props.setReason(e.target.value)} error={props.error} required />
    </Modal>
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
