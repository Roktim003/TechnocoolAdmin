import { randomUUID } from "node:crypto";
import type { Job } from "bullmq";
import { BusinessRuleError, NotFoundError } from "@/shared/errors/app-error";
import type { Logger } from "@/shared/logger/logger";
import { getQueue, QUEUES } from "@/shared/queue/queue";
import { formatDateTime } from "@/shared/time/format";
import { APP_NAME } from "@/shared/config/constants";
import type { DocumentKind } from "../application/dto";
import type { InventoryActor } from "../application/ports";
import { allowedKinds, defaultDocumentKind, DOCUMENT_TITLES, renderDocumentHtml } from "../infrastructure/document-template";
import { renderCountSheetHtml } from "../infrastructure/count-sheet-template";
import { inventory } from "./container";

interface EntryDocumentJob {
  entryId: string;
  kind: DocumentKind;
  userId: string;
  userName: string;
  showCost: boolean;
  fileKey: string;
}

interface CountSheetJob {
  countId: string;
  kind: "COUNT_SHEET";
  userId: string;
  userName: string;
  /** False for blind counts printed by counters. */
  showSystem: boolean;
  fileKey: string;
}

/**
 * Other modules queue their own jobs on the documents queue (e.g. purchasing: "purchase-order"
 * jobs carrying purchaseOrderId; projects: "project-cost-statement" with projectId); status and download only rely on userId, kind and fileKey.
 */
interface OtherDocumentJob {
  kind: string;
  userId: string;
  fileKey: string;
  purchaseOrderId?: string;
  projectId?: string;
}

type DocumentJobData = EntryDocumentJob | CountSheetJob | OtherDocumentJob;

const JOB_OPTS = { attempts: 2, removeOnComplete: { age: 24 * 3600 }, removeOnFail: { age: 24 * 3600 } };

/** Queues a PDF for an entry the caller can see. Rendering happens in the worker. */
export async function enqueueDocument(actor: InventoryActor, entryId: string, kind?: DocumentKind) {
  const e = await inventory().entries.get(actor, entryId);
  if (e.status === "DRAFT") throw new BusinessRuleError("Save and submit the entry before printing it.", "DRAFT_NOT_PRINTABLE");
  const k = kind ?? defaultDocumentKind(e.type);
  if (!allowedKinds(e.type).includes(k)) throw new BusinessRuleError(`A ${DOCUMENT_TITLES[k]} can't be printed for this entry type.`, "DOCUMENT_KIND");
  const jobId = randomUUID();
  const data: EntryDocumentJob = { entryId, kind: k, userId: actor.actorId, userName: actor.name, showCost: actor.canSeeCost, fileKey: `documents/${jobId}.pdf` };
  await getQueue(QUEUES.documents).add("render", data, { jobId, ...JOB_OPTS });
  return { jobId, kind: k, status: "queued" as const };
}

/** Queues a printable count sheet (respects blind mode for the requester). */
export async function enqueueCountSheet(actor: InventoryActor, countId: string) {
  const counts = inventory().counts;
  const c = await counts.get(actor, countId);
  if (c.status === "CANCELLED") throw new BusinessRuleError("This count was cancelled.", "INVALID_STATUS");
  const jobId = randomUUID();
  const data: CountSheetJob = { countId, kind: "COUNT_SHEET", userId: actor.actorId, userName: actor.name, showSystem: counts.canSeeSystem(actor, c), fileKey: `documents/${jobId}.pdf` };
  await getQueue(QUEUES.documents).add("count-sheet", data, { jobId, ...JOB_OPTS });
  return { jobId, kind: "COUNT_SHEET" as const, status: "queued" as const };
}

export async function documentStatus(jobId: string, userId: string) {
  const job = await getQueue(QUEUES.documents).getJob(jobId);
  const data = job?.data as DocumentJobData | undefined;
  if (!job || data?.userId !== userId) throw new NotFoundError("Document");
  const state = await job.getState();
  const status = state === "completed" ? "completed" : state === "failed" ? "failed" : state === "active" ? "processing" : "queued";
  const r = (job.returnvalue ?? null) as { fileName: string } | null;
  return {
    jobId,
    kind: data.kind,
    ...("entryId" in data ? { entryId: data.entryId } : "countId" in data ? { countId: data.countId } : "projectId" in data ? { projectId: data.projectId ?? null } : { purchaseOrderId: data.purchaseOrderId ?? null }),
    status,
    fileName: r?.fileName ?? null,
    downloadUrl: status === "completed" ? `/api/v1/documents/${jobId}?download=1` : null,
    failedReason: status === "failed" ? (job.failedReason ?? "Rendering failed.") : null,
  };
}

export async function documentFile(jobId: string, userId: string) {
  const s = await documentStatus(jobId, userId);
  if (s.status !== "completed") throw new BusinessRuleError("The document isn't ready yet.", "DOCUMENT_NOT_READY");
  const job = (await getQueue(QUEUES.documents).getJob(jobId))!;
  const obj = await inventory().files.get((job.data as DocumentJobData).fileKey);
  if (!obj) throw new NotFoundError("Document file");
  return { body: obj.body, fileName: s.fileName ?? `${jobId}.pdf` };
}

/** BullMQ processor (worker only): HTML template → headless Chromium → PDF → private storage. */
export async function processDocumentJob(job: Job, log: Logger) {
  const data = job.data as EntryDocumentJob | CountSheetJob;
  const meta = { companyName: process.env.COMPANY_NAME ?? APP_NAME, printedBy: data.userName, printedAt: formatDateTime(new Date()) };
  let html: string;
  let fileName: string;
  if ("countId" in data) {
    const c = await inventory().uow.store.counts.get(data.countId);
    if (!c) throw new Error("Count no longer exists.");
    html = renderCountSheetHtml(c, { ...meta, showSystem: data.showSystem });
    fileName = `${c.number}-count-sheet.pdf`;
  } else {
    const e = await inventory().uow.store.entry(data.entryId);
    if (!e) throw new Error("Entry no longer exists.");
    html = renderDocumentHtml(e, data.kind, { ...meta, showCost: data.showCost });
    fileName = `${(e.number ?? e.draftRef).replace(/[^\w-]/g, "_")}-${data.kind.toLowerCase().replace(/_/g, "-")}.pdf`;
  }
  const { htmlToPdf } = await import("../infrastructure/pdf");
  const pdf = await htmlToPdf(html);
  await inventory().files.put(data.fileKey, pdf, "application/pdf");
  log.info({ jobId: job.id, kind: data.kind, bytes: pdf.byteLength }, "document rendered");
  return { fileName, bytes: pdf.byteLength };
}
