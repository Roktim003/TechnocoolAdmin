import { Prisma, type PrismaClient } from "@prisma/client";
import { publishDataChange } from "@/shared/events/change-events";
import type { Db } from "@/shared/db/prisma";
import { toOrderBy } from "@/shared/pagination/list-query";
import { dateRangeWhere } from "@/shared/time/dates";
import { AuditService } from "@/modules/audit/application/audit.service";
import { prismaAuditRepository } from "@/modules/audit/infrastructure/prisma-audit.repository";
import type { PoFilters } from "../application/dto";
import type { PoRecord, PoWrite, PurchasingStore, PurchasingUnitOfWork, SupplierRecord } from "../application/ports";
import { OPEN, PRICED } from "../domain/types";

type Dec = Prisma.Decimal | null | undefined;
const q3 = (v: Dec) => (v ? v.toFixed(3) : "0.000");
const m2 = (v: Dec) => (v ? v.toFixed(2) : "0.00");
const c4 = (v: Dec) => (v ? v.toFixed(4) : "0.0000");
const dateOnly = (v: Date) => v.toISOString().slice(0, 10);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
const ENTITY = "PurchaseOrder";

/* ─────────────── suppliers ─────────────── */

type SupplierRow = Prisma.SupplierGetPayload<object>;
function toSupplier({ nameKey: _k, ...s }: SupplierRow, openPoCount = 0): SupplierRecord {
  return { ...s, openPoCount };
}

/* ─────────────── purchase orders ─────────────── */

const ref = { select: { id: true, name: true } } as const;
const HISTORY_ACTIONS = ["create", "submit", "approve", "reject", "mark_sent", "amend", "close", "cancel"];
const poInclude = {
  supplier: { select: { id: true, code: true, name: true, type: true, email: true, isActive: true, address: true, contactPerson: true, phone: true, paymentTermsNote: true } },
  deliverTo: { select: { id: true, code: true, name: true, isActive: true } },
  project: { select: { id: true, code: true, name: true } },
  createdBy: ref,
  approvedBy: ref,
  rejectedBy: ref,
  closedBy: ref,
  cancelledBy: ref,
  lines: {
    orderBy: { lineNo: "asc" },
    include: { product: { select: { id: true, code: true, name: true, status: true, trackSerial: true, unit: { select: { code: true } } } } },
  },
} satisfies Prisma.PurchaseOrderInclude;
type PoRow = Prisma.PurchaseOrderGetPayload<{ include: typeof poInclude }>;

function toPo(r: PoRow, attachmentCount: number): PoRecord {
  return {
    id: r.id,
    number: r.number,
    draftRef: r.draftRef,
    type: r.type,
    status: r.status,
    supplier: r.supplier,
    currency: r.currency,
    exchangeRate: c4(r.exchangeRate),
    poDate: dateOnly(r.poDate),
    expectedDeliveryDate: r.expectedDeliveryDate ? dateOnly(r.expectedDeliveryDate) : null,
    deliverTo: r.deliverTo,
    project: r.project,
    supplierQuoteRef: r.supplierQuoteRef,
    discountAmount: m2(r.discountAmount),
    vatPercent: r.vatPercent.toFixed(2),
    subtotal: m2(r.subtotal),
    vatAmount: m2(r.vatAmount),
    total: m2(r.total),
    totalBdt: m2(r.totalBdt),
    terms: r.terms,
    notes: r.notes,
    revision: r.revision,
    createdBy: r.createdBy,
    approvedBy: r.approvedBy,
    rejectedBy: r.rejectedBy,
    closedBy: r.closedBy,
    cancelledBy: r.cancelledBy,
    submittedAt: r.submittedAt,
    approvedAt: r.approvedAt,
    rejectedAt: r.rejectedAt,
    rejectionReason: r.rejectionReason,
    sentAt: r.sentAt,
    closedAt: r.closedAt,
    closedReason: r.closedReason,
    cancelledAt: r.cancelledAt,
    cancelledReason: r.cancelledReason,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    attachmentCount,
    lines: r.lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      productId: l.productId,
      product: { id: l.product.id, code: l.product.code, name: l.product.name, unitCode: l.product.unit.code, status: l.product.status, trackSerial: l.product.trackSerial },
      qty: q3(l.qty),
      unitPrice: c4(l.unitPrice),
      amount: m2(l.amount),
      receivedQty: q3(l.receivedQty),
      pendingReceiptQty: q3(l.pendingReceiptQty),
      note: l.note,
    })),
  };
}

function header(w: Partial<PoWrite>) {
  const { lines: _l, poDate, expectedDeliveryDate, ...rest } = w;
  return {
    ...rest,
    ...(poDate !== undefined ? { poDate: asDate(poDate) } : {}),
    ...(expectedDeliveryDate !== undefined ? { expectedDeliveryDate: expectedDeliveryDate ? asDate(expectedDeliveryDate) : null } : {}),
  };
}

const linesCreate = (lines: PoWrite["lines"]) => lines.map((l, i) => ({ lineNo: i + 1, productId: l.productId, qty: l.qty, unitPrice: l.unitPrice, amount: l.amount, note: l.note }));

function poWhere(f: PoFilters, scope: { warehouseIds: string[]; today: string }, q?: string): Prisma.PurchaseOrderWhereInput {
  const and: Prisma.PurchaseOrderWhereInput[] = [{ deliverToWarehouseId: { in: scope.warehouseIds } }];
  if (f.status) and.push({ status: f.status as never });
  if (f.supplierId) and.push({ supplierId: f.supplierId });
  if (f.type) and.push({ type: f.type as never });
  if (f.warehouseId) and.push({ deliverToWarehouseId: f.warehouseId });
  if (f.projectId) and.push({ projectId: f.projectId });
  if (f.productId) and.push({ lines: { some: { productId: f.productId } } });
  if (f.receivable) and.push({ status: { in: [...OPEN] } });
  if (f.overdue) and.push({ status: { in: [...OPEN] }, expectedDeliveryDate: { lt: asDate(scope.today) } });
  const range = dateRangeWhere(f.dateFrom, f.dateTo);
  if (range) and.push({ poDate: { ...(range.gte ? { gte: asDate(dateOnlyDhaka(range.gte)) } : {}), ...(range.lte ? { lte: asDate(dateOnlyDhaka(range.lte)) } : {}) } });
  if (q) and.push({ OR: [{ number: { contains: q, mode: "insensitive" } }, { draftRef: { contains: q, mode: "insensitive" } }, { supplierQuoteRef: { contains: q, mode: "insensitive" } }, { supplier: { name: { contains: q, mode: "insensitive" } } }] });
  return { AND: and };
}

/** A Dhaka-day bound (from DateRangeFilters) as YYYY-MM-DD. */
const dateOnlyDhaka = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(d);

/* ─────────────── the store ─────────────── */

export function prismaPurchasingStore(db: Db): PurchasingStore {
  const loadPo = async (id: string) => {
    const r = await db.purchaseOrder.findUnique({ where: { id }, include: poInclude });
    if (!r) return null;
    return toPo(r, await db.attachment.count({ where: { entityType: ENTITY, entityId: id } }));
  };
  const openCounts = async (supplierIds: string[]) => {
    if (!supplierIds.length) return new Map<string, number>();
    const rows = await db.purchaseOrder.groupBy({ by: ["supplierId"], where: { supplierId: { in: supplierIds }, status: { in: [...OPEN] } }, _count: { _all: true } });
    return new Map(rows.map((r) => [r.supplierId, r._count._all]));
  };

  const store: PurchasingStore = {
    tx: db,
    audit: new AuditService(prismaAuditRepository(db)),

    /* ── reference data ── */
    async products(ids) {
      if (!ids.length) return [];
      const rows = await db.product.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, code: true, name: true, status: true, purchaseCost: true, defaultSupplierId: true, unit: { select: { code: true } } } });
      return rows.map((p) => ({ id: p.id, code: p.code, name: p.name, unitCode: p.unit.code, status: p.status, purchaseCost: m2(p.purchaseCost), defaultSupplierId: p.defaultSupplierId }));
    },
    warehouse: (id) => db.warehouse.findUnique({ where: { id }, select: { id: true, code: true, name: true, isActive: true } }),
    warehouses: (ids) => db.warehouse.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true, isActive: true }, orderBy: { code: "asc" } }),
    async project(id) {
      const p = await db.project.findUnique({ where: { id }, select: { id: true, code: true, name: true, isActive: true, status: true } });
      return p;
    },
    async fiscalYearStartMonth() {
      return (await db.inventorySettings.findUnique({ where: { id: 1 }, select: { fiscalYearStartMonth: true } }))?.fiscalYearStartMonth ?? 7;
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
    async settings() {
      const s = await db.purchasingSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
      return { defaultTerms: s.defaultTerms, defaultVatPercent: s.defaultVatPercent.toFixed(2) };
    },
    async updateSettings(data) {
      await db.purchasingSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
      return store.settings();
    },

    /* ── suppliers ── */
    async listSuppliers(q) {
      const f = q.filters;
      const active = f.isActive ?? f.active;
      const where: Prisma.SupplierWhereInput = {
        ...(active !== undefined ? { isActive: active } : {}),
        ...(f.type ? { type: f.type } : {}),
        ...(f.brand ? { brandsSupplied: { contains: f.brand, mode: "insensitive" } } : {}),
        ...(q.q ? { OR: ["name", "code", "contactPerson", "phone", "email", "brandsSupplied"].map((k) => ({ [k]: { contains: q.q, mode: "insensitive" } })) } : {}),
      };
      const [rows, total] = await Promise.all([db.supplier.findMany({ where, orderBy: [...toOrderBy(q.sort), { id: "asc" }], skip: q.skip, take: q.take }), db.supplier.count({ where })]);
      const open = await openCounts(rows.map((r) => r.id));
      return { items: rows.map((r) => toSupplier(r, open.get(r.id) ?? 0)), total };
    },
    async supplier(id) {
      const s = await db.supplier.findUnique({ where: { id } });
      return s ? toSupplier(s, (await openCounts([id])).get(id) ?? 0) : null;
    },
    async supplierNameExists(nameKey, exceptId) {
      return (await db.supplier.count({ where: { nameKey, ...(exceptId ? { id: { not: exceptId } } : {}) } })) > 0;
    },
    async createSupplier(data) {
      return toSupplier(await db.supplier.create({ data }));
    },
    async updateSupplier(id, data) {
      const s = await db.supplier.update({ where: { id }, data });
      return toSupplier(s, (await openCounts([id])).get(id) ?? 0);
    },
    async supplierStats(id) {
      const priced = { supplierId: id, status: { in: [...PRICED] } };
      const [open, count, last, total, products] = await Promise.all([
        db.purchaseOrder.count({ where: { supplierId: id, status: { in: [...OPEN] } } }),
        db.purchaseOrder.count({ where: priced }),
        db.purchaseOrder.findFirst({ where: priced, orderBy: [{ poDate: "desc" }], select: { poDate: true } }),
        db.purchaseOrder.aggregate({ where: priced, _sum: { totalBdt: true } }),
        db.purchaseOrderLine.findMany({ where: { po: priced }, distinct: ["productId"], select: { productId: true } }),
      ]);
      return { openPoCount: open, poCount: count, lastPurchaseDate: last ? dateOnly(last.poDate) : null, totalOrderedBdt: m2(total._sum.totalBdt), productCount: products.length };
    },

    /* ── purchase orders ── */
    po: loadPo,
    async lockPo(id) {
      const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "PurchaseOrder" WHERE id = ${id}::uuid FOR UPDATE`;
      if (!rows.length) return null;
      await db.$queryRaw`SELECT id FROM "PurchaseOrderLine" WHERE "poId" = ${id}::uuid ORDER BY id FOR UPDATE`;
      return loadPo(id);
    },
    async listPos(q, scope) {
      const where = poWhere(q.filters, scope, q.q);
      const order = toOrderBy(q.sort) as Prisma.PurchaseOrderOrderByWithRelationInput[];
      const [rows, total] = await Promise.all([db.purchaseOrder.findMany({ where, include: poInclude, orderBy: [...order, { id: "asc" }], skip: q.skip, take: q.take }), db.purchaseOrder.count({ where })]);
      const counts = rows.length ? await db.attachment.groupBy({ by: ["entityId"], where: { entityType: ENTITY, entityId: { in: rows.map((r) => r.id) } }, _count: { _all: true } }) : [];
      const by = new Map(counts.map((c) => [c.entityId, c._count._all]));
      return { items: rows.map((r) => toPo(r, by.get(r.id) ?? 0)), total };
    },
    async createPo(data) {
      const { lines, draftRef, createdById, ...rest } = data;
      const r = await db.purchaseOrder.create({
        data: { ...(header(rest) as Prisma.PurchaseOrderUncheckedCreateInput), poDate: asDate(data.poDate), draftRef, createdById, lines: { create: linesCreate(lines) } },
        select: { id: true },
      });
      return r.id;
    },
    async replacePo(id, data) {
      await db.purchaseOrderLine.deleteMany({ where: { poId: id } });
      await db.purchaseOrder.update({ where: { id }, data: { ...(header(data) as Prisma.PurchaseOrderUncheckedUpdateInput), lines: { create: linesCreate(data.lines) } } });
    },
    async amendPo(id, h, lines) {
      if (lines.remove.length) await db.purchaseOrderLine.deleteMany({ where: { id: { in: lines.remove }, poId: id } });
      for (const l of lines.update) await db.purchaseOrderLine.update({ where: { id: l.id }, data: { qty: l.qty, unitPrice: l.unitPrice, amount: l.amount, note: l.note } });
      const max = await db.purchaseOrderLine.aggregate({ where: { poId: id }, _max: { lineNo: true } });
      let n = max._max.lineNo ?? 0;
      for (const l of lines.add) await db.purchaseOrderLine.create({ data: { poId: id, lineNo: ++n, productId: l.productId, qty: l.qty, unitPrice: l.unitPrice, amount: l.amount, note: l.note } });
      await db.purchaseOrder.update({ where: { id }, data: header(h) as Prisma.PurchaseOrderUncheckedUpdateInput });
    },
    async updatePo(id, data) {
      await db.purchaseOrder.update({ where: { id }, data: data as Prisma.PurchaseOrderUncheckedUpdateInput });
    },
    async updateLineQty(lineId, data) {
      await db.purchaseOrderLine.update({ where: { id: lineId }, data });
    },
    async addRevision(data) {
      await db.purchaseOrderRevision.create({ data: { ...data, snapshot: data.snapshot as Prisma.InputJsonValue, changes: data.changes as unknown as Prisma.InputJsonValue } });
    },
    async revisions(poId) {
      const rows = await db.purchaseOrderRevision.findMany({ where: { poId }, orderBy: { revision: "desc" }, include: { changedBy: ref } });
      return rows.map((r) => ({ id: r.id, revision: r.revision, changedBy: r.changedBy, reason: r.reason, snapshot: r.snapshot, changes: r.changes as { text: string; price: boolean }[], createdAt: r.createdAt }));
    },
    async history(poId) {
      const rows = await db.auditLog.findMany({
        where: { entityType: "PurchaseOrder", entityId: poId, action: { in: HISTORY_ACTIONS.map((a) => `purchase_order.${a}`) } },
        orderBy: { createdAt: "asc" },
        select: { action: true, createdAt: true, after: true, user: ref },
      });
      return rows.map((r) => ({ action: r.action.slice("purchase_order.".length), at: r.createdAt, by: r.user, after: (r.after as Record<string, unknown> | null) ?? null }));
    },
    async receipts(poId) {
      const rows = await db.stockEntry.findMany({
        where: { purchaseOrderId: poId },
        orderBy: { createdAt: "asc" },
        select: { id: true, number: true, draftRef: true, type: true, status: true, entryDate: true, postedAt: true, createdBy: ref, lines: { select: { qty: true } } },
      });
      return rows.map((r) => ({ id: r.id, number: r.number, draftRef: r.draftRef, type: r.type, status: r.status, entryDate: dateOnly(r.entryDate), postedAt: r.postedAt, createdBy: r.createdBy, totalQty: r.lines.reduce((a, l) => a.plus(l.qty), new Prisma.Decimal(0)).toFixed(3) }));
    },
    async priceHistory(q) {
      const where: Prisma.PurchaseOrderLineWhereInput = {
        ...(q.filters.productId ? { productId: q.filters.productId } : {}),
        po: { status: { in: [...PRICED] }, ...(q.filters.supplierId ? { supplierId: q.filters.supplierId } : {}) },
      };
      const dir = q.sort[0]?.direction ?? "desc";
      const [rows, total] = await Promise.all([
        db.purchaseOrderLine.findMany({
          where,
          orderBy: [{ po: { poDate: dir } }, { po: { number: dir } }, { lineNo: "asc" }],
          skip: q.skip,
          take: q.take,
          include: {
            product: { select: { id: true, code: true, name: true, unit: { select: { code: true } } } },
            po: { select: { id: true, number: true, poDate: true, status: true, currency: true, exchangeRate: true, supplier: { select: { id: true, code: true, name: true } } } },
          },
        }),
        db.purchaseOrderLine.count({ where }),
      ]);
      return {
        total,
        items: rows.map((r) => ({
          poId: r.po.id,
          poNumber: r.po.number,
          poDate: dateOnly(r.po.poDate),
          status: r.po.status,
          supplier: r.po.supplier,
          product: { id: r.product.id, code: r.product.code, name: r.product.name, unitCode: r.product.unit.code },
          currency: r.po.currency,
          qty: q3(r.qty),
          unitPrice: c4(r.unitPrice),
          exchangeRate: c4(r.po.exchangeRate),
        })),
      };
    },
    async lastPrice(productId, supplierId, currency) {
      const r = await db.purchaseOrderLine.findFirst({
        where: { productId, po: { supplierId, currency, status: { in: [...PRICED] } } },
        orderBy: [{ po: { poDate: "desc" } }, { po: { createdAt: "desc" } }],
        select: { unitPrice: true, po: { select: { exchangeRate: true } } },
      });
      return r ? { unitPrice: c4(r.unitPrice), exchangeRate: c4(r.po.exchangeRate) } : null;
    },
    async lastRate(supplierId, currency) {
      const r = await db.purchaseOrder.findFirst({ where: { supplierId, currency, type: "IMPORTED", status: { in: [...PRICED] } }, orderBy: [{ poDate: "desc" }, { createdAt: "desc" }], select: { exchangeRate: true } });
      return r ? c4(r.exchangeRate) : null;
    },
    async overdue(today) {
      const rows = await db.purchaseOrder.findMany({ where: { status: { in: [...OPEN] }, expectedDeliveryDate: { lt: asDate(today) } }, include: poInclude, orderBy: [{ expectedDeliveryDate: "asc" }, { number: "asc" }] });
      return rows.map((r) => toPo(r, 0));
    },

    /* ── attachments ── */
    attachments: (poId) => db.attachment.findMany({ where: { entityType: ENTITY, entityId: poId }, include: { uploadedBy: ref }, orderBy: { createdAt: "asc" } }),
    async attachment(id) {
      const a = await db.attachment.findUnique({ where: { id }, include: { uploadedBy: ref } });
      return a && a.entityType === ENTITY ? a : null;
    },
    addAttachment: (data) => db.attachment.create({ data: { ...data, entityType: ENTITY }, include: { uploadedBy: ref } }),
    async deleteAttachment(id) {
      await db.attachment.delete({ where: { id } });
    },
  };
  return store;
}

export function prismaPurchasingUnitOfWork(client: PrismaClient): PurchasingUnitOfWork {
  return {
    store: prismaPurchasingStore(client),
    transaction: async (fn) => {
      const result = await client.$transaction((tx) => fn(prismaPurchasingStore(tx)), { timeout: 30_000, maxWait: 15_000 });
      await publishDataChange("purchasing");
      return result;
    },
  };
}
