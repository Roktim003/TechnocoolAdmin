/**
 * Idempotent seed: safe to run on every release.
 *  - Warehouses A and B (upserted by code).
 *  - The four default roles. Existing roles are left as edited by Admin, except the locked
 *    Admin role, which is always reset to FULL on every module with all flags.
 *  - The initial Admin user from ADMIN_USERNAME / ADMIN_PASSWORD (created only if missing).
 *  - Catalog: brand catalogs LG / Daikin / Dunham-Bush, categories and units (created if missing;
 *    existing rows are never overwritten, so renames and deactivations made in the app stick).
 *  - Inventory settings (single row, created with defaults if missing).
 *  - Sample suppliers, customers and projects, unless SEED_SAMPLE_DATA=false (created only
 *    while those tables are empty, so nothing is duplicated or overwritten).
 *  - Notification types (labels refreshed every run) and the alert settings row (created once:
 *    low-stock alerts to Admin and Manager, daily digest at 09:00 Asia/Dhaka).
 *  - Projects: with sample data and no project costs yet, two more projects (on hold, completed)
 *    with issued and returned material, labour / transport costs (see seed-projects.ts).
 *  - Purchasing settings (default PO terms). With sample data and no purchase orders yet: a few
 *    sample products and purchase orders in different states (see seed-purchasing.ts).
 *  - Reports: with sample data and no schedules yet, three scheduled emails to the Admin
 *    (see seed-reports.ts).
 */
import { hash as bcryptHash } from "@node-rs/bcrypt";
import { PrismaClient } from "@prisma/client";
import { MODULE_KEYS } from "@/shared/rbac/levels";
import { ADMIN_ROLE_NAME, SEED_ROLES, SEED_WAREHOUSES } from "@/modules/identity/domain/seed-roles";
import { normalizeUsername, PASSWORD_MIN_LENGTH, roleNameKey } from "@/modules/identity/domain/rules";
import { SEED_CATALOGS, SEED_CATEGORIES, SEED_UNITS } from "@/modules/catalog/domain/seed-data";
import { nameKey } from "@/modules/catalog/domain/rules";
import { SAMPLE_CUSTOMERS, SAMPLE_SUPPLIERS } from "@/modules/inventory/domain/seed-data";
import { SAMPLE_PROJECTS } from "@/modules/projects/domain/seed-data";
import { formatProjectCode } from "@/modules/projects/domain/types";
import { NOTIFICATION_TYPES } from "@/modules/notifications/domain/types";
import { formatSupplierCode } from "@/modules/purchasing/domain/types";
import { seedSampleProjects } from "./seed-projects";
import { seedSampleSchedules } from "./seed-reports";
import { seedSamplePurchases } from "./seed-purchasing";

const DEFAULT_PO_TERMS = [
  "1. Prices are fixed for this order.",
  "2. Deliver to the warehouse named above, with a delivery challan quoting this PO number.",
  "3. Goods are subject to inspection on receipt.",
].join("\n");

async function seedNotifications(prisma: PrismaClient, log: (msg: string) => void) {
  for (const [i, t] of NOTIFICATION_TYPES.entries()) {
    const data = { label: t.label, description: t.description, defaultEmail: t.defaultEmail, sortOrder: i };
    await prisma.notificationType.upsert({ where: { key: t.key }, create: { key: t.key, ...data }, update: data });
  }
  if (!(await prisma.alertSettings.findUnique({ where: { id: 1 } }))) {
    const roles = await prisma.role.findMany({ where: { nameKey: { in: [roleNameKey(ADMIN_ROLE_NAME), roleNameKey("Manager")] } }, select: { id: true } });
    await prisma.alertSettings.create({ data: { id: 1, lowStockRoleIds: roles.map((r) => r.id), digestEnabled: true, digestTime: "09:00" } });
    log("alerts: default settings (Admin, Manager; digest 09:00)");
  }
  log(`notifications: ${NOTIFICATION_TYPES.length} types ensured`);
}

async function seedInventory(prisma: PrismaClient, sample: boolean, warehouseId: string | undefined, log: (msg: string) => void) {
  await prisma.inventorySettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  if (!sample) return;
  if ((await prisma.supplier.count()) === 0) {
    await prisma.$transaction(async (tx) => {
      await tx.supplier.createMany({ data: SAMPLE_SUPPLIERS.map((s, i) => ({ ...s, code: formatSupplierCode(i + 1), nameKey: nameKey(s.name) })) });
      // Keep the supplier-code sequence ahead of the sample codes.
      await tx.documentSequence.upsert({
        where: { docType_fiscalYear: { docType: "SUPPLIER", fiscalYear: "ALL" } },
        create: { docType: "SUPPLIER", fiscalYear: "ALL", lastNumber: SAMPLE_SUPPLIERS.length },
        update: { lastNumber: SAMPLE_SUPPLIERS.length },
      });
    });
    log(`inventory: ${SAMPLE_SUPPLIERS.length} sample suppliers`);
  }
  if ((await prisma.customer.count()) === 0) {
    await prisma.customer.createMany({ data: SAMPLE_CUSTOMERS.map((c) => ({ ...c, nameKey: nameKey(c.name) })) });
    log(`inventory: ${SAMPLE_CUSTOMERS.length} sample customers`);
  }
  if ((await prisma.project.count()) === 0) {
    await prisma.$transaction(async (tx) => {
      for (const [i, p] of SAMPLE_PROJECTS.entries()) {
        await tx.project.create({ data: { ...p, startDate: new Date(`${p.startDate}T00:00:00Z`), expectedEndDate: new Date(`${p.expectedEndDate}T00:00:00Z`), code: formatProjectCode(i + 1), defaultWarehouseId: warehouseId ?? null } });
      }
      // Keep the project-code sequence ahead of the sample codes.
      await tx.documentSequence.upsert({
        where: { docType_fiscalYear: { docType: "PROJECT", fiscalYear: "ALL" } },
        create: { docType: "PROJECT", fiscalYear: "ALL", lastNumber: SAMPLE_PROJECTS.length },
        update: { lastNumber: { increment: 0 } },
      });
    });
    log(`projects: ${SAMPLE_PROJECTS.length} sample projects`);
  }
}

async function seedCatalog(prisma: PrismaClient, log: (msg: string) => void) {
  for (const c of SEED_CATALOGS) {
    await prisma.catalog.upsert({ where: { nameKey: nameKey(c.name) }, create: { ...c, nameKey: nameKey(c.name) }, update: {} });
  }
  for (const name of SEED_CATEGORIES) {
    await prisma.category.upsert({ where: { nameKey: nameKey(name) }, create: { name, nameKey: nameKey(name) }, update: {} });
  }
  for (const u of SEED_UNITS) {
    await prisma.unit.upsert({ where: { code: u.code }, create: u, update: {} });
  }
  log(`catalog: ${SEED_CATALOGS.length} catalogs, ${SEED_CATEGORIES.length} categories, ${SEED_UNITS.length} units ensured`);
}

export async function seed(
  prisma: PrismaClient,
  opts: {
    adminUsername: string;
    adminPassword: string;
    adminName: string;
    bcryptRounds: number;
    sampleData?: boolean;
    /** Sample products and purchase orders in different states (fresh demo installs only; off in tests). */
    samplePurchases?: boolean;
    /** Two more sample projects (on hold, completed) with issued / returned material and costs (demo installs only; off in tests). */
    sampleProjects?: boolean;
    /** Three sample scheduled report emails to the Admin (demo installs only; off in tests). */
    sampleSchedules?: boolean;
    log?: (msg: string) => void;
  },
) {
  const log = opts.log ?? (() => {});

  const warehouses = [];
  for (const w of SEED_WAREHOUSES) {
    warehouses.push(await prisma.warehouse.upsert({ where: { code: w.code }, create: w, update: {} }));
  }
  log(`warehouses: ${warehouses.map((w) => w.code).join(", ")}`);

  for (const r of SEED_ROLES) {
    const nameKey = roleNameKey(r.name);
    const existing = await prisma.role.findUnique({ where: { nameKey } });
    if (!existing) {
      await prisma.role.create({
        data: {
          name: r.name,
          nameKey,
          description: r.description,
          isLocked: r.isLocked,
          ...r.flags,
          permissions: { create: MODULE_KEYS.map((m) => ({ module: m, level: r.permissions[m] })) },
        },
      });
      log(`role created: ${r.name}`);
    } else if (r.isLocked) {
      await prisma.$transaction([
        prisma.role.update({ where: { id: existing.id }, data: { isLocked: true, ...r.flags } }),
        ...MODULE_KEYS.map((m) =>
          prisma.rolePermission.upsert({
            where: { roleId_module: { roleId: existing.id, module: m } },
            create: { roleId: existing.id, module: m, level: r.permissions[m] },
            update: { level: r.permissions[m] },
          }),
        ),
      ]);
    }
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { nameKey: roleNameKey(ADMIN_ROLE_NAME) } });
  const username = normalizeUsername(opts.adminUsername);
  const admin = await prisma.user.findUnique({ where: { username } });
  if (!admin) {
    if (opts.adminPassword.length < PASSWORD_MIN_LENGTH) throw new Error(`ADMIN_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    await prisma.user.create({
      data: {
        username,
        name: opts.adminName,
        passwordHash: await bcryptHash(opts.adminPassword, opts.bcryptRounds),
        roleId: adminRole.id,
        warehouses: { create: warehouses.map((w) => ({ warehouseId: w.id })) },
      },
    });
    log(`admin user created: ${username}`);
  } else {
    log(`admin user exists: ${username} (password unchanged)`);
  }

  await seedCatalog(prisma, log);
  await seedInventory(prisma, opts.sampleData ?? true, warehouses[0]?.id, log);
  await seedNotifications(prisma, log);
  await prisma.purchasingSettings.upsert({
    where: { id: 1 },
    create: { id: 1, defaultTerms: DEFAULT_PO_TERMS, defaultVatPercent: 0 },
    update: {},
  });
  if (opts.samplePurchases) await seedSamplePurchases(prisma, log);
  if (opts.sampleProjects) await seedSampleProjects(prisma, log);
  if (opts.sampleSchedules) await seedSampleSchedules(prisma, log);
}

async function main() {
  const { ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_NAME, BCRYPT_ROUNDS } = process.env;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD must be set.");
  const prisma = new PrismaClient();
  try {
    await seed(prisma, {
      adminUsername: ADMIN_USERNAME,
      adminPassword: ADMIN_PASSWORD,
      adminName: ADMIN_NAME || "System Administrator",
      bcryptRounds: Number(BCRYPT_ROUNDS) || 12,
      sampleData: process.env.SEED_SAMPLE_DATA !== "false",
      samplePurchases: process.env.SEED_SAMPLE_DATA !== "false",
      sampleProjects: process.env.SEED_SAMPLE_DATA !== "false",
      sampleSchedules: process.env.SEED_SAMPLE_DATA !== "false",
      log: (m) => console.log(`[seed] ${m}`),
    });
    console.log("[seed] done");
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when executed directly (tests import `seed`).
if (typeof require !== "undefined" && require.main === module) {
  main().catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  });
}
