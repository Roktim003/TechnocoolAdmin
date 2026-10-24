import { Prisma } from "@prisma/client";
import type { Db } from "@/shared/db/prisma";
import type { EntryStatus, EntryType } from "../domain/types";
import type { InventoryProjectQuery, ProjectMaterialRow } from "../application/ports";

const PROJECT_TYPES = ["ISSUE_TO_PROJECT", "RETURN_FROM_SITE"] as const;
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

/** Issues to and returns from a project, and reversals of them (which have the original's project). */
const projectEntryWhere = (projectId: string): Prisma.StockEntryWhereInput => ({
  OR: [
    { projectId, type: { in: [...PROJECT_TYPES] } },
    { type: "REVERSAL", reversalOf: { projectId, type: { in: [...PROJECT_TYPES] } } },
  ],
});

/**
 * Project material straight from the stock ledger: only posted entries have movements, each
 * carrying the unit cost recorded at posting. A reversal's movements belong to the entry it
 * reverses (same project and kind), so reversed entries net out.
 */
export function prismaProjectQuery(db: Db): InventoryProjectQuery {
  return {
    async material(projectIds) {
      if (!projectIds.length) return [];
      const rows = await db.$queryRaw<{ projectId: string; productId: string; kind: string; condition: string; qty: Prisma.Decimal; value: Prisma.Decimal }[]>`
        SELECT COALESCE(o."projectId", e."projectId") AS "projectId", m."productId",
               COALESCE(o.type, e.type)::text AS kind, m.condition::text AS condition,
               SUM(m."qtyChange") AS qty, SUM(m."valueChange") AS value
        FROM "StockMovement" m
        JOIN "StockEntry" e ON e.id = m."entryId"
        LEFT JOIN "StockEntry" o ON o.id = e."reversalOfId" AND e.type = 'REVERSAL'
        WHERE COALESCE(o.type, e.type) IN ('ISSUE_TO_PROJECT', 'RETURN_FROM_SITE')
          AND COALESCE(o."projectId", e."projectId") = ANY(${projectIds}::uuid[])
        GROUP BY 1, 2, 3, 4`;
      const products = new Map(
        (await db.product.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.productId))] } }, select: { id: true, code: true, name: true, trackSerial: true, unit: { select: { code: true } } } })).map((p) => [p.id, p]),
      );
      const zero = new Prisma.Decimal(0);
      const acc = new Map<string, { projectId: string; productId: string; issuedQty: Prisma.Decimal; returnedQty: Prisma.Decimal; returnedDamagedQty: Prisma.Decimal; issuedCost: Prisma.Decimal; returnedCost: Prisma.Decimal }>();
      for (const r of rows) {
        const k = `${r.projectId}|${r.productId}`;
        const a = acc.get(k) ?? { projectId: r.projectId, productId: r.productId, issuedQty: zero, returnedQty: zero, returnedDamagedQty: zero, issuedCost: zero, returnedCost: zero };
        if (r.kind === "ISSUE_TO_PROJECT") {
          // Stock out of the warehouse: negative changes; their reversals come back positive.
          a.issuedQty = a.issuedQty.minus(r.qty);
          a.issuedCost = a.issuedCost.minus(r.value);
        } else {
          a.returnedQty = a.returnedQty.plus(r.qty);
          a.returnedCost = a.returnedCost.plus(r.value);
          if (r.condition === "DAMAGED") a.returnedDamagedQty = a.returnedDamagedQty.plus(r.qty);
        }
        acc.set(k, a);
      }
      const out: ProjectMaterialRow[] = [];
      for (const a of acc.values()) {
        const p = products.get(a.productId);
        if (a.issuedQty.isZero() && a.returnedQty.isZero() && a.issuedCost.isZero() && a.returnedCost.isZero()) continue; // fully reversed
        out.push({
          projectId: a.projectId,
          productId: a.productId,
          product: { code: p?.code ?? "?", name: p?.name ?? "Unknown product", unitCode: p?.unit.code ?? "", trackSerial: p?.trackSerial ?? false },
          issuedQty: a.issuedQty.toFixed(3),
          returnedQty: a.returnedQty.toFixed(3),
          returnedDamagedQty: a.returnedDamagedQty.toFixed(3),
          issuedCost: a.issuedCost.toFixed(2),
          returnedCost: a.returnedCost.toFixed(2),
        });
      }
      return out.sort((x, y) => x.product.code.localeCompare(y.product.code));
    },

    async serialsAtSite(projectId) {
      const rows = await db.serialNumber.findMany({ where: { projectId, status: "ISSUED" }, select: { productId: true, serial: true }, orderBy: [{ productId: "asc" }, { serial: "asc" }] });
      return rows;
    },

    async entries(projectId, page, filters = {}) {
      const where: Prisma.StockEntryWhereInput = {
        AND: [projectEntryWhere(projectId), { status: filters.status ? (filters.status as EntryStatus) : { not: "DRAFT" } }, ...(filters.type ? [{ type: filters.type as EntryType }] : [])],
      };
      const [items, total] = await Promise.all([
        db.stockEntry.findMany({
          where,
          orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
          skip: page.skip,
          take: page.take,
          select: {
            id: true,
            number: true,
            draftRef: true,
            type: true,
            status: true,
            entryDate: true,
            costTotal: true,
            postedAt: true,
            warehouse: { select: { id: true, code: true, name: true } },
            createdBy: { select: { id: true, name: true } },
            reversalOf: { select: { id: true, number: true, type: true } },
            lines: { select: { qty: true } },
          },
        }),
        db.stockEntry.count({ where }),
      ]);
      return {
        total,
        items: items.map((e) => ({
          id: e.id,
          number: e.number,
          draftRef: e.draftRef,
          type: e.type,
          status: e.status,
          entryDate: dateOnly(e.entryDate),
          warehouse: e.warehouse,
          itemCount: e.lines.length,
          totalQty: e.lines.reduce((s, l) => s.plus(l.qty), new Prisma.Decimal(0)).toFixed(3),
          costTotal: e.costTotal.toFixed(2),
          reversalOf: e.reversalOf,
          createdBy: e.createdBy,
          postedAt: e.postedAt,
        })),
      };
    },

    async openEntries(projectId) {
      return db.stockEntry.findMany({
        where: { projectId, OR: [{ status: "PENDING" }, { type: "TRANSFER", status: "DISPATCHED" }] },
        select: { id: true, number: true, draftRef: true, type: true, status: true },
        orderBy: { createdAt: "asc" },
      });
    },
  };
}
