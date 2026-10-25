import { Prisma, type PrismaClient } from "@prisma/client";
import { publishDataChange } from "@/shared/events/change-events";
import type { Db } from "@/shared/db/prisma";
import { toOrderBy, type ListQuery } from "@/shared/pagination/list-query";
import { dateRangeWhere } from "@/shared/time/dates";
import { AuditService } from "@/modules/audit/application/audit.service";
import { prismaAuditRepository } from "@/modules/audit/infrastructure/prisma-audit.repository";
import type { EntryFilters, MasterFilters } from "../application/dto";
import { balanceKey, sortKeys, type BalanceKey, type BalanceRow, type EntryRecord, type InventoryStore, type InventoryUnitOfWork, type MovementRecord, type StockLevelRow } from "../application/ports";
import { prismaCountStore } from "./prisma-count.store";
import { prismaOpeningStore } from "./prisma-opening.store";

type Dec = Prisma.Decimal | null | undefined;
const q3 = (v: Dec) => (v ? v.toFixed(3) : "0.000");
const m2 = (v: Dec) => (v ? v.toFixed(2) : "0.00");
const c4 = (v: Dec) => (v ? v.toFixed(4) : "0.0000");
const dateOnly = (v: Date) => v.toISOString().slice(0, 10);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
const uuids = (ids: string[]) => Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/* ─────────────── entry mapping ─────────────── */

const short = { select: { id: true, number: true, type: true, status: true } } as const;
const entryInclude = {
  warehouse: { select: { id: true, code: true, name: true, isActive: true } },
  toWarehouse: { select: { id: true, code: true, name: true, isActive: true } },
  supplier: { select: { id: true, name: true, isActive: true } },
  customer: { select: { id: true, name: true, isActive: true } },
  project: { select: { id: true, name: true, code: true, status: true, isActive: true } },
  originalEntry: { select: { id: true, number: true, type: true, status: true, projectId: true, supplierId: true } },
  reversalOf: { select: { id: true, number: true } },
  reversedBy: { select: { id: true, number: true } },
  relatedEntry: { select: { id: true, number: true, type: true } },
  relatedFrom: short,
  referencedBy: short,
  createdBy: { select: { id: true, name: true } },
  verifiedBy: { select: { id: true, name: true } },
  receivedByUser: { select: { id: true, name: true } },
  purchaseOrder: { select: { id: true, number: true } },
  lines: {
    orderBy: { lineNo: "asc" },
    include: {
      product: { select: { id: true, code: true, name: true, trackSerial: true, status: true, sellingPrice: true, unit: { select: { code: true } } } },
      serials: { orderBy: { serial: "asc" } },
    },
  },
  charges: { orderBy: { sortOrder: "asc" } },
} satisfies Prisma.StockEntryInclude;

type EntryRow = Prisma.StockEntryGetPayload<{ include: typeof entryInclude }>;

function toEntry(r: EntryRow, attachmentCount: number): EntryRecord {
  return {
    id: r.id,
    number: r.number,
    draftRef: r.draftRef,
    type: r.type,
    status: r.status,
    entryDate: dateOnly(r.entryDate),
    warehouse: r.warehouse,
    toWarehouse: r.toWarehouse,
    supplier: r.supplier,
    customer: r.customer,
    project: r.project,
    originalEntry: r.originalEntry,
    reversalOf: r.reversalOf,
    reversedBy: r.reversedBy,
    relatedEntry: r.relatedEntry,
    relatedFrom: r.relatedFrom,
    referencedBy: r.referencedBy,
    purchaseOrder: r.purchaseOrder,
    poNumberText: r.poNumberText,
    supplierInvoiceNo: r.supplierInvoiceNo,
    lcNo: r.lcNo,
    billOfEntryNo: r.billOfEntryNo,
    challanNo: r.challanNo,
    siteAddress: r.siteAddress,
    receivedBy: r.receivedBy,
    vehicle: r.vehicle,
    reason: r.reason,
    description: r.description,
    customerPhone: r.customerPhone,
    customerAddress: r.customerAddress,
    notes: r.notes,
    currency: r.currency,
    exchangeRate: c4(r.exchangeRate),
    discountAmount: m2(r.discountAmount),
    vatPercent: r.vatPercent.toFixed(2),
    subtotal: m2(r.subtotal),
    vatAmount: m2(r.vatAmount),
    grandTotal: m2(r.grandTotal),
    costTotal: m2(r.costTotal),
    belowCostConfirmed: r.belowCostConfirmed,
    createdBy: r.createdBy,
    verifiedBy: r.verifiedBy,
    receivedByUser: r.receivedByUser,
    submittedAt: r.submittedAt,
    verifiedAt: r.verifiedAt,
    rejectionReason: r.rejectionReason,
    postedAt: r.postedAt,
    dispatchedAt: r.dispatchedAt,
    receivedAt: r.receivedAt,
    cancelledAt: r.cancelledAt,
    reversedAt: r.reversedAt,
    reversalReason: r.reversalReason,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    attachmentCount,
    lines: r.lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      productId: l.productId,
      product: { id: l.product.id, code: l.product.code, name: l.product.name, unitCode: l.product.unit.code, trackSerial: l.product.trackSerial, status: l.product.status, sellingPrice: m2(l.product.sellingPrice) },
      qty: q3(l.qty),
      unitPrice: c4(l.unitPrice),
      unitCostBdt: c4(l.unitCostBdt),
      landedUnitCost: l.landedUnitCost ? c4(l.landedUnitCost) : null,
      amount: m2(l.amount),
      costAmount: m2(l.costAmount),
      condition: l.condition,
      originalLineId: l.originalLineId,
      receivedQty: l.receivedQty ? q3(l.receivedQty) : null,
      adjustDirection: l.adjustDirection,
      purchaseOrderLineId: l.purchaseOrderLineId,
      note: l.note,
      serials: l.serials.map((s) => ({ serial: s.serial, serialId: s.serialId, received: s.received })),
    })),
    charges: r.charges.map((c) => ({ id: c.id, type: c.type, mode: c.mode, value: c4(c.value), includeInCost: c.includeInCost, label: c.label, amountBdt: m2(c.amountBdt) })),
  };
}

function entryData(w: Parameters<InventoryStore["replaceEntry"]>[1]) {
  const { lines: _l, charges: _c, entryDate, ...rest } = w;
  return { ...rest, entryDate: asDate(entryDate) };
}

const linesCreate = (lines: Parameters<InventoryStore["replaceEntry"]>[1]["lines"]) =>
  lines.map((l, i) => ({
    lineNo: i + 1,
    productId: l.productId,
    qty: l.qty,
    unitPrice: l.unitPrice,
    condition: l.condition,
    originalLineId: l.originalLineId,
    adjustDirection: l.adjustDirection ?? null,
    purchaseOrderLineId: l.purchaseOrderLineId ?? null,
    note: l.note,
    serials: { create: [...new Set(l.serials)].map((serial) => ({ serial })) },
  }));

const chargesCreate = (charges: Parameters<InventoryStore["replaceEntry"]>[1]["charges"]) => charges.map((c, i) => ({ ...c, sortOrder: i }));

function masterWhere(q: ListQuery<MasterFilters>, searchFields: string[]) {
  return {
    ...(q.filters.active !== undefined ? { isActive: q.filters.active } : {}),
    ...(q.q ? { OR: searchFields.map((f) => ({ [f]: { contains: q.q, mode: "insensitive" } })) } : {}),
  };
}

/* ─────────────── the store ─────────────── */

export function prismaInventoryStore(db: Db): InventoryStore {
  const loadEntry = async (id: string) => {
    const r = await db.stockEntry.findUnique({ where: { id }, include: entryInclude });
    if (!r) return null;
    const count = await db.attachment.count({ where: { entityType: "StockEntry", entityId: id } });
    return toEntry(r, count);
  };

  const store: InventoryStore = {
    tx: db,
    audit: new AuditService(prismaAuditRepository(db)),
    counts: prismaCountStore(db),
    openings: prismaOpeningStore(db),

    /* ── reference data ── */
    async settings() {
      const s = await db.inventorySettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
      return { defaultSalesVatPercent: s.defaultSalesVatPercent.toFixed(2), adminWriteOffNeedsApproval: s.adminWriteOffNeedsApproval, allowAdminBelowCostSale: s.allowAdminBelowCostSale, fiscalYearStartMonth: s.fiscalYearStartMonth };
    },
    async updateSettings(data) {
      await db.inventorySettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
      return store.settings();
    },
    warehouse: (id) => db.warehouse.findUnique({ where: { id }, select: { id: true, code: true, name: true, isActive: true } }),
    warehouses: (ids) => db.warehouse.findMany({ where: ids ? { id: { in: ids } } : {}, select: { id: true, code: true, name: true, isActive: true }, orderBy: { code: "asc" } }),
    async products(ids) {
      if (!ids.length) return [];
      const rows = await db.product.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, code: true, name: true, trackSerial: true, status: true, sellingPrice: true } });
      return rows.map((p) => ({ ...p, sellingPrice: m2(p.sellingPrice) }));
    },

    /* ── masters ── */
    async listCustomers(q) {
      const where = masterWhere(q, ["name", "contactPerson", "phone", "email"]) as Prisma.CustomerWhereInput;
      const [items, total] = await Promise.all([db.customer.findMany({ where, orderBy: [...toOrderBy(q.sort), { id: "asc" }], skip: q.skip, take: q.take }), db.customer.count({ where })]);
      return { items: items.map(({ nameKey: _k, ...c }) => c), total };
    },
    async customer(id) {
      const c = await db.customer.findUnique({ where: { id } });
      if (!c) return null;
      const { nameKey: _k, ...rest } = c;
      return rest;
    },
    async createCustomer(data) {
      const { nameKey: _k, ...c } = await db.customer.create({ data });
      return c;
    },
    async updateCustomer(id, data) {
      const { nameKey: _k, ...c } = await db.customer.update({ where: { id }, data });
      return c;
    },
    async customerNameExists(nameKey, exceptId) {
      return (await db.customer.count({ where: { nameKey, ...(exceptId ? { id: { not: exceptId } } : {}) } })) > 0;
    },
    /* ── entries ── */
    entry: loadEntry,
    async lockEntry(id) {
      const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "StockEntry" WHERE id = ${id}::uuid FOR UPDATE`;
      return rows.length ? loadEntry(id) : null;
    },
    async listEntries(q, scope) {
      const f = q.filters as EntryFilters;
      const and: Prisma.StockEntryWhereInput[] = [{ OR: [{ warehouseId: { in: scope.warehouseIds } }, { toWarehouseId: { in: scope.warehouseIds } }] }];
      if (f.type) and.push({ type: f.type as never });
      if (f.status) and.push({ status: f.status as never });
      if (f.warehouseId) and.push({ OR: [{ warehouseId: f.warehouseId }, { toWarehouseId: f.warehouseId }] });
      if (f.projectId) and.push({ projectId: f.projectId });
      if (f.customerId) and.push({ customerId: f.customerId });
      if (f.supplierId) and.push({ supplierId: f.supplierId });
      if (f.createdById) and.push({ createdById: f.createdById });
      if (f.purchaseOrderId) and.push({ purchaseOrderId: f.purchaseOrderId });
      if (f.productId) and.push({ lines: { some: { productId: f.productId } } });
      const range = dateRangeWhere(f.dateFrom, f.dateTo);
      if (range) and.push({ entryDate: range });
      if (f.awaitingMyApproval) and.push(scope.awaitingApprovalFor ? { status: "PENDING", createdById: { not: scope.awaitingApprovalFor }, warehouseId: { in: scope.warehouseIds } } : { id: { in: [] } });
      if (scope.awaitingReceiptFor) and.push({ status: "DISPATCHED", toWarehouseId: { in: scope.awaitingReceiptFor } });
      if (q.q) {
        and.push({
          OR: ["number", "draftRef", "poNumberText", "supplierInvoiceNo", "challanNo", "lcNo", "billOfEntryNo"].map((k) => ({ [k]: { contains: q.q, mode: "insensitive" } })),
        });
      }
      const where: Prisma.StockEntryWhereInput = { AND: and };
      const [rows, total] = await Promise.all([
        db.stockEntry.findMany({ where, include: entryInclude, orderBy: [...toOrderBy(q.sort), { id: "asc" }] as Prisma.StockEntryOrderByWithRelationInput[], skip: q.skip, take: q.take }),
        db.stockEntry.count({ where }),
      ]);
      const counts = rows.length
        ? await db.attachment.groupBy({ by: ["entityId"], where: { entityType: "StockEntry", entityId: { in: rows.map((r) => r.id) } }, _count: { _all: true } })
        : [];
      const byId = new Map(counts.map((c) => [c.entityId, c._count._all]));
      return { items: rows.map((r) => toEntry(r, byId.get(r.id) ?? 0)), total };
    },
    async createEntry(data) {
      const { lines, charges, draftRef, status, createdById, reversalOfId, relatedEntryId } = data;
      const created = await db.stockEntry.create({
        data: {
          ...entryData(data),
          draftRef,
          status,
          createdById,
          reversalOfId: reversalOfId ?? null,
          relatedEntryId: relatedEntryId ?? null,
          lines: { create: linesCreate(lines) },
          charges: { create: chargesCreate(charges) },
        } as Prisma.StockEntryUncheckedCreateInput,
        select: { id: true },
      });
      return created.id;
    },
    async replaceEntry(id, data) {
      await db.stockEntryLine.deleteMany({ where: { entryId: id } });
      await db.landedCostCharge.deleteMany({ where: { entryId: id } });
      await db.stockEntry.update({
        where: { id },
        data: { ...entryData(data), lines: { create: linesCreate(data.lines) }, charges: { create: chargesCreate(data.charges) } } as Prisma.StockEntryUncheckedUpdateInput,
      });
    },
    async updateEntry(id, data) {
      await db.stockEntry.update({ where: { id }, data: data as Prisma.StockEntryUncheckedUpdateInput });
    },
    async updateLine(lineId, data) {
      await db.stockEntryLine.update({ where: { id: lineId }, data });
    },
    async updateLineCosts(rows) {
      if (!rows.length) return;
      const values = Prisma.join(rows.map((r) => Prisma.sql`(${r.lineId}::uuid, ${r.unitCostBdt}::numeric, ${r.landedUnitCost}::numeric, ${r.amount}::numeric, ${r.costAmount}::numeric)`));
      await db.$executeRaw`
        UPDATE "StockEntryLine" l SET "unitCostBdt" = v.u, "landedUnitCost" = v.lu, "amount" = v.am, "costAmount" = v.ca
        FROM (VALUES ${values}) AS v(id, u, lu, am, ca) WHERE l.id = v.id`;
    },
    async updateCharge(chargeId, amountBdt) {
      await db.landedCostCharge.update({ where: { id: chargeId }, data: { amountBdt } });
    },
    async replaceCharges(entryId, charges) {
      await db.landedCostCharge.deleteMany({ where: { entryId } });
      if (charges.length) await db.landedCostCharge.createMany({ data: chargesCreate(charges).map((c) => ({ ...c, entryId })) });
    },
    async linkLineSerial(lineId, serial, serialId, received = true) {
      await db.entryLineSerial.upsert({ where: { lineId_serial: { lineId, serial } }, create: { lineId, serial, serialId, received }, update: { serialId, received } });
    },
    async returnedQty(originalLineId, exceptEntryId) {
      const r = await db.stockEntryLine.aggregate({
        _sum: { qty: true },
        where: { originalLineId, entryId: { not: exceptEntryId }, entry: { status: { in: ["POSTED", "PENDING"] } } },
      });
      return q3(r._sum.qty);
    },
    async nextNumber(docType, fiscalYear) {
      await db.$executeRaw`INSERT INTO "DocumentSequence" ("docType", "fiscalYear", "lastNumber") VALUES (${docType}, ${fiscalYear}, 0) ON CONFLICT DO NOTHING`;
      const [row] = await db.$queryRaw<{ lastNumber: number }[]>`SELECT "lastNumber" FROM "DocumentSequence" WHERE "docType" = ${docType} AND "fiscalYear" = ${fiscalYear} FOR UPDATE`;
      const next = row!.lastNumber + 1;
      await db.$executeRaw`UPDATE "DocumentSequence" SET "lastNumber" = ${next} WHERE "docType" = ${docType} AND "fiscalYear" = ${fiscalYear}`;
      return next;
    },
    async peekNumber(docType, fiscalYear) {
      const row = await db.documentSequence.findUnique({ where: { docType_fiscalYear: { docType, fiscalYear } } });
      return (row?.lastNumber ?? 0) + 1;
    },

    /* ── count freeze / go-live lock ── */
    async lockWarehouses(ids, mode) {
      for (const id of [...new Set(ids)].sort()) {
        const key = `stock-count:${id}`;
        if (mode === "shared") await db.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtext(${key}))::text`;
        else await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
      }
    },
    async activeCount(warehouseId, productIds) {
      if (!productIds.length) return null;
      const c = await db.stockCount.findFirst({
        where: { warehouseId, status: { in: ["COUNTING", "SUBMITTED"] }, lines: { some: { productId: { in: [...new Set(productIds)] } } } },
        select: { id: true, number: true, lines: { where: { productId: { in: [...new Set(productIds)] } }, select: { productId: true } } },
        orderBy: { createdAt: "asc" },
      });
      return c ? { id: c.id, number: c.number, productIds: [...new Set(c.lines.map((l) => l.productId))] } : null;
    },
    async openingLocked(warehouseId) {
      const w = await db.warehouse.findUnique({ where: { id: warehouseId }, select: { openingLockedAt: true } });
      return !!w?.openingLockedAt;
    },

    /* ── stock (locking) ── */
    async lockCosts(productIds) {
      const ids = [...new Set(productIds)].sort();
      const out = new Map<string, { totalQty: string; totalValue: string; avgCost: string }>();
      if (!ids.length) return out;
      await db.productCost.createMany({ data: ids.map((productId) => ({ productId })), skipDuplicates: true });
      // One statement; ORDER BY makes PostgreSQL lock the rows in key order (LockRows runs above the sort).
      const rows = await db.$queryRaw<{ productId: string; totalQty: Prisma.Decimal; totalValue: Prisma.Decimal; avgCost: Prisma.Decimal }[]>`
        SELECT "productId"::text AS "productId", "totalQty", "totalValue", "avgCost" FROM "ProductCost"
        WHERE "productId" = ANY(${ids}::uuid[]) ORDER BY "productId" FOR UPDATE`;
      for (const r of rows) out.set(r.productId, { totalQty: q3(r.totalQty), totalValue: m2(r.totalValue), avgCost: c4(r.avgCost) });
      return out;
    },
    async saveCosts(rows) {
      if (!rows.length) return;
      const values = Prisma.join(rows.map((r) => Prisma.sql`(${r.productId}::uuid, ${r.state.totalQty}::numeric, ${r.state.totalValue}::numeric, ${r.state.avgCost}::numeric)`));
      await db.$executeRaw`
        UPDATE "ProductCost" c SET "totalQty" = v.q, "totalValue" = v.val, "avgCost" = v.a, "updatedAt" = now() AT TIME ZONE 'UTC'
        FROM (VALUES ${values}) AS v(id, q, val, a) WHERE c."productId" = v.id`;
    },
    async costs(productIds) {
      const rows = await db.productCost.findMany({ where: { productId: { in: [...new Set(productIds)] } } });
      return new Map(rows.map((r) => [r.productId, { totalQty: q3(r.totalQty), totalValue: m2(r.totalValue), avgCost: c4(r.avgCost) }]));
    },
    async lockBalances(keys) {
      const sorted = sortKeys(keys);
      if (!sorted.length) return new Map();
      await db.stockBalance.createMany({ data: sorted.map((k) => ({ productId: k.productId, warehouseId: k.warehouseId, condition: k.condition })), skipDuplicates: true });
      const wanted = Prisma.join(sorted.map((k) => Prisma.sql`(${k.productId}::uuid, ${k.warehouseId}::uuid, ${k.condition}::"StockCondition")`));
      // One statement, rows locked in sortKeys order (uuid order = lower-case string order; condition as text).
      const rows = await db.$queryRaw<{ productId: string; warehouseId: string; condition: BalanceKey["condition"]; qtyOnHand: Prisma.Decimal; qtyReserved: Prisma.Decimal }[]>`
        SELECT "productId"::text AS "productId", "warehouseId"::text AS "warehouseId", "condition"::text AS "condition", "qtyOnHand", "qtyReserved"
        FROM "StockBalance" WHERE ("productId", "warehouseId", "condition") IN (VALUES ${wanted})
        ORDER BY "productId", "warehouseId", "condition"::text FOR UPDATE`;
      const out = new Map<string, BalanceRow>();
      for (const r of rows) out.set(balanceKey(r), { productId: r.productId, warehouseId: r.warehouseId, condition: r.condition, qtyOnHand: q3(r.qtyOnHand), qtyReserved: q3(r.qtyReserved) });
      return out;
    },
    async balances(keys: BalanceKey[]) {
      if (!keys.length) return new Map();
      const rows = await db.stockBalance.findMany({ where: { OR: keys.map((k) => ({ productId: k.productId, warehouseId: k.warehouseId, condition: k.condition })) } });
      return new Map(rows.map((r) => [balanceKey(r), { productId: r.productId, warehouseId: r.warehouseId, condition: r.condition, qtyOnHand: q3(r.qtyOnHand), qtyReserved: q3(r.qtyReserved) }]));
    },
    async saveBalances(rows) {
      if (!rows.length) return;
      const values = Prisma.join(rows.map((r) => Prisma.sql`(${r.productId}::uuid, ${r.warehouseId}::uuid, ${r.condition}::"StockCondition", ${r.qtyOnHand}::numeric, ${r.qtyReserved}::numeric)`));
      await db.$executeRaw`
        UPDATE "StockBalance" b SET "qtyOnHand" = v.h, "qtyReserved" = v.r, "updatedAt" = now() AT TIME ZONE 'UTC'
        FROM (VALUES ${values}) AS v(p, w, c, h, r)
        WHERE b."productId" = v.p AND b."warehouseId" = v.w AND b."condition" = v.c`;
    },
    async reservations(entryId) {
      const rows = await db.stockReservation.findMany({ where: { entryId } });
      return rows.map((r) => ({ productId: r.productId, warehouseId: r.warehouseId, condition: r.condition, qty: q3(r.qty) }));
    },
    async addReservations(entryId, rows) {
      if (rows.length) await db.stockReservation.createMany({ data: rows.map((r) => ({ entryId, ...r })) });
    },
    async deleteReservations(entryId) {
      await db.stockReservation.deleteMany({ where: { entryId } });
    },
    async inTransit(transferEntryId) {
      const rows = await db.stockInTransit.findMany({ where: { transferEntryId } });
      return rows.map((r) => ({ productId: r.productId, qty: q3(r.qty), value: m2(r.value) }));
    },
    async addInTransit(transferEntryId, productId, qty, value) {
      await db.stockInTransit.upsert({
        where: { transferEntryId_productId: { transferEntryId, productId } },
        create: { transferEntryId, productId, qty, value },
        update: { qty: { increment: qty }, value: { increment: value } },
      });
    },
    async clearInTransit(transferEntryId) {
      await db.stockInTransit.updateMany({ where: { transferEntryId }, data: { qty: 0, value: 0 } });
    },
    async insertMovements(rows) {
      if (rows.length) await db.stockMovement.createMany({ data: rows });
    },
    async entryMovements(entryId) {
      const rows = await db.stockMovement.findMany({
        where: { entryId },
        orderBy: { seq: "asc" },
        include: { entry: { select: { id: true, number: true, type: true } }, product: { select: { id: true, code: true, name: true } }, warehouse: { select: { id: true, code: true, name: true } } },
      });
      return rows.map(toMovement);
    },

    /* ── serials ── */
    async serialsByText(productId, serials) {
      if (!serials.length) return [];
      return db.serialNumber.findMany({ where: { productId, serial: { in: serials } }, select: serialSelect });
    },
    async serialsById(ids) {
      if (!ids.length) return [];
      return db.serialNumber.findMany({ where: { id: { in: ids } }, select: serialSelect });
    },
    createSerial: (data) => db.serialNumber.create({ data, select: serialSelect }),
    async updateSerial(id, data) {
      await db.serialNumber.update({ where: { id }, data });
    },
    async addSerialMovement(row) {
      await db.serialMovement.create({ data: row });
    },
    async serialMovementsOfEntry(entryId) {
      const rows = await db.serialMovement.findMany({ where: { entryId }, orderBy: { seq: "asc" } });
      if (!rows.length) return [];
      const serialIds = [...new Set(rows.map((r) => r.serialId))];
      const latest = await db.$queryRaw<{ serialId: string; entryId: string }[]>`
        SELECT DISTINCT ON ("serialId") "serialId", "entryId" FROM "SerialMovement"
        WHERE "serialId" IN (${uuids(serialIds)}) ORDER BY "serialId", seq DESC`;
      const latestBy = new Map(latest.map((l) => [l.serialId, l.entryId]));
      return rows.map((r) => ({ serialId: r.serialId, fromStatus: r.fromStatus, toStatus: r.toStatus, fromWarehouseId: r.fromWarehouseId, toWarehouseId: r.toWarehouseId, latestEntryId: latestBy.get(r.serialId)! }));
    },
    serialsReservedBy: (entryId) => db.serialNumber.findMany({ where: { reservedEntryId: entryId }, select: serialSelect }),

    /* ── reads ── */
    async stockLevels(q, warehouseIds) {
      if (!warehouseIds.length) return { items: [], total: 0 };
      const f = q.filters;
      const conds: Prisma.Sql[] = [Prisma.sql`TRUE`];
      if (f.productId) conds.push(Prisma.sql`p.id = ${f.productId}::uuid`);
      if (f.catalogId) conds.push(Prisma.sql`p."catalogId" = ${f.catalogId}::uuid`);
      if (f.categoryId) conds.push(Prisma.sql`p."categoryId" = ${f.categoryId}::uuid`);
      if (q.q) conds.push(Prisma.sql`(p.code ILIKE ${like(q.q)} OR p.name ILIKE ${like(q.q)} OR p.model ILIKE ${like(q.q)} OR p.barcode ILIKE ${like(q.q)})`);
      if (f.inStock) conds.push(Prisma.sql`(COALESCE(b.good, 0) + COALESCE(b.damaged, 0) + COALESCE(t.qty, 0)) > 0`);
      if (f.condition === "GOOD") conds.push(Prisma.sql`COALESCE(b.good, 0) > 0`);
      if (f.condition === "DAMAGED") conds.push(Prisma.sql`COALESCE(b.damaged, 0) > 0`);
      if (f.belowMinimum) conds.push(Prisma.sql`p."minStockLevel" IS NOT NULL AND (COALESCE(b.good, 0) - COALESCE(b.reserved, 0)) < p."minStockLevel"`);
      const where = Prisma.join(conds, " AND ");
      const sortSql = q.sort
        .map((s) => {
          const col = s.field === "name" ? Prisma.sql`p.name` : s.field === "total" ? Prisma.sql`(COALESCE(b.good, 0) + COALESCE(b.damaged, 0) + COALESCE(t.qty, 0))` : Prisma.sql`p.code`;
          return s.direction === "desc" ? Prisma.sql`${col} DESC` : Prisma.sql`${col} ASC`;
        })
        .concat(Prisma.sql`p.id ASC`);
      const wh = uuids(warehouseIds);
      const base = Prisma.sql`
        WITH b AS (
          SELECT "productId",
                 SUM(CASE WHEN condition = 'GOOD' THEN "qtyOnHand" ELSE 0 END) AS good,
                 SUM(CASE WHEN condition = 'DAMAGED' THEN "qtyOnHand" ELSE 0 END) AS damaged,
                 SUM(CASE WHEN condition = 'GOOD' THEN "qtyReserved" ELSE 0 END) AS reserved
          FROM "StockBalance" WHERE "warehouseId" IN (${wh}) GROUP BY "productId"
        ), t AS (
          SELECT it."productId", SUM(it.qty) AS qty FROM "StockInTransit" it
          JOIN "StockEntry" e ON e.id = it."transferEntryId"
          WHERE it.qty > 0 AND (e."warehouseId" IN (${wh}) OR e."toWarehouseId" IN (${wh}))
          GROUP BY it."productId"
        )
        SELECT p.id, p.code, p.name, p."minStockLevel", p."trackSerial", p.status::text AS status, u.code AS "unitCode",
               c.name AS "catalogName", cat.name AS "categoryName",
               COALESCE(b.good, 0) AS good, COALESCE(b.damaged, 0) AS damaged, COALESCE(b.reserved, 0) AS reserved,
               COALESCE(t.qty, 0) AS "inTransit", COALESCE(pc."avgCost", 0) AS "avgCost"
        FROM "Product" p
        JOIN "Unit" u ON u.id = p."unitId"
        JOIN "Catalog" c ON c.id = p."catalogId"
        JOIN "Category" cat ON cat.id = p."categoryId"
        LEFT JOIN b ON b."productId" = p.id
        LEFT JOIN t ON t."productId" = p.id
        LEFT JOIN "ProductCost" pc ON pc."productId" = p.id
        WHERE ${where}`;
      type Row = { id: string; code: string; name: string; minStockLevel: Prisma.Decimal | null; trackSerial: boolean; status: string; unitCode: string; catalogName: string; categoryName: string; good: Prisma.Decimal; damaged: Prisma.Decimal; reserved: Prisma.Decimal; inTransit: Prisma.Decimal; avgCost: Prisma.Decimal };
      const [rows, countRows] = await Promise.all([
        db.$queryRaw<Row[]>`${base} ORDER BY ${Prisma.join(sortSql, ", ")} LIMIT ${q.take} OFFSET ${q.skip}`,
        db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM (${base}) x`,
      ]);
      const ids = rows.map((r) => r.id);
      const [whs, detail] = await Promise.all([
        store.warehouses(warehouseIds),
        ids.length ? db.stockBalance.findMany({ where: { productId: { in: ids }, warehouseId: { in: warehouseIds } } }) : Promise.resolve([]),
      ]);
      const items: StockLevelRow[] = rows.map((r) => ({
        product: { id: r.id, code: r.code, name: r.name, unitCode: r.unitCode, minStockLevel: r.minStockLevel ? r.minStockLevel.toString() : null, trackSerial: r.trackSerial, status: r.status, catalogName: r.catalogName, categoryName: r.categoryName },
        warehouses: whs.map((w) => {
          const good = detail.find((x) => x.productId === r.id && x.warehouseId === w.id && x.condition === "GOOD");
          const dmg = detail.find((x) => x.productId === r.id && x.warehouseId === w.id && x.condition === "DAMAGED");
          return { warehouseId: w.id, code: w.code, good: q3(good?.qtyOnHand), damaged: q3(dmg?.qtyOnHand), reserved: q3(good?.qtyReserved) };
        }),
        good: q3(new Prisma.Decimal(r.good)),
        damaged: q3(new Prisma.Decimal(r.damaged)),
        reserved: q3(new Prisma.Decimal(r.reserved)),
        inTransit: q3(new Prisma.Decimal(r.inTransit)),
        avgCost: c4(new Prisma.Decimal(r.avgCost)),
      }));
      return { items, total: Number(countRows[0]?.n ?? 0) };
    },
    async movements(q, warehouseIds) {
      const f = q.filters;
      const where: Prisma.StockMovementWhereInput = {
        warehouseId: f.warehouseId ? f.warehouseId : { in: warehouseIds },
        ...(f.productId ? { productId: f.productId } : {}),
        ...(f.entryId ? { entryId: f.entryId } : {}),
        ...(f.type ? { entry: { type: f.type as never } } : {}),
        ...(dateRangeWhere(f.dateFrom, f.dateTo) ? { postedAt: dateRangeWhere(f.dateFrom, f.dateTo) } : {}),
      };
      const dir = q.sort[0]?.direction ?? "desc";
      const [rows, total] = await Promise.all([
        db.stockMovement.findMany({
          where,
          orderBy: { seq: dir },
          skip: q.skip,
          take: q.take,
          include: { entry: { select: { id: true, number: true, type: true } }, product: { select: { id: true, code: true, name: true } }, warehouse: { select: { id: true, code: true, name: true } } },
        }),
        db.stockMovement.count({ where }),
      ]);
      return { items: rows.map(toMovement), total };
    },
    async inTransitForProduct(productId, warehouseIds) {
      const rows = await db.stockInTransit.findMany({
        where: { productId, qty: { gt: 0 }, transfer: { OR: [{ warehouseId: { in: warehouseIds } }, { toWarehouseId: { in: warehouseIds } }] } },
        include: { transfer: { select: { id: true, number: true, warehouse: { select: { code: true } }, toWarehouse: { select: { code: true } } } } },
      });
      return rows.map((r) => ({ entryId: r.transfer.id, number: r.transfer.number, fromCode: r.transfer.warehouse.code, toCode: r.transfer.toWarehouse?.code ?? "", qty: q3(r.qty) }));
    },
    async listSerials(q, scope) {
      const f = q.filters;
      const inScope: Prisma.SerialNumberWhereInput | undefined = scope
        ? {
            OR: [
              { warehouseId: { in: scope } },
              {
                warehouseId: null,
                movements: { some: { OR: [{ fromWarehouseId: { in: scope } }, { entry: { warehouseId: { in: scope } } }, { entry: { toWarehouseId: { in: scope } } }] } },
              },
            ],
          }
        : undefined;
      const where: Prisma.SerialNumberWhereInput = {
        ...(inScope ?? {}),
        ...(f.productId ? { productId: f.productId } : {}),
        ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}),
        ...(f.status ? { status: f.status as never } : {}),
        ...(q.q ? { serial: { contains: q.q.trim().toUpperCase() } } : {}),
      };
      const [rows, total] = await Promise.all([
        db.serialNumber.findMany({
          where,
          orderBy: [...toOrderBy(q.sort), { id: "asc" }] as Prisma.SerialNumberOrderByWithRelationInput[],
          skip: q.skip,
          take: q.take,
          include: { product: { select: { code: true, name: true } }, warehouse: { select: { code: true } }, project: { select: { code: true } }, customer: { select: { name: true } } },
        }),
        db.serialNumber.count({ where }),
      ]);
      return {
        total,
        items: rows.map((r) => ({
          id: r.id,
          productId: r.productId,
          serial: r.serial,
          status: r.status,
          warehouseId: r.warehouseId,
          projectId: r.projectId,
          customerId: r.customerId,
          supplierId: r.supplierId,
          reservedEntryId: r.reservedEntryId,
          productCode: r.product.code,
          productName: r.product.name,
          warehouseCode: r.warehouse?.code ?? null,
          projectCode: r.project?.code ?? null,
          customerName: r.customer?.name ?? null,
        })),
      };
    },
    async serialHistory(id) {
      const rows = await db.serialMovement.findMany({ where: { serialId: id }, orderBy: { seq: "asc" }, include: { entry: { select: { id: true, number: true, type: true } } } });
      const whIds = [...new Set(rows.flatMap((r) => [r.fromWarehouseId, r.toWarehouseId]).filter((x): x is string => !!x))];
      const whs = new Map((await store.warehouses(whIds)).map((w) => [w.id, w.code]));
      return rows.map((r) => ({ id: r.id, at: r.at, fromStatus: r.fromStatus, toStatus: r.toStatus, entry: r.entry, fromWarehouse: r.fromWarehouseId ? (whs.get(r.fromWarehouseId) ?? null) : null, toWarehouse: r.toWarehouseId ? (whs.get(r.toWarehouseId) ?? null) : null }));
    },

    /* ── attachments ── */
    attachments: (entityType, entityId) => db.attachment.findMany({ where: { entityType, entityId }, include: { uploadedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
    attachment: (id) => db.attachment.findUnique({ where: { id }, include: { uploadedBy: { select: { id: true, name: true } } } }),
    addAttachment: (data) => db.attachment.create({ data, include: { uploadedBy: { select: { id: true, name: true } } } }),
    async deleteAttachment(id) {
      await db.attachment.delete({ where: { id } });
    },
  };
  return store;
}

const serialSelect = { id: true, productId: true, serial: true, status: true, warehouseId: true, projectId: true, customerId: true, supplierId: true, reservedEntryId: true } as const;

type MovementRow = Prisma.StockMovementGetPayload<{ include: { entry: { select: { id: true; number: true; type: true } }; product: { select: { id: true; code: true; name: true } }; warehouse: { select: { id: true; code: true; name: true } } } }>;

function toMovement(r: MovementRow): MovementRecord {
  return {
    id: r.id,
    seq: r.seq.toString(),
    entryId: r.entryId,
    lineId: r.lineId,
    productId: r.productId,
    warehouseId: r.warehouseId,
    condition: r.condition,
    qtyChange: q3(r.qtyChange),
    unitCost: c4(r.unitCost),
    valueChange: m2(r.valueChange),
    balanceAfter: q3(r.balanceAfter),
    avgCostAfter: c4(r.avgCostAfter),
    postedAt: r.postedAt,
    entry: r.entry,
    product: r.product,
    warehouse: r.warehouse,
  };
}

export function prismaInventoryUnitOfWork(client: PrismaClient): InventoryUnitOfWork {
  return {
    store: prismaInventoryStore(client),
    // Generous timeouts: postings wait on row locks under concurrency rather than fail.
    // After every commit: tell readers of derived data (the dashboard cache) that stock changed.
    transaction: async (fn, opts) => {
      const result = await client.$transaction((tx) => fn(prismaInventoryStore(tx)), { timeout: opts?.timeoutMs ?? 30_000, maxWait: 15_000 });
      await publishDataChange("stock");
      return result;
    },
  };
}

