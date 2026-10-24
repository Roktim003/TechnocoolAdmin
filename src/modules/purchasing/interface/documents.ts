import { randomUUID } from "node:crypto";
import type { Job } from "bullmq";
import { APP_NAME } from "@/shared/config/constants";
import type { Logger } from "@/shared/logger/logger";
import { getQueue, QUEUES } from "@/shared/queue/queue";
import { storage } from "@/shared/storage/storage";
import { formatDateTime } from "@/shared/time/format";
import { renderEmail } from "@/modules/notifications/application/email-template";
import { notifications } from "@/modules/notifications/interface/container";
import type { PoDocumentQueue } from "../application/ports";
import { renderPoHtml } from "../infrastructure/po-document-template";

/** Job on the shared `documents` queue (inventory's status / download endpoint serves it). */
export interface PoDocumentJob {
  kind: "PURCHASE_ORDER";
  purchaseOrderId: string;
  userId: string;
  userName: string;
  showPrices: boolean;
  fileKey: string;
  /** Email the rendered PDF to the supplier. */
  email?: { to: string; cc: string | null; message: string | null };
}

export const PO_DOCUMENT_JOB = "purchase-order";

export const poDocumentQueue: PoDocumentQueue = {
  async enqueue(job) {
    const jobId = randomUUID();
    const data: PoDocumentJob = { kind: "PURCHASE_ORDER", ...job, fileKey: `documents/${jobId}.pdf` };
    await getQueue(QUEUES.documents).add(PO_DOCUMENT_JOB, data, { jobId, attempts: 2, removeOnComplete: { age: 24 * 3600 }, removeOnFail: { age: 24 * 3600 } });
    return { jobId };
  },
};

/** Worker: PO → HTML → PDF → private storage; then, if asked, the supplier email (email queue) with the PDF attached. */
export async function processPoDocumentJob(job: Job, log: Logger) {
  const data = job.data as PoDocumentJob;
  const { purchasing } = await import("./container");
  const po = await purchasing().uow.store.po(data.purchaseOrderId);
  if (!po) throw new Error("Purchase order no longer exists.");
  const companyName = process.env.COMPANY_NAME ?? APP_NAME;
  const html = renderPoHtml(po, { showPrices: data.showPrices, companyName, companyAddress: process.env.COMPANY_ADDRESS ?? null, printedBy: data.userName, printedAt: formatDateTime(new Date()) });
  const { htmlToPdf } = await import("@/modules/inventory/infrastructure/pdf");
  const pdf = await htmlToPdf(html);
  await storage().put(data.fileKey, pdf, "application/pdf");
  const fileName = `${(po.number ?? po.draftRef).replace(/[^\w-]/g, "_")}${po.revision ? `-rev${po.revision}` : ""}.pdf`;

  let emailLogId: string | null = null;
  if (data.email && job.attemptsMade === 0) {
    const no = po.number ?? po.draftRef;
    const content = renderEmail({
      title: `Purchase order ${no}${po.revision ? ` (revision ${po.revision})` : ""}`,
      paragraphs: [
        `Dear ${po.supplier.contactPerson ?? po.supplier.name},`,
        ...(data.email.message ? [data.email.message] : [`Please find attached our purchase order ${no}${po.expectedDeliveryDate ? `, for delivery by ${po.expectedDeliveryDate}` : ""} to ${po.deliverTo.name}.`]),
        "Please confirm receipt of this order.",
        `${companyName}`,
      ],
      footer: `Sent by ${companyName} via StockBook on behalf of ${data.userName}.`,
    });
    emailLogId = await notifications().service.queueEmail(
      { to: data.email.to, cc: data.email.cc, subject: `Purchase order ${no} — ${companyName}`, ...content, attachments: [{ filename: fileName, fileKey: data.fileKey, contentType: "application/pdf" }] },
      "PO_TO_SUPPLIER",
    );
  }
  log.info({ jobId: job.id, purchaseOrderId: po.id, bytes: pdf.byteLength, emailed: !!emailLogId }, "PO document rendered");
  return { fileName, bytes: pdf.byteLength, emailLogId };
}
