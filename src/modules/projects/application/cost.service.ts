import { NotFoundError } from "@/shared/errors/app-error";
import { hasLevel } from "@/shared/rbac/levels";
import { todayInDhaka } from "@/modules/inventory/domain/numbering";
import { ProjectErrors } from "../domain/errors";
import { overheadWarnings } from "../domain/rules";
import { isOverhead, type CostCategory } from "../domain/types";
import type { ProjectCostingService } from "./costing.service";
import type { AddCostInput, UpdateCostInput } from "./dto";
import { noAlertQueue, type AuditRow, type CostAlertQueue, type CostRecord, type CostWrite, type ProjectRecord, type ProjectsActor, type ProjectsUnitOfWork } from "./ports";
import type { ProjectService } from "./project.service";

export type CostWarning = { code: string; message: string };

/** overheads ≥ CREATE and seeCost: may add, edit and void overhead lines. */
export const canEditOverheads = (a: ProjectsActor) => hasLevel(a.overheadsLevel, "CREATE") && a.canSeeCost;

const monthStart = (s: string) => `${s.slice(0, 7)}-01`;
function monthEnd(s: string) {
  const [y, m] = s.slice(0, 7).split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** What the audit log keeps for a cost line. */
const snapshot = (costId: string, c: CostWrite) => ({
  costId,
  category: c.category,
  description: c.description,
  amount: c.amount,
  date: c.date,
  vendorOrPayee: c.vendorOrPayee,
  referenceNo: c.referenceNo,
  periodFrom: c.periodFrom,
  periodTo: c.periodTo,
  basisNote: c.basisNote,
});

/**
 * Project costs. Labour, transport and other: projects ≥ CREATE to add, FULL to void, never
 * edited, closed projects read-only (unchanged). Overheads (store charge, holding, established
 * cost): overheads ≥ CREATE + seeCost to add, edit and void, at any status — on CLOSED projects
 * with a reason. Never deleted: voided with a reason, excluded from totals, kept for audit.
 */
export class CostService {
  constructor(private readonly d: { uow: ProjectsUnitOfWork; projects: ProjectService; costing?: ProjectCostingService; alerts?: CostAlertQueue }) {}

  /** Overhead lines are left out for viewers who can't see overheads. */
  async list(projectId: string, filters: { category?: CostCategory; includeVoided?: boolean }, viewer?: ProjectsActor): Promise<CostRecord[]> {
    await this.d.projects.get(projectId);
    const rows = await this.d.uow.store.costs(projectId, { category: filters.category, includeVoided: filters.includeVoided ?? false });
    return viewer && !viewer.canSeeOverheads ? rows.filter((c) => !isOverhead(c.category)) : rows;
  }

  /** An overhead line is "not found" for viewers who can't see overheads. */
  async get(projectId: string, costId: string, viewer?: ProjectsActor): Promise<CostRecord> {
    const c = await this.d.uow.store.cost(costId);
    if (!c || c.projectId !== projectId || (viewer && !viewer.canSeeOverheads && isOverhead(c.category))) throw new NotFoundError("Cost");
    return c;
  }

  /** The audit trail of one cost line (add, edits, void), oldest first. */
  async history(actor: ProjectsActor, projectId: string, costId: string): Promise<{ cost: CostRecord; rows: AuditRow[] }> {
    const cost = await this.get(projectId, costId, actor);
    return { cost, rows: await this.d.uow.store.costAudit(projectId, costId) };
  }

  private assertCan(actor: ProjectsActor, p: ProjectRecord, category: CostCategory, what: "Adding" | "Voiding", reason: string | null | undefined): void {
    if (isOverhead(category)) {
      if (!canEditOverheads(actor)) throw ProjectErrors.overheadForbidden();
      if (p.status === "CLOSED" && !reason) throw ProjectErrors.closedReasonRequired();
      return;
    }
    if (!hasLevel(actor.level, what === "Voiding" ? "FULL" : "CREATE")) throw ProjectErrors.directCostForbidden(what);
    if (p.status === "CLOSED") throw ProjectErrors.closed(p.code);
  }

  private write(input: { date?: string; category: CostCategory; description: string; amount: string; vendorOrPayee?: string | null; referenceNo?: string | null; periodFrom?: string | null; periodTo?: string | null; basisNote?: string | null }): CostWrite {
    const overhead = isOverhead(input.category);
    const from = overhead && input.periodFrom ? monthStart(input.periodFrom) : null;
    const to = overhead && input.periodTo ? monthEnd(input.periodTo) : null;
    if (from && to && to < from) throw ProjectErrors.periodOrder();
    return {
      date: input.date ?? todayInDhaka(),
      category: input.category,
      description: input.description,
      amount: input.amount,
      vendorOrPayee: input.vendorOrPayee ?? null,
      referenceNo: input.referenceNo ?? null,
      // Period and basis note are overhead fields only.
      periodFrom: from ?? (overhead && to ? monthStart(to) : null),
      periodTo: to ?? (overhead && from ? monthEnd(from) : null),
      basisNote: overhead ? (input.basisNote ?? null) : null,
    };
  }

  /** After commit (the figures include the change). */
  private async warnings(projectId: string, c: CostWrite): Promise<CostWarning[]> {
    if (!isOverhead(c.category) || !this.d.costing) return [];
    const p = await this.d.uow.store.project(projectId);
    return p ? overheadWarnings(c.amount, await this.d.costing.summary(p)) : [];
  }

  async add(actor: ProjectsActor, projectId: string, input: AddCostInput): Promise<CostRecord & { warnings: CostWarning[] }> {
    const { id, w } = await this.d.uow.transaction(async (store) => {
      const p = await store.lockProject(projectId);
      if (!p) throw new NotFoundError("Project");
      this.assertCan(actor, p, input.category, "Adding", input.reason);
      const w = this.write(input);
      const id = await store.addCost({ ...w, projectId, createdById: actor.actorId });
      const overhead = isOverhead(w.category);
      await store.audit.record(actor, {
        action: overhead ? "project.overhead_add" : "project.cost_add",
        entityType: "Project",
        entityId: projectId,
        after: overhead ? { ...snapshot(id, w), ...(input.reason ? { reason: input.reason } : {}) } : { costId: id, category: w.category, description: w.description, amount: w.amount, date: w.date },
      });
      return { id, w };
    });
    await (this.d.alerts ?? noAlertQueue).enqueue(projectId);
    return { ...(await this.d.uow.store.cost(id))!, warnings: await this.warnings(projectId, w) };
  }

  /** PATCH: overhead lines only; any status (a reason on CLOSED projects). Audit-logged with before / after. */
  async update(actor: ProjectsActor, projectId: string, costId: string, input: UpdateCostInput): Promise<CostRecord & { warnings: CostWarning[] }> {
    const w = await this.d.uow.transaction(async (store) => {
      const p = await store.lockProject(projectId);
      if (!p) throw new NotFoundError("Project");
      const c = await store.lockCost(costId);
      if (!c || c.projectId !== projectId || (!actor.canSeeOverheads && isOverhead(c.category))) throw new NotFoundError("Cost");
      if (!isOverhead(c.category)) throw ProjectErrors.notEditable();
      if (!canEditOverheads(actor)) throw ProjectErrors.overheadForbidden();
      if (c.voidedAt) throw ProjectErrors.costAlreadyVoided();
      if (input.category && !isOverhead(input.category)) throw ProjectErrors.overheadCategoryChange();
      if (p.status === "CLOSED" && !input.reason) throw ProjectErrors.closedReasonRequired();
      const pick = <K extends keyof UpdateCostInput>(k: K, fallback: unknown) => (input[k] !== undefined ? input[k] : fallback);
      const w = this.write({
        date: pick("date", c.date) as string,
        category: pick("category", c.category) as CostCategory,
        description: pick("description", c.description) as string,
        amount: pick("amount", c.amount) as string,
        vendorOrPayee: pick("vendorOrPayee", c.vendorOrPayee) as string | null,
        referenceNo: pick("referenceNo", c.referenceNo) as string | null,
        periodFrom: pick("periodFrom", c.periodFrom) as string | null,
        periodTo: pick("periodTo", c.periodTo) as string | null,
        basisNote: pick("basisNote", c.basisNote) as string | null,
      });
      await store.updateCost(costId, { ...w, updatedById: actor.actorId });
      await store.audit.record(actor, {
        action: "project.overhead_edit",
        entityType: "Project",
        entityId: projectId,
        before: snapshot(costId, c),
        after: { ...snapshot(costId, w), ...(input.reason ? { reason: input.reason } : {}) },
      });
      return w;
    });
    await (this.d.alerts ?? noAlertQueue).enqueue(projectId);
    return { ...(await this.d.uow.store.cost(costId))!, warnings: await this.warnings(projectId, w) };
  }

  /**
   * Direct costs: projects FULL, not on closed projects (unchanged). Overheads: overheads ≥ CREATE,
   * any status. Always with a reason.
   */
  async void(actor: ProjectsActor, projectId: string, costId: string, reason: string): Promise<CostRecord> {
    await this.d.uow.transaction(async (store) => {
      const p = await store.lockProject(projectId);
      if (!p) throw new NotFoundError("Project");
      const c = await store.lockCost(costId);
      if (!c || c.projectId !== projectId || (!actor.canSeeOverheads && isOverhead(c.category))) throw new NotFoundError("Cost");
      this.assertCan(actor, p, c.category, "Voiding", reason);
      if (c.voidedAt) throw ProjectErrors.costAlreadyVoided();
      await store.voidCost(costId, { voidedById: actor.actorId, voidReason: reason });
      const overhead = isOverhead(c.category);
      await store.audit.record(actor, {
        action: overhead ? "project.overhead_void" : "project.cost_void",
        entityType: "Project",
        entityId: projectId,
        before: overhead ? snapshot(costId, c) : { costId, category: c.category, description: c.description, amount: c.amount },
        after: { costId, voided: true, reason },
      });
    });
    await (this.d.alerts ?? noAlertQueue).enqueue(projectId); // may re-arm an alert
    return (await this.d.uow.store.cost(costId))!;
  }
}
