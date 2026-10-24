import { randomUUID } from "node:crypto";
import type { ActorContext } from "@/modules/audit/application/audit.service";
import { ReportErrors } from "../domain/errors";
import { dhakaDate } from "../domain/schedule";
import type { ReportViewer } from "../domain/types";
import type { AuditSink, ExportFormat, ExportJobData, ExportQueue, FileStore, LinkSigner, ReportFileWriter } from "./ports";
import type { PreparedReport, ReportService } from "./report.service";

/** Exports stream at most this many rows (Excel); PDFs stop earlier (a 100k-row PDF is unreadable). */
export const MAX_EXPORT_ROWS = 100_000;
export const MAX_PDF_ROWS = 5_000;
export const LINK_TTL_MS = 3600_000;

export interface BuiltFile {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
  rows: number;
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

/** Builds report files (exports and scheduled emails share this). */
export class ReportFiles {
  constructor(private readonly d: { reports: ReportService; writer: ReportFileWriter; companyName: () => string }) {}

  async build(p: PreparedReport, format: ExportFormat, generatedBy: string): Promise<BuiltFile> {
    const first = await p.def.run(p.params, { page: 1, pageSize: 1, offset: 0, sort: p.sort, summary: true }, p.ctx);
    if (first.total > MAX_EXPORT_ROWS) throw ReportErrors.tooManyRows(MAX_EXPORT_ROWS, first.total);
    const summary = this.d.reports.shape(p, first);
    const limit = format === "pdf" ? Math.min(first.total, MAX_PDF_ROWS) : first.total;
    const input = {
      meta: p.def.meta,
      columns: p.columns,
      totalDefs: p.totalDefs,
      totals: summary.totals,
      chart: summary.chart,
      filters: await this.d.reports.filters(p),
      generatedAt: p.ctx.now,
      generatedBy,
      companyName: this.d.companyName(),
      rows: () => this.d.reports.allRows(p, limit),
      truncatedAt: format === "pdf" && first.total > MAX_PDF_ROWS ? MAX_PDF_ROWS : null,
    };
    const bytes = format === "xlsx" ? await this.d.writer.xlsx(input) : await this.d.writer.pdf(input);
    return { bytes, fileName: `${p.def.meta.id}-${dhakaDate(p.ctx.now)}.${format}`, contentType: CONTENT_TYPES[format], rows: first.total };
  }
}

export class ExportService {
  constructor(
    private readonly d: {
      reports: ReportService;
      files: ReportFiles;
      queue: ExportQueue;
      store: FileStore;
      signer: LinkSigner;
      audit: AuditSink;
      now?: () => Date;
    },
  ) {}

  /** Validates the filters now (a bad request fails here, not in the worker), audits and queues the job. */
  async request(viewer: ReportViewer, actor: ActorContext, reportId: string, format: ExportFormat, params: Record<string, unknown>, sort?: string) {
    const p = await this.d.reports.prepare(viewer, reportId, params, sort);
    const jobId = randomUUID();
    const data: ExportJobData = { kind: "REPORT_EXPORT", reportId, format, params: p.raw, ...(sort ? { sort } : {}), viewer, fileKey: `reports/exports/${jobId}.${format}`, requestedAt: new Date().toISOString() };
    await this.d.audit(actor, { action: "report.export", entityType: "Report", entityId: reportId, after: { format, params: p.raw, jobId, columns: p.columns.map((c) => c.key) } });
    await this.d.queue.enqueue(jobId, data);
    return { jobId, reportId, format, status: "queued" as const };
  }

  private downloadPath = (jobId: string) => `/api/v1/exports/${jobId}/download`;

  /** Status for the requester only; a finished job gets a signed link valid for 1 hour. */
  async status(viewer: ReportViewer, jobId: string) {
    const job = await this.d.queue.get(jobId);
    if (!job || job.data.viewer.userId !== viewer.userId) throw ReportErrors.exportNotFound();
    const expiresAt = new Date((this.d.now?.() ?? new Date()).getTime() + LINK_TTL_MS);
    const url = job.state === "completed" ? this.d.signer.sign(this.downloadPath(jobId), expiresAt) : null;
    return {
      jobId,
      reportId: job.data.reportId,
      format: job.data.format,
      status: job.state,
      fileName: job.result?.fileName ?? null,
      rows: job.result?.rows ?? null,
      downloadUrl: url,
      expiresAt: url ? expiresAt.toISOString() : null,
      failedReason: job.state === "failed" ? job.failedReason : null,
    };
  }

  /** Follows a signed link (no session): the signature and expiry are the authorisation. */
  async download(jobId: string, expires: string | null, signature: string | null) {
    if (!this.d.signer.verify(this.downloadPath(jobId), expires, signature)) throw ReportErrors.linkExpired();
    const job = await this.d.queue.get(jobId);
    if (!job) throw ReportErrors.exportNotFound();
    if (job.state !== "completed") throw ReportErrors.exportNotReady();
    const obj = await this.d.store.get(job.data.fileKey);
    if (!obj) throw ReportErrors.exportNotFound();
    return { body: obj.body, contentType: CONTENT_TYPES[job.data.format], fileName: job.result?.fileName ?? `${job.data.reportId}.${job.data.format}` };
  }

  /** Worker: runs the report as the requester was allowed to see it and stores the file. */
  async generate(data: ExportJobData) {
    const p = await this.d.reports.prepare(data.viewer, data.reportId, data.params, data.sort);
    const file = await this.d.files.build(p, data.format, data.viewer.name);
    await this.d.store.put(data.fileKey, file.bytes, file.contentType);
    return { fileName: file.fileName, bytes: file.bytes.byteLength, rows: file.rows };
  }
}
