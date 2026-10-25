import { PrismaClient, Prisma } from "@prisma/client";
import type { OpsStore } from "../application/ports";
import type { RestoredInspection } from "../application/restore-test.service";
import type { BackupRunView, IntegrityCheckResult, IntegrityRunView, RestoreTestView } from "../domain/types";
import { runIntegrityChecks } from "./integrity-queries";

/** Tables counted for backups and restore tests. */
export const COUNTED_TABLES = [
  "User",
  "Role",
  "Warehouse",
  "Product",
  "Supplier",
  "Customer",
  "Project",
  "StockEntry",
  "StockEntryLine",
  "StockMovement",
  "StockBalance",
  "SerialNumber",
  "PurchaseOrder",
  "StockCount",
  "Attachment",
  "AuditLog",
] as const;

async function countRows(db: PrismaClient): Promise<Record<string, number>> {
  const sql = COUNTED_TABLES.map((t) => `SELECT '${t}' AS t, COUNT(*)::bigint AS n FROM "${t}"`).join(" UNION ALL ");
  const rows = await db.$queryRawUnsafe<{ t: string; n: bigint }[]>(sql);
  return Object.fromEntries(rows.map((r) => [r.t, Number(r.n)]));
}

const isMissingTable = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021";
const json = (v: unknown) => (v === undefined ? undefined : v === null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));

function backupView(r: Prisma.BackupRunGetPayload<object>): BackupRunView {
  return { ...r, sizeBytes: r.sizeBytes === null ? null : Number(r.sizeBytes) };
}

export function prismaOpsStore(db: PrismaClient): OpsStore {
  return {
    async startBackup(trigger, requestedById) {
      try {
        return (await db.backupRun.create({ data: { trigger, requestedById }, select: { id: true } })).id;
      } catch (err) {
        if (isMissingTable(err)) return null;
        throw err;
      }
    },
    async finishBackup(id, data) {
      if (!id) return;
      const { details, sizeBytes, ...rest } = data;
      await db.backupRun.update({ where: { id }, data: { ...rest, ...(sizeBytes !== undefined ? { sizeBytes: sizeBytes === null ? null : BigInt(sizeBytes) } : {}), ...(details !== undefined ? { details: json(details) } : {}) } });
    },
    async latestBackups(limit) {
      return (await db.backupRun.findMany({ orderBy: { startedAt: "desc" }, take: limit })).map(backupView);
    },
    async latestSuccessfulBackup() {
      const r = await db.backupRun.findFirst({ where: { status: "SUCCEEDED" }, orderBy: { startedAt: "desc" } });
      return r ? backupView(r) : null;
    },

    async startRestoreTest(trigger, requestedById) {
      return (await db.restoreTestRun.create({ data: { trigger, requestedById }, select: { id: true } })).id;
    },
    async finishRestoreTest(id, data) {
      const { details, ...rest } = data;
      await db.restoreTestRun.update({ where: { id }, data: { ...rest, ...(details !== undefined ? { details: json(details) } : {}) } });
    },
    async latestRestoreTests(limit) {
      return (await db.restoreTestRun.findMany({ orderBy: { startedAt: "desc" }, take: limit })) as RestoreTestView[];
    },

    async startIntegrity(trigger, requestedById) {
      return (await db.integrityCheckRun.create({ data: { trigger, requestedById }, select: { id: true } })).id;
    },
    async finishIntegrity(id, data) {
      await db.integrityCheckRun.update({ where: { id }, data: { status: data.status, passed: data.passed, checks: json(data.checks), error: data.error, finishedAt: new Date() } });
    },
    async latestIntegrity(limit) {
      const rows = await db.integrityCheckRun.findMany({ orderBy: { startedAt: "desc" }, take: limit });
      return rows.map((r) => ({ ...r, checks: (r.checks ?? []) as unknown as IntegrityCheckResult[] })) as IntegrityRunView[];
    },

    rowCounts: () => countRows(db),
  };
}

/** CREATE / DROP of the temporary restore-test database, on the live server. */
export function databaseAdmin(db: PrismaClient) {
  const safe = (name: string) => {
    if (!/^sb_restore_test_\d{14}$/.test(name)) throw new Error(`Refusing to touch database ${name}`);
    return name;
  };
  return {
    async createDatabase(name: string) {
      await db.$executeRawUnsafe(`CREATE DATABASE "${safe(name)}" TEMPLATE template0`);
    },
    async dropDatabase(name: string) {
      await db.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${safe(name)}" WITH (FORCE)`);
    },
  };
}

/** Sanity checks on a restored copy: row counts, the integrity checks, the latest entry date. */
export async function inspectDatabase(url: string): Promise<RestoredInspection> {
  const db = new PrismaClient({ datasourceUrl: url, log: ["error"] });
  try {
    const rowCounts = await countRows(db);
    const integrity = await runIntegrityChecks(db);
    const [latest] = await db.$queryRawUnsafe<{ d: Date | null }[]>(`SELECT MAX("entryDate") AS d FROM "StockEntry" WHERE status IN ('POSTED', 'REVERSED', 'RECEIVED', 'DISPATCHED')`);
    const [migrations] = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*)::bigint AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`);
    return { rowCounts, integrity, latestEntryDate: latest?.d ? latest.d.toISOString().slice(0, 10) : null, migrations: Number(migrations?.n ?? 0) };
  } finally {
    await db.$disconnect();
  }
}
