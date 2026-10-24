import { randomUUID } from "node:crypto";
import type { Job } from "bullmq";
import { APP_NAME } from "@/shared/config/constants";
import type { Logger } from "@/shared/logger/logger";
import { getQueue, QUEUES } from "@/shared/queue/queue";
import { storage } from "@/shared/storage/storage";
import { formatDateTime } from "@/shared/time/format";
import type { CostStatementQueue } from "../application/ports";
import { renderCostStatementHtml } from "../infrastructure/cost-statement-template";

/** Job on the shared `documents` queue (inventory's status / download endpoint serves it). */
export interface CostStatementJob {
  kind: "PROJECT_COST_STATEMENT";
  projectId: string;
  userId: string;
  userName: string;
  showMargin: boolean;
  fileKey: string;
}

export const COST_STATEMENT_JOB = "project-cost-statement";

export const costStatementQueue: CostStatementQueue = {
  async enqueue(job) {
    const jobId = randomUUID();
    const data: CostStatementJob = { kind: "PROJECT_COST_STATEMENT", ...job, fileKey: `documents/${jobId}.pdf` };
    await getQueue(QUEUES.documents).add(COST_STATEMENT_JOB, data, { jobId, attempts: 2, removeOnComplete: { age: 24 * 3600 }, removeOnFail: { age: 24 * 3600 } });
    return { jobId };
  },
};

/** The statement's HTML (also used by tests to check what a role sees). */
export async function costStatementHtml(data: Pick<CostStatementJob, "projectId" | "userName" | "showMargin">) {
  const { projects } = await import("./container");
  const p = await projects().projects.get(data.projectId);
  const [summary, material, costs] = await Promise.all([projects().costing.summary(p), projects().costing.material(p.id), projects().uow.store.costs(p.id, { includeVoided: false })]);
  return {
    project: p,
    html: renderCostStatementHtml(p, { summary, material, costs }, { showMargin: data.showMargin, companyName: process.env.COMPANY_NAME ?? APP_NAME, companyAddress: process.env.COMPANY_ADDRESS ?? null, printedBy: data.userName, printedAt: formatDateTime(new Date()) }),
  };
}

/** Worker: project → HTML → PDF → private storage. */
export async function processCostStatementJob(job: Job, log: Logger) {
  const data = job.data as CostStatementJob;
  const { project, html } = await costStatementHtml(data);
  const { htmlToPdf } = await import("@/modules/inventory/infrastructure/pdf");
  const pdf = await htmlToPdf(html);
  await storage().put(data.fileKey, pdf, "application/pdf");
  const fileName = `${project.code}-cost-statement.pdf`;
  log.info({ jobId: job.id, projectId: project.id, bytes: pdf.byteLength }, "cost statement rendered");
  return { fileName, bytes: pdf.byteLength };
}
