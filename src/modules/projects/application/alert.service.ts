import { alertLevel, type ProjectSummary } from "../domain/rules";
import type { ProjectCostingService } from "./costing.service";
import { noNotifier, type ProjectRecord, type ProjectsNotifier, type ProjectsUnitOfWork } from "./ports";

/**
 * Cost-used alerts (queue job "cost-alert-check", after costs, issues / returns and contract
 * changes). Each threshold (90 %, 100 % of the contract value) alerts once: the project keeps
 * the highest level already alerted, re-armed when the cost falls back below it. A jump past
 * both thresholds at once sends the 100 % alert only.
 */
export class CostAlertService {
  constructor(private readonly d: { uow: ProjectsUnitOfWork; costing: ProjectCostingService; notifier?: ProjectsNotifier }) {}

  async check(projectId: string): Promise<{ level: number; alerted: 90 | 100 | null }> {
    const r = await this.d.uow.transaction(async (store): Promise<{ level: number; fire: { project: ProjectRecord; summary: ProjectSummary; level: 90 | 100 } | null }> => {
      const p = await store.lockProject(projectId);
      if (!p) return { level: 0, fire: null };
      const summary = await this.d.costing.summary(p);
      const level = alertLevel(summary.costUsedPercent);
      if (level === p.costAlertLevel) return { level, fire: null };
      await store.updateProject(projectId, { costAlertLevel: level });
      return { level, fire: level > p.costAlertLevel && level > 0 ? { project: p, summary, level: level as 90 | 100 } : null };
    });
    if (r.fire) {
      const { project, summary, level } = r.fire;
      await (this.d.notifier ?? noNotifier).costAlert(project, level, { totalCost: summary.totalCost, contractValue: summary.contractValue!, costUsedPercent: summary.costUsedPercent! });
    }
    return { level: r.level, alerted: r.fire?.level ?? null };
  }
}
