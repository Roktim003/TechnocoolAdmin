import { alertLevel, type ProjectSummary } from "../domain/rules";
import type { ProjectCostingService } from "./costing.service";
import { noNotifier, type ProjectRecord, type ProjectsNotifier, type ProjectsUnitOfWork } from "./ports";

/**
 * Cost-used alerts (queue job "cost-alert-check", after costs, issues / returns and contract
 * changes). Each threshold (90 %, 100 % of the contract value) alerts once: the project keeps
 * the highest level already alerted, re-armed when the cost falls back below it. A jump past
 * both thresholds at once sends the 100 % alert only.
 *
 * Two bases, tracked separately: recipients who can see overheads are alerted on the full cost
 * (direct + overheads, `fullCostAlertLevel`), everyone else on the direct cost (`costAlertLevel`).
 */
export class CostAlertService {
  constructor(private readonly d: { uow: ProjectsUnitOfWork; costing: ProjectCostingService; notifier?: ProjectsNotifier }) {}

  async check(projectId: string): Promise<{ level: number; alerted: 90 | 100 | null }> {
    type Fire = { basis: "direct" | "full"; level: 90 | 100 };
    const r = await this.d.uow.transaction(async (store): Promise<{ level: number; project: ProjectRecord | null; summary: ProjectSummary | null; fire: Fire[] }> => {
      const p = await store.lockProject(projectId);
      if (!p) return { level: 0, project: null, summary: null, fire: [] };
      const summary = await this.d.costing.summary(p);
      const direct = alertLevel(summary.directCostUsedPercent);
      const full = alertLevel(summary.costUsedPercent);
      if (direct === p.costAlertLevel && full === p.fullCostAlertLevel) return { level: full, project: p, summary, fire: [] };
      await store.updateProject(projectId, { costAlertLevel: direct, fullCostAlertLevel: full });
      const fire: Fire[] = [];
      if (direct > p.costAlertLevel && direct > 0) fire.push({ basis: "direct", level: direct as 90 | 100 });
      if (full > p.fullCostAlertLevel && full > 0) fire.push({ basis: "full", level: full as 90 | 100 });
      return { level: full, project: p, summary, fire };
    });
    const s = r.summary;
    for (const f of r.fire) {
      await (this.d.notifier ?? noNotifier).costAlert(
        r.project!,
        f.level,
        f.basis === "full"
          ? { totalCost: s!.fullCost, contractValue: s!.contractValue!, costUsedPercent: s!.costUsedPercent! }
          : { totalCost: s!.directCost, contractValue: s!.contractValue!, costUsedPercent: s!.directCostUsedPercent! },
        f.basis,
      );
    }
    const alerted = r.fire.length ? (Math.max(...r.fire.map((f) => f.level)) as 90 | 100) : null;
    return { level: r.level, alerted };
  }
}
