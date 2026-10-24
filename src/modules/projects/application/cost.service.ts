import { NotFoundError } from "@/shared/errors/app-error";
import { todayInDhaka } from "@/modules/inventory/domain/numbering";
import { ProjectErrors } from "../domain/errors";
import type { CostCategory } from "../domain/types";
import type { AddCostInput } from "./dto";
import { noAlertQueue, type CostAlertQueue, type CostRecord, type ProjectsActor, type ProjectsUnitOfWork } from "./ports";
import type { ProjectService } from "./project.service";

/** Labour, transport and other costs. Never deleted: voided with a reason, excluded from totals, kept for audit. */
export class CostService {
  constructor(private readonly d: { uow: ProjectsUnitOfWork; projects: ProjectService; alerts?: CostAlertQueue }) {}

  async list(projectId: string, filters: { category?: CostCategory; includeVoided?: boolean }): Promise<CostRecord[]> {
    await this.d.projects.get(projectId);
    return this.d.uow.store.costs(projectId, { category: filters.category, includeVoided: filters.includeVoided ?? false });
  }

  async get(projectId: string, costId: string): Promise<CostRecord> {
    const c = await this.d.uow.store.cost(costId);
    if (!c || c.projectId !== projectId) throw new NotFoundError("Cost");
    return c;
  }

  /** projects ≥ CREATE (route); not on closed projects. Audit-logged against the project. */
  async add(actor: ProjectsActor, projectId: string, input: AddCostInput): Promise<CostRecord> {
    const id = await this.d.uow.transaction(async (store) => {
      const p = await store.lockProject(projectId);
      if (!p) throw new NotFoundError("Project");
      if (p.status === "CLOSED") throw ProjectErrors.closed(p.code);
      const id = await store.addCost({
        projectId,
        date: input.date ?? todayInDhaka(),
        category: input.category,
        description: input.description,
        amount: input.amount,
        vendorOrPayee: input.vendorOrPayee ?? null,
        referenceNo: input.referenceNo ?? null,
        createdById: actor.actorId,
      });
      await store.audit.record(actor, { action: "project.cost_add", entityType: "Project", entityId: projectId, after: { costId: id, category: input.category, description: input.description, amount: input.amount, date: input.date ?? todayInDhaka() } });
      return id;
    });
    await (this.d.alerts ?? noAlertQueue).enqueue(projectId);
    return (await this.d.uow.store.cost(id))!;
  }

  /** projects FULL (route) + a reason. Closed projects are read-only. */
  async void(actor: ProjectsActor, projectId: string, costId: string, reason: string): Promise<CostRecord> {
    await this.d.uow.transaction(async (store) => {
      const p = await store.lockProject(projectId);
      if (!p) throw new NotFoundError("Project");
      if (p.status === "CLOSED") throw ProjectErrors.closed(p.code);
      const c = await store.lockCost(costId);
      if (!c || c.projectId !== projectId) throw new NotFoundError("Cost");
      if (c.voidedAt) throw ProjectErrors.costAlreadyVoided();
      await store.voidCost(costId, { voidedById: actor.actorId, voidReason: reason });
      await store.audit.record(actor, { action: "project.cost_void", entityType: "Project", entityId: projectId, before: { costId, category: c.category, description: c.description, amount: c.amount }, after: { costId, voided: true, reason } });
    });
    await (this.d.alerts ?? noAlertQueue).enqueue(projectId); // may re-arm an alert
    return (await this.d.uow.store.cost(costId))!;
  }
}
