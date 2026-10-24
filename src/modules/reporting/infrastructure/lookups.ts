import type { Db } from "@/shared/db/prisma";
import type { Lookups } from "../application/ports";

/** Read-only option lists and display names for report filters. */
export function prismaLookups(db: Db): Lookups {
  return {
    warehouses: (ids) => db.warehouse.findMany({ where: ids ? { id: { in: ids } } : {}, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),

    async names(kind, id) {
      switch (kind) {
        case "catalog":
          return (await db.catalog.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
        case "category":
          return (await db.category.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
        case "product": {
          const p = await db.product.findUnique({ where: { id }, select: { code: true, name: true } });
          return p ? `${p.code} · ${p.name}` : null;
        }
        case "project": {
          const p = await db.project.findUnique({ where: { id }, select: { code: true, name: true } });
          return p ? `${p.code} · ${p.name}` : null;
        }
        case "supplier":
          return (await db.supplier.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
        case "customer":
          return (await db.customer.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
        case "user":
          return (await db.user.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
      }
    },

    async options(scope) {
      const [warehouses, catalogs, categories, projects, suppliers, customers, users, types] = await Promise.all([
        db.warehouse.findMany({ where: { id: { in: scope } }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
        db.catalog.findMany({ select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
        db.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
        db.project.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
        db.supplier.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
        db.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
        db.user.findMany({ select: { id: true, name: true, username: true }, orderBy: { name: "asc" } }),
        db.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
      ]);
      return { warehouses, catalogs, categories, projects, suppliers, customers, users, recordTypes: types.map((t) => t.entityType) };
    },

    products: (q, limit) =>
      db.product.findMany({
        where: q.trim() ? { OR: [{ code: { contains: q.trim(), mode: "insensitive" } }, { name: { contains: q.trim(), mode: "insensitive" } }, { model: { contains: q.trim(), mode: "insensitive" } }] } : {},
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
        take: limit,
      }),
  };
}
