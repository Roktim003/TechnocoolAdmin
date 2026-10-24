import { randomUUID } from "node:crypto";
import type { Job } from "bullmq";
import { NotFoundError, ValidationError } from "@/shared/errors/app-error";
import type { Logger } from "@/shared/logger/logger";
import { getQueue, QUEUES } from "@/shared/queue/queue";
import type { ImportJobDto, ImportMode, ImportResult } from "../application/dto";
import type { ImportJobData } from "../application/import.service";
import type { CatalogActor } from "../application/ports";
import { MAX_IMPORT_BYTES } from "../application/import-columns";
import { catalog } from "./container";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Stores the upload privately and queues the import. The worker deletes the file when done. */
export async function enqueueImport(actor: CatalogActor, file: { name: string; bytes: Uint8Array }, mode: ImportMode): Promise<string> {
  if (file.bytes.byteLength === 0) throw new ValidationError("The file is empty.", [{ path: "file", message: "The file is empty." }]);
  if (file.bytes.byteLength > MAX_IMPORT_BYTES) throw new ValidationError("The file is larger than 10 MB.", [{ path: "file", message: "Import files must be 10 MB or smaller.", code: "FILE_TOO_LARGE" }]);
  // .xlsx files are ZIP archives ("PK\x03\x04").
  const b = file.bytes;
  if (!(b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04)) {
    throw new ValidationError("Upload an Excel .xlsx file.", [{ path: "file", message: "Only .xlsx files made from the template are accepted.", code: "INVALID_FILE_TYPE" }]);
  }

  const jobId = randomUUID();
  const fileKey = `imports/${jobId}.xlsx`;
  await catalog().files.put(fileKey, file.bytes, XLSX_TYPE);
  const data: ImportJobData = { fileKey, fileName: file.name.slice(0, 200) || "import.xlsx", mode, actor };
  await getQueue(QUEUES.catalogImport).add("import-products", data, {
    jobId,
    attempts: 1,
    removeOnComplete: { age: 24 * 3600 },
    removeOnFail: { age: 24 * 3600 },
  });
  return jobId;
}

/** Job status for its owner only (other users get 404). */
export async function importJobStatus(jobId: string, userId: string): Promise<ImportJobDto> {
  const job = await getQueue(QUEUES.catalogImport).getJob(jobId);
  const data = job?.data as ImportJobData | undefined;
  if (!job || data?.actor.actorId !== userId) throw new NotFoundError("Import job");

  const state = await job.getState();
  const status: ImportJobDto["status"] = state === "completed" ? "completed" : state === "failed" ? "failed" : state === "active" ? "processing" : "queued";
  const r = status === "completed" ? (job.returnvalue as ImportResult) : null;
  return {
    jobId,
    mode: data.mode,
    status,
    fileName: data.fileName,
    result: r ? { totalRows: r.totalRows, validRows: r.validRows, committed: r.committed, createdCount: r.createdCount, errors: r.errors } : null,
    failedReason: status === "failed" ? (job.failedReason ?? "Import failed.") : null,
  };
}

/** BullMQ processor (runs in the worker process). */
export async function processCatalogImportJob(job: Job, log: Logger): Promise<ImportResult> {
  const data = job.data as ImportJobData;
  const result = await catalog().imports.run(data);
  log.info({ jobId: job.id, mode: data.mode, rows: result.totalRows, errors: result.errors.length, created: result.createdCount }, "catalog import processed");
  return result;
}
