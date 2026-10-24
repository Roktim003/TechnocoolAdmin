import { beforeEach, describe, expect, it } from "vitest";
import * as rolesRoute from "@/app/api/v1/roles/route";
import * as roleRoute from "@/app/api/v1/roles/[id]/route";
import * as matrixRoute from "@/app/api/v1/roles/matrix/route";
import * as meRoute from "@/app/api/v1/auth/me/route";
import * as usersRoute from "@/app/api/v1/users/route";
import { call } from "../helpers/http";
import { prisma, resetDatabase, roleId } from "../helpers/db";
import { adminToken, createUser, loginMobile } from "../helpers/fixtures";

let token: string;

beforeEach(async () => {
  await resetDatabase();
  token = await adminToken();
});

const createRole = (body: Record<string, unknown>) => call(rolesRoute.POST, "POST", "/roles", { token, body });
const patchRole = (id: string, body: Record<string, unknown>) => call(roleRoute.PATCH, "PATCH", `/roles/${id}`, { token, params: { id }, body });
const deleteRole = (id: string) => call(roleRoute.DELETE, "DELETE", `/roles/${id}`, { token, params: { id } });

describe("seeded roles", () => {
  it("match the approved permission matrix", async () => {
    const res = await call(matrixRoute.GET, "GET", "/roles/matrix", { token });
    expect(res.status).toBe(200);
    expect(res.body.data.modules.map((m: any) => m.key)).toEqual(["dashboard", "catalog", "inventory", "purchasing", "projects", "reports", "users"]);
    const byName = Object.fromEntries(res.body.data.roles.map((r: any) => [r.name, r]));
    expect(Object.keys(byName)).toEqual(["Admin", "Accounts", "Manager", "Store Manager"]);
    expect(byName.Admin).toMatchObject({ isLocked: true, userCount: 1, flags: { seeCost: true, seeProfit: true, seeMargin: true } });
    expect(Object.values(byName.Admin.permissions).every((l) => l === "FULL")).toBe(true);
    expect(byName.Accounts.permissions).toEqual({ dashboard: "VIEW", catalog: "VIEW", inventory: "APPROVE", purchasing: "VIEW", projects: "VIEW", reports: "FULL", users: "NONE" });
    expect(byName.Accounts.flags).toEqual({ seeCost: true, seeProfit: true, seeMargin: false });
    expect(byName.Manager.permissions).toMatchObject({ inventory: "APPROVE", purchasing: "CREATE", projects: "CREATE", reports: "NONE" });
    expect(byName.Manager.flags).toEqual({ seeCost: true, seeProfit: false, seeMargin: false });
    expect(byName["Store Manager"].permissions).toMatchObject({ inventory: "CREATE", purchasing: "NONE" });
    expect(byName["Store Manager"].flags).toEqual({ seeCost: false, seeProfit: false, seeMargin: false });
  });
});

describe("custom roles", () => {
  it("creates a blank role with every module at NONE", async () => {
    const res = await createRole({ name: "Site Engineer", description: "On-site staff" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: "Site Engineer", isLocked: false, userCount: 0, flags: { seeCost: false, seeProfit: false, seeMargin: false } });
    expect(Object.values(res.body.data.permissions).every((l) => l === "NONE")).toBe(true);
  });

  it("copies permissions and flags from another role", async () => {
    const res = await createRole({ name: "Senior Manager", copyFromRoleId: await roleId("Manager") });
    expect(res.status).toBe(201);
    const manager = await call(roleRoute.GET, "GET", "/roles/x", { token, params: { id: await roleId("Manager") } });
    expect(res.body.data.permissions).toEqual(manager.body.data.permissions);
    expect(res.body.data.flags).toEqual(manager.body.data.flags);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "role.create", entityId: res.body.data.id } });
    expect(audit.after).toMatchObject({ copiedFrom: { name: "Manager" } });
  });

  it("copying from the locked Admin role creates an editable role", async () => {
    const res = await createRole({ name: "Deputy Admin", copyFromRoleId: await roleId("Admin") });
    expect(res.body.data.isLocked).toBe(false);
    expect(res.body.data.permissions.users).toBe("FULL");
  });

  it("rejects duplicate names case-insensitively (409)", async () => {
    const res = await createRole({ name: "  manager " });
    expect(res.status).toBe(409);
  });

  it("edits levels and flags, bumps the version and audits before/after", async () => {
    const created = await createRole({ name: "Viewer" });
    const id = created.body.data.id;
    const res = await patchRole(id, { permissions: { catalog: "VIEW", reports: "APPROVE" }, flags: { seeCost: true } });
    expect(res.status).toBe(200);
    expect(res.body.data.permissions).toMatchObject({ catalog: "VIEW", reports: "APPROVE", users: "NONE" });
    expect(res.body.data.flags).toEqual({ seeCost: true, seeProfit: false, seeMargin: false });
    expect(res.body.data.permissionVersion).toBe(created.body.data.permissionVersion + 1);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "role.update", entityId: id } });
    expect((audit.before as any).permissions.catalog).toBe("NONE");
    expect((audit.after as any).permissions.catalog).toBe("VIEW");
  });

  it("rejects invalid levels and unknown modules (400)", async () => {
    const id = await roleId("Manager");
    expect((await patchRole(id, { permissions: { catalog: "SUPER" } })).status).toBe(400);
    expect((await patchRole(id, { permissions: { spaceship: "VIEW" } })).status).toBe(400);
  });

  it("applies permission changes to logged-in users on their next request", async () => {
    const user = await createUser(token, { role: "Store Manager" });
    const { accessToken } = await loginMobile(user.username, user.password);
    expect((await call(usersRoute.GET, "GET", "/users", { token: accessToken })).status).toBe(403);

    await patchRole(await roleId("Store Manager"), { permissions: { users: "FULL" } });

    expect((await call(usersRoute.GET, "GET", "/users", { token: accessToken })).status).toBe(200);
    const me = await call(meRoute.GET, "GET", "/auth/me", { token: accessToken });
    expect(me.body.data.permissions.users).toBe("FULL");
  });

  it("deletes an unused role and audits it", async () => {
    const created = await createRole({ name: "Temp" });
    const res = await deleteRole(created.body.data.id);
    expect(res.status).toBe(204);
    expect(await prisma.role.count({ where: { id: created.body.data.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "role.delete", entityId: created.body.data.id } })).toBe(1);
  });

  it("refuses to delete a role that has users (422)", async () => {
    await createUser(token, { role: "Manager" });
    await createUser(token, { role: "Manager" });
    const res = await deleteRole(await roleId("Manager"));
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].code).toBe("ROLE_IN_USE");
    expect(res.body.error.message).toMatch(/2 users/);
  });
});

describe("the Admin role is locked", () => {
  it("cannot be edited (422)", async () => {
    const res = await patchRole(await roleId("Admin"), { permissions: { users: "VIEW" } });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].code).toBe("ROLE_LOCKED");
  });

  it("cannot be deleted (422)", async () => {
    const res = await deleteRole(await roleId("Admin"));
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].code).toBe("ROLE_LOCKED");
  });
});
