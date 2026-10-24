import type { Job } from "bullmq";
import { logger, type Logger } from "@/shared/logger/logger";
import { getQueue, QUEUES } from "@/shared/queue/queue";
import { notifications } from "@/modules/notifications/interface/container";
import type { PublishInput } from "@/modules/notifications/application/notification.service";
import type { ProjectStockListener } from "@/modules/inventory/application/ports";
import type { CostAlertQueue, ProjectsNotifier } from "../application/ports";
import { PROJECT_STATUS_LABEL } from "../domain/types";

const log = logger.child({ component: "projects-events" });

async function publish(input: PublishInput) {
  try {
    await notifications().service.publish(input);
  } catch (err) {
    log.error({ err, type: input.type }, "notification failed");
  }
}

const money = (v: string) => `৳ ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v))}`;

/** Project notifications (notifications module). Errors are logged, never thrown. */
export const projectsNotifier: ProjectsNotifier = {
  /** The site engineer (when linked to a user, and not the person making the change). */
  async statusChanged(p, from, to, { actorId, actorName, reason }) {
    if (!p.siteEngineer || p.siteEngineer.id === actorId) return;
    await publish({
      type: "PROJECT_STATUS_CHANGED",
      userIds: [p.siteEngineer.id],
      title: `${p.code} is now ${PROJECT_STATUS_LABEL[to].toLowerCase()}`,
      body: `${actorName} changed ${p.name} from ${PROJECT_STATUS_LABEL[from].toLowerCase()} to ${PROJECT_STATUS_LABEL[to].toLowerCase()}${reason ? `: “${reason}”` : "."}`,
      link: `/projects/${p.id}`,
    });
  },

  /** Users who may see margins (and open projects). */
  async costAlert(p, threshold, s) {
    try {
      const userIds = await notifications().recipients.withFlag("seeMargin", { module: "projects", level: "VIEW" });
      await publish({
        type: "PROJECT_COST_ALERT",
        userIds,
        title: threshold >= 100 ? `${p.code} has used its whole contract value` : `${p.code} has used ${threshold}% of its contract value`,
        body: `${p.name}: total cost ${money(s.totalCost)} is ${s.costUsedPercent}% of the contract value ${money(s.contractValue)}.`,
        link: `/projects/${p.id}`,
      });
    } catch (err) {
      log.error({ err, projectId: p.id }, "cost alert failed");
    }
  },
};

export const COST_ALERT_JOB = "cost-alert-check";

export const costAlertQueue: CostAlertQueue = {
  async enqueue(projectId) {
    try {
      await getQueue(QUEUES.projects).add(COST_ALERT_JOB, { projectId }, { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000, removeOnFail: 1000 });
    } catch (err) {
      log.error({ err, projectId }, "could not queue the cost-alert check");
    }
  },
};

/** Registered with inventory at startup: posted / reversed issues and returns re-check the project's cost alert. */
export const projectStockListener: ProjectStockListener = {
  async materialChanged(projectId) {
    await costAlertQueue.enqueue(projectId);
  },
};

/** Worker: the "projects" queue. */
export async function processProjectsJob(job: Job, jobLog: Logger) {
  const { projects } = await import("./container");
  if (job.name === COST_ALERT_JOB) {
    const r = await projects().alerts.check((job.data as { projectId: string }).projectId);
    if (r.alerted) jobLog.info({ jobId: job.id, projectId: job.data.projectId, ...r }, "project cost alert sent");
    return r;
  }
  throw new Error(`Unknown projects job ${job.name}`);
}
