import type { Prisma } from "@prisma/client";
import type { Db } from "@/shared/db/prisma";
import type { OpeningImportRecord, OpeningRow, OpeningStore, RowIssue, WarehouseSummary } from "../application/opening.service";

const include = { createdBy: { select: { id: true, name: true } } } as const;
type Row = Prisma.OpeningImportGetPayload<{ include: typeof include }>;

const toRecord = (r: Row): OpeningImportRecord => ({
  id: r.id,
  fileKey: r.fileKey,
  fileName: r.fileName,
  status: r.status,
  totalRows: r.totalRows,
  rows: (r.rows as unknown as OpeningRow[] | null) ?? null,
  errors: (r.errors as unknown as RowIssue[] | null) ?? [],
  warnings: (r.warnings as unknown as RowIssue[] | null) ?? [],
  summary: (r.summary as unknown as WarehouseSummary[] | null) ?? [],
  entryIds: r.entryIds,
  failedReason: r.failedReason,
  createdBy: r.createdBy,
  committedAt: r.committedAt,
  createdAt: r.createdAt,
});

const json = (v: unknown) => v as Prisma.InputJsonValue;

export function prismaOpeningStore(db: Db): OpeningStore {
  const get = async (id: string) => {
    const r = await db.openingImport.findUnique({ where: { id }, include });
    return r ? toRecord(r) : null;
  };
  return {
    async create(data) {
      return (await db.openingImport.create({ data, select: { id: true } })).id;
    },
    get,
    async lock(id) {
      const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "OpeningImport" WHERE id = ${id}::uuid FOR UPDATE`;
      return rows.length ? get(id) : null;
    },
    async update(id, data) {
      const { rows, errors, warnings, summary, ...rest } = data;
      await db.openingImport.update({
        where: { id },
        data: {
          ...rest,
          ...(rows !== undefined ? { rows: json(rows) } : {}),
          ...(errors !== undefined ? { errors: json(errors) } : {}),
          ...(warnings !== undefined ? { warnings: json(warnings) } : {}),
          ...(summary !== undefined ? { summary: json(summary) } : {}),
        },
      });
    },
    async recent(limit) {
      return (await db.openingImport.findMany({ include, orderBy: { createdAt: "desc" }, take: limit })).map(toRecord);
    },
    warehouses: () =>
      db.warehouse.findMany({
        select: { id: true, code: true, name: true, isActive: true, openingLockedAt: true, openingLockedBy: { select: { id: true, name: true } } },
        orderBy: { code: "asc" },
      }),
    async productsByCode(codes) {
      if (!codes.length) return [];
      const rows = await db.product.findMany({ where: { code: { in: codes } }, select: { id: true, code: true, name: true, status: true, trackSerial: true, unit: { select: { code: true } } } });
      return rows.map((p) => ({ id: p.id, code: p.code, name: p.name, status: p.status, trackSerial: p.trackSerial, unitCode: p.unit.code }));
    },
    async activeProducts() {
      const rows = await db.product.findMany({ where: { status: "ACTIVE" }, select: { id: true, code: true, name: true, status: true, trackSerial: true, unit: { select: { code: true } } }, orderBy: { code: "asc" } });
      return rows.map((p) => ({ id: p.id, code: p.code, name: p.name, status: p.status, trackSerial: p.trackSerial, unitCode: p.unit.code }));
    },
    async existingSerials(pairs) {
      if (!pairs.length) return new Set();
      const rows = await db.serialNumber.findMany({ where: { OR: pairs.map((p) => ({ productId: p.productId, serial: p.serial })) }, select: { productId: true, serial: true } });
      return new Set(rows.map((r) => `${r.productId}|${r.serial}`));
    },
    async setOpeningLock(warehouseId, lockedById) {
      await db.warehouse.update({ where: { id: warehouseId }, data: { openingLockedAt: lockedById ? new Date() : null, openingLockedById: lockedById } });
    },
  };
}
