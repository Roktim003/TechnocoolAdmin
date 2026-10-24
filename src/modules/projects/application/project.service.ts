import { ForbiddenError, NotFoundError } from "@/shared/errors/app-error";
import { hasLevel } from "@/shared/rbac/levels";
import { todayInDhaka } from "@/modules/inventory/domain/numbering";
import type { ProjectSummary } from "../domain/rules";
import { ProjectErrors } from "../domain/errors";
import { formatProjectCode, ISSUE_STATUSES, RETURN_STATUSES, START_STATUSES, transition, TRANSITIONS, type ProjectStatus, type Transition } from "../domain/types";
import type { ProjectCostingService } from "./costing.service";
import type { CreateProjectInput, UpdateProjectInput } from "./dto";
import { noAlertQueue, noNotifier, type CostAlertQueue, type InventoryProjectQuery, type ProjectListFilters, type ProjectRecord, type ProjectsActor, type ProjectsNotifier, type ProjectsUnitOfWork, type ProjectWrite } from "./ports";

const nul = <T>(v: T | undefined | null): T | null => (v === undefined ? null : v);

/** Audit snapshot. contractValue is kept (audit readers need it); the API strips it without seeMargin. */
export const projectSnapshot = (p: ProjectRecord) => ({
  code: p.code,
  name: p.name,
  clientName: p.clientName,
  status: p.status,
  projectType: p.projectType,
  defaultWarehouse: p.defaultWarehouse?.code ?? null,
  startDate: p.startDate,
  expectedEndDate: p.expectedEndDate,
  siteEngineer: p.siteEngineer?.name ?? p.siteEngineerName,
  isActive: p.isActive,
});

const canSetContract = (a: ProjectsActor) => hasLevel(a.level, "FULL") && a.canSeeMargin;

export class ProjectService {
  constructor(
    private readonly d: {
      uow: ProjectsUnitOfWork;
      costing: ProjectCostingService;
      stock: InventoryProjectQuery;
      notifier?: ProjectsNotifier;
      alerts?: CostAlertQueue;
    },
  ) {}

  private get store() {
    return this.d.uow.store;
  }

  /* ───────────────────────────── reads ───────────────────────────── */

  /**
   * Projects with their summary totals. Projects are company-wide (not warehouse-scoped).
   * Totals are computed per project, so sorting by totalCost happens after calculation.
   */
  async list(q: { filters: ProjectListFilters; q?: string; sort: { field: string; direction: "asc" | "desc" }[]; skip: number; take: number }) {
    const byTotal = q.sort.find((s) => s.field === "totalCost");
    const all = await this.store.listProjects(q.filters, q.q, q.sort.filter((s) => s.field !== "totalCost"));
    const { status: _s, ...rest } = q.filters;
    const counts = await this.store.statusCounts(rest, q.q);
    if (byTotal) {
      const sums = await this.d.costing.summaries(all);
      all.sort((a, b) => (byTotal.direction === "asc" ? 1 : -1) * (Number(sums.get(a.id)!.totalCost) - Number(sums.get(b.id)!.totalCost)) || a.code.localeCompare(b.code));
      const page = all.slice(q.skip, q.skip + q.take);
      return { items: page.map((p) => ({ project: p, summary: sums.get(p.id)! })), total: all.length, statusCounts: counts };
    }
    const page = all.slice(q.skip, q.skip + q.take);
    const sums = await this.d.costing.summaries(page);
    return { items: page.map((p) => ({ project: p, summary: sums.get(p.id)! })), total: all.length, statusCounts: counts };
  }

  async get(id: string): Promise<ProjectRecord> {
    const p = await this.store.project(id);
    if (!p) throw new NotFoundError("Project");
    return p;
  }

  async detail(actor: ProjectsActor, id: string): Promise<{ project: ProjectRecord; summary: ProjectSummary; transitions: Transition[] }> {
    const project = await this.get(id);
    return { project, summary: await this.d.costing.summary(project), transitions: this.allowedTransitions(actor, project.status) };
  }

  /** The status changes this actor may make from `status`. */
  allowedTransitions(actor: ProjectsActor, status: ProjectStatus): Transition[] {
    return TRANSITIONS.filter((t) => t.from === status && this.mayTransition(actor, t));
  }

  private mayTransition(actor: ProjectsActor, t: Transition) {
    return t.level === "ADMIN" ? actor.isAdmin : hasLevel(actor.level, t.level);
  }

  history(id: string) {
    return this.store.history(id);
  }

  /**
   * For the stock entry form: active projects the entry type may use (issues: planning or
   * running; returns: anything but closed). Only id, code, name, status and warehouse.
   */
  options(type: "ISSUE_TO_PROJECT" | "RETURN_FROM_SITE" | undefined, q?: string) {
    return type === "ISSUE_TO_PROJECT" ? this.store.options(ISSUE_STATUSES, true, q) : this.store.options(RETURN_STATUSES, type === undefined, q);
  }

  /** The code the next project will get (shown read-only on the form; assigned on save). */
  async nextCode() {
    return formatProjectCode(await this.store.peekNumber("PROJECT", "ALL"));
  }

  /** People who can be picked as site engineer (id and name only). */
  siteEngineers() {
    return this.store.activeUsers();
  }

  async activity(id: string) {
    await this.get(id);
    const [history, audit] = await Promise.all([this.store.history(id), this.store.auditRows(id, 200)]);
    return { history, audit };
  }

  /* ───────────────────────────── create / edit ───────────────────────────── */

  private async checkRefs(input: Partial<ProjectWrite>) {
    if (input.defaultWarehouseId) {
      const w = await this.store.warehouse(input.defaultWarehouseId);
      if (!w || !w.isActive) throw ProjectErrors.unknownWarehouse();
    }
    if (input.siteEngineerUserId) {
      const u = await this.store.user(input.siteEngineerUserId);
      if (!u || u.status !== "ACTIVE") throw ProjectErrors.unknownUser();
    }
  }

  async create(actor: ProjectsActor, input: CreateProjectInput): Promise<ProjectRecord> {
    if (!START_STATUSES.includes(input.status)) throw ProjectErrors.badStartStatus();
    if (input.contractValue !== undefined && input.contractValue !== null && !canSetContract(actor)) throw ProjectErrors.contractValueForbidden();
    if (input.startDate && input.expectedEndDate && input.expectedEndDate < input.startDate) throw ProjectErrors.datesOrder();
    const write: ProjectWrite = {
      name: input.name,
      clientName: input.clientName,
      clientContactPerson: nul(input.clientContactPerson),
      clientPhone: nul(input.clientPhone),
      clientEmail: nul(input.clientEmail),
      siteAddress: nul(input.siteAddress),
      projectType: input.projectType ?? "OTHER",
      defaultWarehouseId: nul(input.defaultWarehouseId),
      startDate: nul(input.startDate),
      expectedEndDate: nul(input.expectedEndDate),
      siteEngineerUserId: nul(input.siteEngineerUserId),
      // A linked user replaces the free-text name.
      siteEngineerName: input.siteEngineerUserId ? null : nul(input.siteEngineerName),
      contractValue: nul(input.contractValue),
      notes: nul(input.notes),
    };
    await this.checkRefs(write);
    const id = await this.d.uow.transaction(async (store) => {
      const code = formatProjectCode(await store.nextNumber("PROJECT", "ALL"));
      const id = await store.createProject({ ...write, code, status: input.status, createdById: actor.actorId });
      await store.addHistory({ projectId: id, fromStatus: null, toStatus: input.status, changedById: actor.actorId, reason: null });
      const p = (await store.project(id))!;
      await store.audit.record(actor, { action: "project.create", entityType: "Project", entityId: id, after: { ...projectSnapshot(p), contractValue: p.contractValue } });
      return id;
    });
    return this.get(id);
  }

  /** Details (projects CREATE). The contract value only with FULL + seeMargin; closed projects are read-only. */
  async update(actor: ProjectsActor, id: string, input: UpdateProjectInput): Promise<ProjectRecord> {
    const touchesContract = input.contractValue !== undefined;
    if (touchesContract && !canSetContract(actor)) throw ProjectErrors.contractValueForbidden();
    if (input.isActive !== undefined && !hasLevel(actor.level, "FULL")) throw new ForbiddenError("Deactivating a project needs projects FULL access.");
    const data: Parameters<typeof this.store.updateProject>[1] = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    if (input.siteEngineerUserId) data.siteEngineerName = null;
    await this.checkRefs(data);
    await this.d.uow.transaction(async (store) => {
      const before = await store.lockProject(id);
      if (!before) throw new NotFoundError("Project");
      if (before.status === "CLOSED") throw ProjectErrors.closed(before.code);
      const start = data.startDate !== undefined ? data.startDate : before.startDate;
      const end = data.expectedEndDate !== undefined ? data.expectedEndDate : before.expectedEndDate;
      if (start && end && end < start) throw ProjectErrors.datesOrder();
      await store.updateProject(id, data);
      const after = (await store.project(id))!;
      const { contractValue: _c, ...details } = input;
      if (Object.keys(details).length) {
        await store.audit.record(actor, { action: input.isActive === false ? "project.deactivate" : "project.update", entityType: "Project", entityId: id, before: projectSnapshot(before), after: projectSnapshot(after) });
      }
      if (touchesContract && before.contractValue !== after.contractValue) {
        await store.audit.record(actor, { action: "project.contract_value", entityType: "Project", entityId: id, before: { contractValue: before.contractValue }, after: { contractValue: after.contractValue } });
      }
    });
    if (touchesContract) await (this.d.alerts ?? noAlertQueue).enqueue(id);
    return this.get(id);
  }

  /* ───────────────────────────── status ───────────────────────────── */

  async changeStatus(actor: ProjectsActor, id: string, toStatus: ProjectStatus, reason: string | undefined): Promise<ProjectRecord> {
    let from: ProjectStatus = "PLANNING";
    await this.d.uow.transaction(async (store) => {
      const p = await store.lockProject(id);
      if (!p) throw new NotFoundError("Project");
      from = p.status;
      const t = transition(p.status, toStatus);
      if (!t) throw ProjectErrors.invalidTransition(p.status, toStatus);
      if (!this.mayTransition(actor, t)) throw ProjectErrors.transitionNotAllowed(t.level);
      if (t.reason && !reason) throw ProjectErrors.reasonRequired();
      if (toStatus === "CLOSED") {
        const open = await this.d.stock.openEntries(id);
        if (open.length) throw ProjectErrors.openEntries(open.map((e) => e.number ?? e.draftRef));
      }
      const data: Parameters<typeof store.updateProject>[1] = { status: toStatus };
      if (toStatus === "COMPLETED" && p.status === "RUNNING") data.actualEndDate = todayInDhaka();
      if (toStatus === "RUNNING" && p.status === "COMPLETED") data.actualEndDate = null; // reopened
      if (toStatus === "CLOSED") Object.assign(data, { closedAt: new Date(), closedById: actor.actorId, closeReason: reason ?? null });
      if (p.status === "CLOSED") Object.assign(data, { closedAt: null, closedById: null, closeReason: null });
      await store.updateProject(id, data);
      await store.addHistory({ projectId: id, fromStatus: p.status, toStatus, changedById: actor.actorId, reason: reason ?? null });
      await store.audit.record(actor, { action: "project.status", entityType: "Project", entityId: id, before: { status: p.status }, after: { status: toStatus, reason: reason ?? null } });
    });
    const after = await this.get(id);
    await (this.d.notifier ?? noNotifier).statusChanged(after, from, toStatus, { actorId: actor.actorId, actorName: actor.name, reason: reason ?? null });
    return after;
  }
}
