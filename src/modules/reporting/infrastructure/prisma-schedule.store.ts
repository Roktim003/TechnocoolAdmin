import type { Prisma, PrismaClient } from "@prisma/client";
import type { RunFile, RunRecord, ScheduleRecord, ScheduleStore } from "../application/ports";

const include = { owner: { select: { id: true, name: true } } } as const;
type Row = Prisma.ReportScheduleGetPayload<{ include: typeof include }>;

const toSchedule = (r: Row): ScheduleRecord => ({
  id: r.id,
  reportId: r.reportId,
  params: (r.params ?? {}) as Record<string, string>,
  frequency: r.frequency,
  dayOfWeek: r.dayOfWeek,
  dayOfMonth: r.dayOfMonth,
  time: r.time,
  format: r.format,
  recipientUserIds: r.recipientUserIds,
  externalEmails: r.externalEmails,
  isActive: r.isActive,
  owner: r.owner,
  nextRunAt: r.nextRunAt,
  lastRunAt: r.lastRunAt,
  lastStatus: r.lastStatus,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const toRun = (r: Prisma.ReportScheduleRunGetPayload<object>): RunRecord => ({
  id: r.id,
  scheduleId: r.scheduleId,
  trigger: r.trigger,
  startedAt: r.startedAt,
  finishedAt: r.finishedAt,
  status: r.status,
  error: r.error,
  rowCount: r.rowCount,
  fileKeys: r.fileKeys,
  files: (r.files ?? []) as unknown as RunFile[],
  emailed: r.emailed,
});

export function prismaScheduleStore(db: PrismaClient): ScheduleStore {
  const sortMap: Record<string, string> = { createdAt: "createdAt", nextRunAt: "nextRunAt", reportId: "reportId" };
  return {
    async list(q) {
      const where: Prisma.ReportScheduleWhereInput = { ...(q.filters.ownerId ? { ownerId: q.filters.ownerId } : {}), ...(q.filters.reportId ? { reportId: q.filters.reportId } : {}) };
      const [rows, total] = await Promise.all([
        db.reportSchedule.findMany({ where, include, orderBy: [...q.sort.map((s) => ({ [sortMap[s.field] ?? "createdAt"]: s.direction })), { id: "asc" }], skip: q.skip, take: q.take }),
        db.reportSchedule.count({ where }),
      ]);
      return { items: rows.map(toSchedule), total };
    },
    count: (f) => db.reportSchedule.count({ where: { ...(f.ownerId ? { ownerId: f.ownerId } : {}), ...(f.reportId ? { reportId: f.reportId } : {}) } }),
    async get(id) {
      const r = await db.reportSchedule.findUnique({ where: { id }, include });
      return r ? toSchedule(r) : null;
    },
    async create(ownerId, input, nextRunAt) {
      return toSchedule(await db.reportSchedule.create({ data: { ...input, params: input.params, ownerId, nextRunAt }, include }));
    },
    async update(id, input, nextRunAt) {
      return toSchedule(await db.reportSchedule.update({ where: { id }, data: { ...input, ...(nextRunAt !== undefined ? { nextRunAt } : {}) }, include }));
    },
    async delete(id) {
      await db.reportSchedule.delete({ where: { id } });
    },

    claimDue(now, next, limit) {
      return db.$transaction(async (tx) => {
        // SKIP LOCKED: a second worker ticking at the same moment skips rows the first one holds.
        const due = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "ReportSchedule" WHERE "isActive" AND "nextRunAt" IS NOT NULL AND "nextRunAt" <= ${now}
          ORDER BY "nextRunAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED`;
        const out: { schedule: ScheduleRecord; runId: string }[] = [];
        for (const { id } of due) {
          const s = toSchedule((await tx.reportSchedule.findUnique({ where: { id }, include }))!);
          await tx.reportSchedule.update({ where: { id }, data: { nextRunAt: next(s) } });
          const run = await tx.reportScheduleRun.create({ data: { scheduleId: id, trigger: "SCHEDULE" } });
          out.push({ schedule: s, runId: run.id });
        }
        return out;
      });
    },
    async startRun(scheduleId, trigger) {
      return (await db.reportScheduleRun.create({ data: { scheduleId, trigger } })).id;
    },
    async finishRun(runId, data) {
      const files = data.files ?? [];
      const at = new Date();
      const run = await db.reportScheduleRun.update({
        where: { id: runId },
        data: { status: data.status, error: data.error ?? null, rowCount: data.rowCount ?? null, files: files as unknown as Prisma.InputJsonValue, fileKeys: files.map((f) => f.key), emailed: data.emailed ?? 0, finishedAt: at },
      });
      await db.reportSchedule.update({ where: { id: run.scheduleId }, data: { lastRunAt: at, lastStatus: data.status } });
    },
    async runs(scheduleId, page, pageSize) {
      const [rows, total] = await Promise.all([
        db.reportScheduleRun.findMany({ where: { scheduleId }, orderBy: { startedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
        db.reportScheduleRun.count({ where: { scheduleId } }),
      ]);
      return { items: rows.map(toRun), total };
    },
    async run(runId) {
      const r = await db.reportScheduleRun.findUnique({ where: { id: runId } });
      return r ? toRun(r) : null;
    },
    users: (ids) => (ids.length ? db.user.findMany({ where: { id: { in: ids }, status: "ACTIVE" }, select: { id: true, name: true, email: true } }) : Promise.resolve([])),
  };
}
