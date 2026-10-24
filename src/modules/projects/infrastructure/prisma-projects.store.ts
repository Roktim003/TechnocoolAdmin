import { Prisma, type PrismaClient } from "@prisma/client";
import { publishDataChange } from "@/shared/events/change-events";
import type { Db } from "@/shared/db/prisma";
import { toOrderBy } from "@/shared/pagination/list-query";
import { dateRangeWhere } from "@/shared/time/dates";
import { AuditService } from "@/modules/audit/application/audit.service";
import { prismaAuditRepository } from "@/modules/audit/infrastructure/prisma-audit.repository";
import type { CostRecord, ProjectListFilters, ProjectRecord, ProjectsStore, ProjectsUnitOfWork } from "../application/ports";
import { COST_CATEGORIES, PROJECT_STATUSES, type CostCategory, type ProjectStatus } from "../domain/types";

const ref = { select: { id: true, name: true } } as const;
const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (s: string | null | undefined) => (s === undefined ? undefined : s === null ? null : new Date(`${s}T00:00:00Z`));

const projectInclude = {
  defaultWarehouse: { select: { id: true, code: true, name: true } },
  siteEngineer: { select: { id: true, name: true, email: true } },
  closedBy: ref,
  createdBy: ref,
} satisfies Prisma.ProjectInclude;

type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

function toProject(p: ProjectRow): ProjectRecord {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    clientName: p.clientName,
    clientContactPerson: p.clientContactPerson,
    clientPhone: p.clientPhone,
    clientEmail: p.clientEmail,
    siteAddress: p.siteAddress,
    projectType: p.projectType,
    status: p.status,
    defaultWarehouse: p.defaultWarehouse,
    startDate: dateOnly(p.startDate),
    expectedEndDate: dateOnly(p.expectedEndDate),
    actualEndDate: dateOnly(p.actualEndDate),
    siteEngineer: p.siteEngineer,
    siteEngineerName: p.siteEngineerName,
    contractValue: p.contractValue ? p.contractValue.toFixed(2) : null,
    notes: p.notes,
    closedAt: p.closedAt,
    closedBy: p.closedBy,
    closeReason: p.closeReason,
    costAlertLevel: p.costAlertLevel,
    createdBy: p.createdBy,
    isActive: p.isActive,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

const costInclude = { createdBy: ref, voidedBy: ref } satisfies Prisma.ProjectCostInclude;
type CostRow = Prisma.ProjectCostGetPayload<{ include: typeof costInclude }>;

const toCost = (c: CostRow, attachmentCount = 0): CostRecord => ({
  id: c.id,
  projectId: c.projectId,
  date: dateOnly(c.date)!,
  category: c.category,
  description: c.description,
  amount: c.amount.toFixed(2),
  vendorOrPayee: c.vendorOrPayee,
  referenceNo: c.referenceNo,
  createdBy: c.createdBy,
  voidedAt: c.voidedAt,
  voidedBy: c.voidedBy,
  voidReason: c.voidReason,
  attachmentCount,
  createdAt: c.createdAt,
});

function listWhere(f: Omit<ProjectListFilters, "status"> & { status?: ProjectStatus }, q: string | undefined): Prisma.ProjectWhereInput {
  return {
    ...(f.status ? { status: f.status } : {}),
    ...(f.projectType ? { projectType: f.projectType } : {}),
    ...(f.siteEngineerUserId ? { siteEngineerUserId: f.siteEngineerUserId } : {}),
    ...(f.warehouseId ? { defaultWarehouseId: f.warehouseId } : {}),
    ...(f.active !== undefined ? { isActive: f.active } : {}),
    ...(f.dateFrom || f.dateTo ? { startDate: dateRangeWhere(f.dateFrom, f.dateTo) } : {}),
    ...(q ? { OR: (["code", "name", "clientName"] as const).map((k) => ({ [k]: { contains: q, mode: "insensitive" as const } })) } : {}),
  };
}

const writeData = (data: object) => {
  const out: Record<string, unknown> = { ...data };
  for (const k of ["startDate", "expectedEndDate", "actualEndDate"]) if (k in out) out[k] = toDate(out[k] as string | null);
  return out;
};

export function prismaProjectsStore(db: Db): ProjectsStore {
  const loadProject = async (id: string) => {
    const p = await db.project.findUnique({ where: { id }, include: projectInclude });
    return p ? toProject(p) : null;
  };

  const store: ProjectsStore = {
    audit: new AuditService(prismaAuditRepository(db)),

    async listProjects(filters, q, orderBy) {
      const rows = await db.project.findMany({ where: listWhere(filters, q), include: projectInclude, orderBy: [...(toOrderBy(orderBy) as Prisma.ProjectOrderByWithRelationInput[]), { code: "desc" }] });
      return rows.map(toProject);
    },
    async statusCounts(filters, q) {
      const groups = await db.project.groupBy({ by: ["status"], where: listWhere(filters, q), _count: { _all: true } });
      const out = Object.fromEntries(PROJECT_STATUSES.map((s) => [s, 0])) as Record<ProjectStatus, number>;
      for (const g of groups) out[g.status] = g._count._all;
      return out;
    },
    project: loadProject,
    async lockProject(id) {
      const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "Project" WHERE id = ${id}::uuid FOR UPDATE`;
      return rows.length ? loadProject(id) : null;
    },
    async nextNumber(docType, fiscalYear) {
      await db.documentSequence.upsert({ where: { docType_fiscalYear: { docType, fiscalYear } }, create: { docType, fiscalYear, lastNumber: 0 }, update: {} });
      const [row] = await db.$queryRaw<{ lastNumber: number }[]>`SELECT "lastNumber" FROM "DocumentSequence" WHERE "docType" = ${docType} AND "fiscalYear" = ${fiscalYear} FOR UPDATE`;
      const next = row!.lastNumber + 1;
      await db.$executeRaw`UPDATE "DocumentSequence" SET "lastNumber" = ${next} WHERE "docType" = ${docType} AND "fiscalYear" = ${fiscalYear}`;
      return next;
    },
    async peekNumber(docType, fiscalYear) {
      const row = await db.documentSequence.findUnique({ where: { docType_fiscalYear: { docType, fiscalYear } } });
      return (row?.lastNumber ?? 0) + 1;
    },
    async createProject(data) {
      const p = await db.project.create({ data: writeData(data) as Prisma.ProjectUncheckedCreateInput });
      return p.id;
    },
    async updateProject(id, data) {
      await db.project.update({ where: { id }, data: writeData(data) as Prisma.ProjectUncheckedUpdateInput });
    },
    async addHistory(data) {
      await db.projectStatusHistory.create({ data });
    },
    async history(projectId) {
      const rows = await db.projectStatusHistory.findMany({ where: { projectId }, include: { changedBy: ref }, orderBy: { at: "desc" } });
      return rows.map((r) => ({ id: r.id, fromStatus: r.fromStatus, toStatus: r.toStatus, changedBy: r.changedBy, reason: r.reason, at: r.at }));
    },
    async options(statuses, activeOnly, q) {
      const rows = await db.project.findMany({
        where: { status: { in: [...statuses] }, ...(activeOnly ? { isActive: true } : {}), ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}) },
        include: projectInclude,
        orderBy: { code: "asc" },
        take: 500,
      });
      return rows.map(toProject);
    },

    async costs(projectId, filters) {
      const rows = await db.projectCost.findMany({
        where: { projectId, ...(filters.category ? { category: filters.category } : {}), ...(filters.includeVoided ? {} : { voidedAt: null }) },
        include: costInclude,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      });
      const counts = await store.attachmentCounts("ProjectCost", rows.map((r) => r.id));
      return rows.map((r) => toCost(r, counts.get(r.id) ?? 0));
    },
    async cost(id) {
      const c = await db.projectCost.findUnique({ where: { id }, include: costInclude });
      if (!c) return null;
      return toCost(c, (await store.attachmentCounts("ProjectCost", [id])).get(id) ?? 0);
    },
    async lockCost(id) {
      const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "ProjectCost" WHERE id = ${id}::uuid FOR UPDATE`;
      return rows.length ? store.cost(id) : null;
    },
    async addCost(data) {
      const c = await db.projectCost.create({ data: { ...data, date: new Date(`${data.date}T00:00:00Z`) } });
      return c.id;
    },
    async voidCost(id, data) {
      await db.projectCost.update({ where: { id }, data: { ...data, voidedAt: new Date() } });
    },
    async costTotals(projectIds) {
      const out = new Map<string, Record<CostCategory, string>>();
      if (!projectIds.length) return out;
      const groups = await db.projectCost.groupBy({ by: ["projectId", "category"], where: { projectId: { in: projectIds }, voidedAt: null }, _sum: { amount: true } });
      for (const id of projectIds) out.set(id, Object.fromEntries(COST_CATEGORIES.map((c) => [c, "0.00"])) as Record<CostCategory, string>);
      for (const g of groups) out.get(g.projectId)![g.category] = (g._sum.amount ?? new Prisma.Decimal(0)).toFixed(2);
      return out;
    },

    async attachments(entityType, entityId) {
      return db.attachment.findMany({ where: { entityType, entityId }, include: { uploadedBy: ref }, orderBy: { createdAt: "asc" } });
    },
    async attachmentCounts(entityType, entityIds) {
      if (!entityIds.length) return new Map();
      const g = await db.attachment.groupBy({ by: ["entityId"], where: { entityType, entityId: { in: entityIds } }, _count: { _all: true } });
      return new Map(g.map((x) => [x.entityId, x._count._all]));
    },
    attachment: (id) => db.attachment.findUnique({ where: { id }, include: { uploadedBy: ref } }),
    addAttachment: (data) => db.attachment.create({ data, include: { uploadedBy: ref } }),
    async deleteAttachment(id) {
      await db.attachment.delete({ where: { id } });
    },

    async auditRows(projectId, limit) {
      const rows = await db.auditLog.findMany({ where: { entityType: "Project", entityId: projectId }, include: { user: ref }, orderBy: { createdAt: "desc" }, take: limit });
      return rows.map((r) => ({ id: r.id, action: r.action, at: r.createdAt, by: r.user, before: (r.before as Record<string, unknown> | null) ?? null, after: (r.after as Record<string, unknown> | null) ?? null }));
    },
    user: (id) => db.user.findUnique({ where: { id }, select: { id: true, name: true, status: true } }),
    activeUsers: () => db.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    warehouse: (id) => db.warehouse.findUnique({ where: { id }, select: { id: true, isActive: true } }),
    async fiscalYearStartMonth() {
      return (await db.inventorySettings.findUnique({ where: { id: 1 } }))?.fiscalYearStartMonth ?? 7;
    },
  };
  return store;
}

export function prismaProjectsUnitOfWork(client: PrismaClient): ProjectsUnitOfWork {
  return {
    store: prismaProjectsStore(client),
    transaction: async (fn) => {
      const result = await client.$transaction((tx) => fn(prismaProjectsStore(tx)), { timeout: 30_000, maxWait: 15_000 });
      await publishDataChange("projects");
      return result;
    },
  };
}
