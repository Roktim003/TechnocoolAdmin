/// <reference types="vite/client" />
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { hasLevel, type ModuleKey, type PermissionLevel, type SensitiveFlag } from "@/shared/rbac/levels";
import { SEED_ROLES } from "@/modules/identity/domain/seed-roles";
import { call } from "../helpers/http";
import { resetDatabase, prisma, roleId } from "../helpers/db";
import { adminToken, createUser, loginMobile } from "../helpers/fixtures";
import { createEntry, grn, product, wh } from "../helpers/inventory";
import { createCount } from "../helpers/control";
import { resetEnvCache } from "@/shared/config/env";
import { po } from "../helpers/purchasing";

/*
 * Authorization matrix: EVERY endpoint × every seeded role, plus a Store Manager limited to the
 * other warehouse and an anonymous caller.
 *
 * - The route list comes from the file system (import.meta.glob): a route or method that is not
 *   in MATRIX below fails the test, so a new endpoint can't ship without an authorization rule.
 * - Each rule states the permission the endpoint needs. Roles without it must get 403; the
 *   anonymous caller 401; roles with it must get past authorization (never 401/403). Public
 *   endpoints (login, refresh, health, signed downloads) must answer every caller the same.
 * - `scoped` endpoints read a Warehouse A object: the Store Manager of Warehouse B must get 403 or
 *   404 even though the role allows the endpoint (object-level authorization).
 * - Mutations use random ids or empty bodies, so allowed callers stop at 400 / 404 / 422 and the
 *   fixtures don't change. The exact status of every cell is kept in
 *   docs/authorization-matrix.md (a reviewed snapshot: `npx vitest run -u` after a deliberate change).
 */

// Hundreds of calls per user in a few seconds: lift the per-user rate limit for this file only.
process.env.RATE_LIMIT_API_PER_MINUTE = "100000";
process.env.RATE_LIMIT_EXPORTS_PER_MINUTE = "100000";
resetEnvCache(); // the setup file already parsed the environment

type Who = "anonymous" | "admin" | "accounts" | "manager" | "store" | "storeB";
const ROLE_OF: Record<Exclude<Who, "anonymous">, string> = { admin: "Admin", accounts: "Accounts", manager: "Manager", store: "Store Manager", storeB: "Store Manager" };
const PRINCIPALS: Who[] = ["anonymous", "admin", "accounts", "manager", "store", "storeB"];

type Need = [ModuleKey, PermissionLevel];
interface Rule {
  /** Route-level permission; "auth" = any signed-in user; "public" = no sign-in. */
  need: Need | "auth" | "public";
  /** Alternative permissions (any one is enough). */
  any?: Need[];
  /** Also needs this sensitive-field flag. */
  flag?: SensitiveFlag;
  /** Reads an object in Warehouse A: the Warehouse B store manager must be refused. */
  scoped?: boolean;
  /** Path parameter values (fixture names start with @); others get a random UUID. */
  params?: Record<string, string>;
  query?: Record<string, string>;
}

const v = (m: ModuleKey, l: PermissionLevel): Need => [m, l];
const PUBLIC: Rule = { need: "public" };
const AUTH: Rule = { need: "auth" };
const ADMIN: Rule = { need: v("users", "FULL") };

/* Every endpoint. Keys are "METHOD /path/as/in/the/app/folder". */
const MATRIX: Record<string, Rule> = {
  "GET /docs": PUBLIC,
  "GET /v1/openapi.json": PUBLIC,
  "GET /v1/health": PUBLIC,
  "GET /v1/health/ready": PUBLIC,

  // identity
  "POST /v1/auth/login": PUBLIC,
  "POST /v1/auth/refresh": PUBLIC,
  "POST /v1/auth/logout": PUBLIC,
  "GET /v1/auth/me": AUTH,
  "GET /v1/users": ADMIN,
  "POST /v1/users": ADMIN,
  "GET /v1/users/[id]": { ...ADMIN, params: { id: "@storeUser" } },
  "PATCH /v1/users/[id]": ADMIN,
  "POST /v1/users/[id]/disable": ADMIN,
  "POST /v1/users/[id]/enable": ADMIN,
  "POST /v1/users/[id]/password": ADMIN,
  "POST /v1/users/[id]/logout-all": ADMIN,
  "GET /v1/roles": ADMIN,
  "POST /v1/roles": ADMIN,
  "GET /v1/roles/matrix": ADMIN,
  "GET /v1/roles/[id]": { ...ADMIN, params: { id: "@accountsRole" } },
  "PATCH /v1/roles/[id]": ADMIN,
  "DELETE /v1/roles/[id]": ADMIN,
  "GET /v1/warehouses": AUTH,
  "GET /v1/login-history": ADMIN,
  "GET /v1/audit-logs": ADMIN,

  // catalog
  "GET /v1/products": { need: v("catalog", "VIEW") },
  "POST /v1/products": { need: v("catalog", "CREATE") },
  "GET /v1/products/[id]": { need: v("catalog", "VIEW"), params: { id: "@product" } },
  "PATCH /v1/products/[id]": { need: v("catalog", "FULL") },
  "POST /v1/products/[id]/discontinue": { need: v("catalog", "FULL") },
  "POST /v1/products/[id]/reactivate": { need: v("catalog", "FULL") },
  "GET /v1/products/[id]/history": { need: v("catalog", "VIEW"), params: { id: "@product" } },
  "GET /v1/products/[id]/price-history": { need: "auth", any: [v("purchasing", "VIEW"), v("catalog", "VIEW")], flag: "seeCost", params: { id: "@product" } },
  "POST /v1/products/[id]/photos": { need: v("catalog", "CREATE") },
  "PATCH /v1/products/[id]/photos/[photoId]": { need: v("catalog", "CREATE") },
  "DELETE /v1/products/[id]/photos/[photoId]": { need: v("catalog", "CREATE") },
  "GET /v1/products/[id]/photos/[photoId]/file": { need: v("catalog", "VIEW") },
  "GET /v1/products/by-code/[code]": { need: v("catalog", "VIEW"), params: { code: "@productCode" } },
  "GET /v1/products/by-barcode/[barcode]": { need: v("catalog", "VIEW"), params: { barcode: "0000000000000" } },
  "GET /v1/products/check-code": { need: v("catalog", "VIEW"), query: { code: "NEW-CODE-1" } },
  "GET /v1/products/export": { need: v("catalog", "FULL") },
  "POST /v1/products/import": { need: v("catalog", "FULL") },
  "GET /v1/products/import/template": { need: v("catalog", "FULL") },
  "GET /v1/products/import/[jobId]": { need: v("catalog", "FULL") },
  "GET /v1/catalogs": { need: v("catalog", "VIEW") },
  "POST /v1/catalogs": { need: v("catalog", "FULL") },
  "PATCH /v1/catalogs/[id]": { need: v("catalog", "FULL") },
  "DELETE /v1/catalogs/[id]": { need: v("catalog", "FULL") },
  "GET /v1/categories": { need: v("catalog", "VIEW") },
  "POST /v1/categories": { need: v("catalog", "FULL") },
  "PATCH /v1/categories/[id]": { need: v("catalog", "FULL") },
  "DELETE /v1/categories/[id]": { need: v("catalog", "FULL") },
  "GET /v1/units": { need: v("catalog", "VIEW") },
  "POST /v1/units": { need: v("catalog", "FULL") },
  "PATCH /v1/units/[id]": { need: v("catalog", "FULL") },

  // inventory: entries
  "GET /v1/stock-entries": { need: v("inventory", "VIEW") },
  "POST /v1/stock-entries": { need: v("inventory", "CREATE") },
  "POST /v1/stock-entries/calculate": { need: v("inventory", "CREATE") },
  "GET /v1/stock-entries/[id]": { need: v("inventory", "VIEW"), scoped: true, params: { id: "@entryA" } },
  "PATCH /v1/stock-entries/[id]": { need: v("inventory", "CREATE") },
  "POST /v1/stock-entries/[id]/submit": { need: v("inventory", "CREATE") },
  "POST /v1/stock-entries/[id]/post": { need: v("inventory", "FULL") },
  "POST /v1/stock-entries/[id]/approve": { need: v("inventory", "APPROVE"), scoped: true, params: { id: "@pendingA" } },
  "POST /v1/stock-entries/[id]/reject": { need: v("inventory", "APPROVE"), scoped: true, params: { id: "@pendingA" } },
  "POST /v1/stock-entries/[id]/cancel": { need: v("inventory", "CREATE") },
  "POST /v1/stock-entries/[id]/reverse": { need: v("inventory", "FULL") },
  "POST /v1/stock-entries/[id]/receive": { need: v("inventory", "CREATE") },
  "PUT /v1/stock-entries/[id]/landed-cost": { need: v("inventory", "APPROVE") },
  "GET /v1/stock-entries/[id]/attachments": { need: v("inventory", "VIEW"), scoped: true, params: { id: "@entryA" } },
  "POST /v1/stock-entries/[id]/attachments": { need: v("inventory", "CREATE") },
  "GET /v1/stock-entries/[id]/attachments/[attachmentId]": { need: v("inventory", "VIEW") },
  "DELETE /v1/stock-entries/[id]/attachments/[attachmentId]": { need: v("inventory", "CREATE") },
  "POST /v1/stock-entries/[id]/documents": { need: v("inventory", "VIEW"), scoped: true, params: { id: "@entryA" } },
  "GET /v1/documents/[jobId]": AUTH,
  "GET /v1/stock/balances": { need: v("inventory", "VIEW") },
  "GET /v1/stock/availability": { need: v("inventory", "VIEW"), scoped: true, query: { productId: "@product", warehouseId: "@whA" } },
  "GET /v1/stock/movements": { need: v("inventory", "VIEW") },
  "GET /v1/stock/products/[productId]": { need: v("inventory", "VIEW"), params: { productId: "@product" } },
  "GET /v1/stock/low-stock": { need: v("inventory", "VIEW") },
  "GET /v1/stock/low-stock/export": { need: v("inventory", "VIEW") },
  "GET /v1/serials": { need: v("inventory", "VIEW") },
  "GET /v1/serials/[id]": { need: v("inventory", "VIEW"), scoped: true, params: { id: "@serialA" } },
  "GET /v1/inventory-settings": { need: v("inventory", "FULL") },
  "PATCH /v1/inventory-settings": { need: v("inventory", "FULL") },
  "GET /v1/alert-settings": { need: v("inventory", "FULL") },
  "PATCH /v1/alert-settings": { need: v("inventory", "FULL") },

  // inventory: counts and opening stock
  "GET /v1/stock-counts": { need: v("inventory", "VIEW") },
  "POST /v1/stock-counts": { need: v("inventory", "CREATE") },
  "GET /v1/stock-counts/[id]": { need: v("inventory", "VIEW"), scoped: true, params: { id: "@countA" } },
  "PATCH /v1/stock-counts/[id]": { need: v("inventory", "CREATE") },
  "POST /v1/stock-counts/[id]/start": { need: v("inventory", "CREATE") },
  "PUT /v1/stock-counts/[id]/lines/[lineId]": { need: v("inventory", "CREATE") },
  "POST /v1/stock-counts/[id]/submit": { need: v("inventory", "CREATE") },
  "POST /v1/stock-counts/[id]/approve": { need: v("inventory", "APPROVE") },
  "POST /v1/stock-counts/[id]/request-recount": { need: v("inventory", "APPROVE") },
  "POST /v1/stock-counts/[id]/cancel": { need: v("inventory", "CREATE") },
  "GET /v1/stock-counts/[id]/variance": { need: v("inventory", "VIEW"), scoped: true, params: { id: "@countA" } },
  "GET /v1/stock-counts/[id]/sheet": { need: v("inventory", "VIEW"), scoped: true, params: { id: "@countA" } },
  "GET /v1/opening-stock/template": { need: v("inventory", "FULL") },
  "GET /v1/opening-stock/imports": { need: v("inventory", "FULL") },
  "POST /v1/opening-stock/imports": { need: v("inventory", "FULL") },
  "GET /v1/opening-stock/imports/[id]": { need: v("inventory", "FULL") },
  "POST /v1/opening-stock/imports/[id]/commit": { need: v("inventory", "FULL") },
  "GET /v1/opening-stock/warehouses": { need: v("inventory", "FULL") },
  "POST /v1/warehouses/[id]/lock-opening": { need: v("inventory", "FULL") },
  "POST /v1/warehouses/[id]/unlock-opening": { need: v("inventory", "FULL") },

  // masters
  "GET /v1/customers": { need: v("inventory", "VIEW") },
  "POST /v1/customers": { need: v("inventory", "FULL") },
  "GET /v1/customers/[id]": { need: v("inventory", "VIEW"), params: { id: "@customer" } },
  "PATCH /v1/customers/[id]": { need: v("inventory", "FULL") },
  "POST /v1/customers/[id]/deactivate": { need: v("inventory", "FULL") },
  "GET /v1/suppliers": { need: "auth", any: [v("purchasing", "VIEW"), v("inventory", "VIEW")] },
  "POST /v1/suppliers": { need: v("purchasing", "FULL") },
  "GET /v1/suppliers/[id]": { need: "auth", any: [v("purchasing", "VIEW"), v("inventory", "VIEW")], params: { id: "@supplier" } },
  "PATCH /v1/suppliers/[id]": { need: v("purchasing", "FULL") },
  "POST /v1/suppliers/[id]/deactivate": { need: v("purchasing", "FULL") },
  "GET /v1/suppliers/[id]/purchase-orders": { need: v("purchasing", "VIEW"), params: { id: "@supplier" } },
  "GET /v1/suppliers/[id]/price-history": { need: v("purchasing", "VIEW"), params: { id: "@supplier" } },

  // purchasing
  "GET /v1/purchase-orders": { need: v("purchasing", "VIEW") },
  "POST /v1/purchase-orders": { need: v("purchasing", "CREATE") },
  "POST /v1/purchase-orders/calculate": { need: v("purchasing", "CREATE") },
  "POST /v1/purchase-orders/from-low-stock": { need: v("purchasing", "CREATE") },
  "GET /v1/purchase-orders/receivable": { need: "auth", any: [v("purchasing", "VIEW"), v("inventory", "CREATE")] },
  "GET /v1/purchase-orders/[id]": { need: v("purchasing", "VIEW"), params: { id: "@poA" } },
  "PATCH /v1/purchase-orders/[id]": { need: v("purchasing", "CREATE") },
  "POST /v1/purchase-orders/[id]/submit": { need: v("purchasing", "CREATE") },
  "POST /v1/purchase-orders/[id]/approve": { need: v("purchasing", "APPROVE") },
  "POST /v1/purchase-orders/[id]/reject": { need: v("purchasing", "APPROVE") },
  "POST /v1/purchase-orders/[id]/mark-sent": { need: v("purchasing", "APPROVE") },
  "POST /v1/purchase-orders/[id]/close": { need: v("purchasing", "APPROVE") },
  "POST /v1/purchase-orders/[id]/cancel": { need: v("purchasing", "APPROVE") },
  "POST /v1/purchase-orders/[id]/amend": { need: v("purchasing", "APPROVE") },
  "POST /v1/purchase-orders/[id]/email": { need: v("purchasing", "APPROVE") },
  "POST /v1/purchase-orders/[id]/documents": { need: v("purchasing", "VIEW") },
  "GET /v1/purchase-orders/[id]/receivable": { need: "auth", any: [v("purchasing", "VIEW"), v("inventory", "CREATE")], scoped: true, params: { id: "@poA" } },
  "GET /v1/purchase-orders/[id]/attachments": { need: v("purchasing", "VIEW"), params: { id: "@poA" } },
  "POST /v1/purchase-orders/[id]/attachments": { need: v("purchasing", "CREATE") },
  "GET /v1/purchase-orders/[id]/attachments/[attachmentId]": { need: v("purchasing", "VIEW") },
  "DELETE /v1/purchase-orders/[id]/attachments/[attachmentId]": { need: v("purchasing", "CREATE") },
  "GET /v1/purchasing-settings": { need: v("purchasing", "VIEW") },
  "PATCH /v1/purchasing-settings": { need: v("purchasing", "FULL") },

  // projects
  "GET /v1/projects": { need: v("projects", "VIEW") },
  "POST /v1/projects": { need: v("projects", "CREATE") },
  "GET /v1/projects/options": { need: "auth", any: [v("inventory", "CREATE"), v("projects", "VIEW"), v("purchasing", "CREATE")] },
  "GET /v1/projects/site-engineers": { need: v("projects", "CREATE") },
  "GET /v1/projects/[id]": { need: v("projects", "VIEW"), params: { id: "@project" } },
  "PATCH /v1/projects/[id]": { need: v("projects", "CREATE") },
  "POST /v1/projects/[id]/deactivate": { need: v("projects", "FULL") },
  "POST /v1/projects/[id]/status": { need: v("projects", "CREATE") },
  "GET /v1/projects/[id]/status-history": { need: v("projects", "VIEW"), params: { id: "@project" } },
  "GET /v1/projects/[id]/activity": { need: v("projects", "VIEW"), params: { id: "@project" } },
  "GET /v1/projects/[id]/material": { need: v("projects", "VIEW"), params: { id: "@project" } },
  "GET /v1/projects/[id]/movements": { need: v("projects", "VIEW"), params: { id: "@project" } },
  "GET /v1/projects/[id]/costs": { need: v("projects", "VIEW"), params: { id: "@project" } },
  "POST /v1/projects/[id]/costs": { need: v("projects", "CREATE") },
  "POST /v1/projects/[id]/costs/[costId]/void": { need: v("projects", "FULL") },
  "GET /v1/projects/[id]/costs/[costId]/attachments": { need: v("projects", "VIEW") },
  "POST /v1/projects/[id]/costs/[costId]/attachments": { need: v("projects", "CREATE") },
  "GET /v1/projects/[id]/costs/[costId]/attachments/[attachmentId]": { need: v("projects", "VIEW") },
  "DELETE /v1/projects/[id]/costs/[costId]/attachments/[attachmentId]": { need: v("projects", "CREATE") },
  "GET /v1/projects/[id]/attachments": { need: v("projects", "VIEW"), params: { id: "@project" } },
  "POST /v1/projects/[id]/attachments": { need: v("projects", "CREATE") },
  "GET /v1/projects/[id]/attachments/[attachmentId]": { need: v("projects", "VIEW") },
  "DELETE /v1/projects/[id]/attachments/[attachmentId]": { need: v("projects", "CREATE") },
  "POST /v1/projects/[id]/documents": { need: v("projects", "VIEW") },

  // reports and dashboard
  "GET /v1/reports": { need: v("reports", "VIEW") },
  "GET /v1/reports/[id]/run": { need: v("reports", "VIEW"), params: { id: "stock-summary" } },
  "POST /v1/reports/[id]/exports": { need: v("reports", "VIEW"), params: { id: "stock-summary" } },
  "GET /v1/reports/lookups": { need: v("reports", "VIEW") },
  "GET /v1/reports/lookups/products": { need: v("reports", "VIEW") },
  "GET /v1/exports/[jobId]": { need: v("reports", "VIEW") },
  "GET /v1/exports/[jobId]/download": PUBLIC,
  "GET /v1/report-schedules": { need: v("reports", "VIEW") },
  "POST /v1/report-schedules": { need: v("reports", "VIEW") },
  "GET /v1/report-schedules/[id]": { need: v("reports", "VIEW") },
  "PATCH /v1/report-schedules/[id]": { need: v("reports", "VIEW") },
  "DELETE /v1/report-schedules/[id]": { need: v("reports", "VIEW") },
  "POST /v1/report-schedules/[id]/pause": { need: v("reports", "VIEW") },
  "POST /v1/report-schedules/[id]/resume": { need: v("reports", "VIEW") },
  "POST /v1/report-schedules/[id]/run-now": { need: v("reports", "VIEW") },
  "GET /v1/report-schedules/[id]/runs": { need: v("reports", "VIEW") },
  "GET /v1/report-schedules/[id]/runs/[runId]/files/[index]": { need: v("reports", "VIEW"), params: { index: "0" } },
  "GET /v1/dashboard": { need: v("dashboard", "VIEW") },

  // notifications (own inbox only)
  "GET /v1/notifications": AUTH,
  "GET /v1/notifications/unread-count": AUTH,
  "POST /v1/notifications/[id]/read": AUTH,
  "POST /v1/notifications/read-all": AUTH,
  "GET /v1/notification-preferences": AUTH,
  "PATCH /v1/notification-preferences": AUTH,

  // system (Module 7)
  "GET /v1/system/health": ADMIN,
  "GET /v1/system/backups": ADMIN,
  "POST /v1/system/backups": ADMIN,
  "POST /v1/system/restore-tests": ADMIN,
  "GET /v1/system/integrity-checks": ADMIN,
  "POST /v1/system/integrity-checks": ADMIN,
  "GET /v1/system/jobs": ADMIN,
  "GET /v1/system/jobs/[queue]/failed": { ...ADMIN, params: { queue: "email" } },
  "POST /v1/system/jobs/[queue]/[jobId]/retry": { ...ADMIN, params: { queue: "email", jobId: "missing-job" } },
};

/* ── routes on disk ── */

type RouteModule = Record<string, unknown>;
const ROUTE_FILES = import.meta.glob<RouteModule>("/src/app/api/**/route.ts");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

async function discover(): Promise<{ key: string; method: string; path: string; handler: (...a: never[]) => Promise<Response> }[]> {
  const out = [];
  for (const [file, load] of Object.entries(ROUTE_FILES)) {
    const path = file.replace(/^\/src\/app\/api/, "").replace(/\/route\.ts$/, "");
    const mod = await load();
    for (const m of METHODS) if (typeof mod[m] === "function") out.push({ key: `${m} ${path}`, method: m, path, handler: mod[m] as (...a: never[]) => Promise<Response> });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/* ── expectations ── */

const PERMS = Object.fromEntries(SEED_ROLES.map((r) => [r.name, r]));

function allowed(rule: Rule, who: Who): boolean {
  if (rule.need === "public") return true;
  if (who === "anonymous") return false;
  const role = PERMS[ROLE_OF[who]]!;
  const ok = (n: Need) => hasLevel(role.permissions[n[0]], n[1]);
  if (rule.need !== "auth" && !ok(rule.need)) return false;
  if (rule.any && !rule.any.some(ok)) return false;
  if (rule.flag && !role.flags[rule.flag]) return false;
  return true;
}

type Expect = "public" | "401" | "403" | "scope" | "allow";
function expectation(rule: Rule, who: Who): Expect {
  if (rule.need === "public") return "public";
  if (who === "anonymous") return "401";
  if (!allowed(rule, who)) return "403";
  if (rule.scoped && who === "storeB") return "scope";
  return "allow";
}

/* ── fixtures ── */

const fx: Record<string, string> = {};
const tokens: Partial<Record<Who, string>> = {};
let routes: Awaited<ReturnType<typeof discover>> = [];
const results: { key: string; statuses: Record<Who, number> }[] = [];

beforeAll(async () => {
  await resetDatabase();
  const admin = await adminToken();
  tokens.admin = admin;
  for (const [who, role, whs] of [
    ["accounts", "Accounts", ["A", "B"]],
    ["manager", "Manager", ["A", "B"]],
    ["store", "Store Manager", ["A"]],
    ["storeB", "Store Manager", ["B"]],
  ] as const) {
    const u = await createUser(admin, { role, warehouses: [...whs], username: `matrix.${who.toLowerCase()}` });
    tokens[who] = (await loginMobile(u.username, u.password)).accessToken;
    if (who === "store") fx.storeUser = u.id;
  }

  const A = await wh("A");
  fx.whA = A;
  const p = await product(admin);
  const s = await product(admin, { trackSerial: true });
  fx.product = p.id;
  fx.productCode = p.code;
  const entry = await grn(admin, A, [{ productId: p.id, qty: 10, unitPrice: "100" }]);
  fx.entryA = entry.id;
  await grn(admin, A, [{ productId: s.id, qty: 1, unitPrice: "500", serials: ["MX-SERIAL-1"] }]);
  fx.serialA = (await prisma.serialNumber.findFirstOrThrow({ where: { serial: "MX-SERIAL-1" } })).id;
  const pending = await createEntry(tokens.store!, { action: "submit", type: "DAMAGE_WRITE_OFF", warehouseId: A, reason: "Broken in storage", lines: [{ productId: p.id, qty: 1 }] });
  expect(pending.status).toBe(201);
  fx.pendingA = pending.body.data.id;
  fx.countA = (await createCount(admin, { warehouseId: A, scope: "SELECTED_PRODUCTS", scopeIds: [p.id] })).id;
  fx.poA = (await po(admin, { supplierId: (await prisma.supplier.findFirstOrThrow()).id, deliverToWarehouseId: A, lines: [{ productId: p.id, qty: 5, unitPrice: 100 }] })).id;
  fx.project = (await prisma.project.findFirstOrThrow()).id;
  fx.customer = (await prisma.customer.findFirstOrThrow()).id;
  fx.supplier = (await prisma.supplier.findFirstOrThrow()).id;
  fx.accountsRole = await roleId("Accounts");

  routes = await discover();
}, 180_000);

function resolve(rule: Rule, path: string) {
  const params: Record<string, string> = {};
  let url = path.replace(/^\/v1/, "");
  for (const [, name] of path.matchAll(/\[(\w+)\]/g)) {
    const given = rule.params?.[name!];
    const value = given ? (given.startsWith("@") ? fx[given.slice(1)]! : given) : randomUUID();
    params[name!] = value;
    url = url.replace(`[${name}]`, value);
  }
  const query = Object.fromEntries(Object.entries(rule.query ?? {}).map(([k, val]) => [k, val.startsWith("@") ? fx[val.slice(1)]! : val]));
  return { params, url, query };
}

describe("authorization matrix", () => {
  it("covers every route and method on disk, and nothing that doesn't exist", () => {
    const onDisk = routes.map((r) => r.key);
    const missing = onDisk.filter((k) => !MATRIX[k]);
    const stale = Object.keys(MATRIX).filter((k) => !onDisk.includes(k));
    expect(missing, "routes without an authorization rule: add them to MATRIX").toEqual([]);
    expect(stale, "rules for routes that no longer exist").toEqual([]);
    expect(onDisk.length).toBeGreaterThan(190);
  });

  it("gives every principal exactly what its role allows, on every endpoint", async () => {
    const failures: string[] = [];
    for (const r of routes) {
      const rule = MATRIX[r.key]!;
      const statuses = {} as Record<Who, number>;
      for (const who of PRINCIPALS) {
        const { params, url, query } = resolve(rule, r.path);
        const res = await call(r.handler as never, r.method, url, {
          token: who === "anonymous" ? undefined : tokens[who],
          params,
          query,
          body: r.method === "GET" || r.method === "DELETE" ? undefined : {},
          headers: { "Idempotency-Key": `matrix-${randomUUID()}` },
        });
        statuses[who] = res.status;
        const exp = expectation(rule, who);
        const ok =
          exp === "public" ? res.status < 500 || r.key === "GET /v1/health/ready" :
          exp === "401" ? res.status === 401 :
          exp === "403" ? res.status === 403 :
          exp === "scope" ? res.status === 403 || res.status === 404 :
          res.status !== 401 && res.status !== 403 && res.status < 500;
        if (!ok) failures.push(`${r.key} as ${who}: expected ${exp}, got ${res.status} ${JSON.stringify(res.body?.error ?? "").slice(0, 160)}`);
      }
      // Public endpoints ignore the bearer token: every caller gets the same answer.
      if (rule.need === "public" && new Set(Object.values(statuses)).size > 1) failures.push(`${r.key}: public endpoint answers differently per caller ${JSON.stringify(statuses)}`);
      results.push({ key: r.key, statuses });
    }
    expect(failures).toEqual([]);
  }, 600_000);

  it("matches the reviewed status table (docs/authorization-matrix.md)", async () => {
    const header = `# Authorization matrix\n\nGenerated by \`tests/integration/authorization-matrix.test.ts\` (CI fails if a status changes; run \`npx vitest run tests/integration/authorization-matrix.test.ts -u\` after a deliberate change and review the diff).\n\nEach endpoint is called as nobody, as each seeded role and as a Store Manager limited to Warehouse B, against fixtures in Warehouse A. Mutations use random ids or empty bodies, so allowed callers stop at validation (400), not found (404) or a business rule (422) — never 401/403. **401** = not signed in, **403** = role lacks the permission or the object is in another warehouse, **404** = not found (or hidden).\n\n| Endpoint | Rule | Anonymous | Admin | Accounts | Manager | Store Mgr (A) | Store Mgr (B only) |\n|---|---|---|---|---|---|---|---|\n`;
    const ruleText = (rule: Rule) => {
      const need = rule.need === "public" ? "public" : rule.need === "auth" ? "signed in" : `${rule.need[0]} ≥ ${rule.need[1]}`;
      const any = rule.any ? ` (any of ${rule.any.map((n) => `${n[0]} ≥ ${n[1]}`).join(", ")})` : "";
      return `${need}${any}${rule.flag ? ` + ${rule.flag}` : ""}${rule.scoped ? " · warehouse-scoped" : ""}`;
    };
    const rows = results.map(({ key, statuses }) => `| \`${key.replace("/v1", "/api/v1").replace(/^GET \/docs$/, "GET /api/docs")}\` | ${ruleText(MATRIX[key]!)} | ${PRINCIPALS.map((w) => statuses[w]).join(" | ")} |`);
    await expect(`${header}${rows.join("\n")}\n`).toMatchFileSnapshot("../../docs/authorization-matrix.md");
  });
});
