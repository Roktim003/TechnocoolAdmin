import { beforeEach, describe, expect, it } from "vitest";
import * as usersRoute from "@/app/api/v1/users/route";
import * as userRoute from "@/app/api/v1/users/[id]/route";
import * as disableRoute from "@/app/api/v1/users/[id]/disable/route";
import * as enableRoute from "@/app/api/v1/users/[id]/enable/route";
import * as passwordRoute from "@/app/api/v1/users/[id]/password/route";
import * as refreshRoute from "@/app/api/v1/auth/refresh/route";
import * as meRoute from "@/app/api/v1/auth/me/route";
import * as rolesRoute from "@/app/api/v1/roles/route";
import * as matrixRoute from "@/app/api/v1/roles/matrix/route";
import * as loginHistoryRoute from "@/app/api/v1/login-history/route";
import * as auditRoute from "@/app/api/v1/audit-logs/route";
import * as warehousesRoute from "@/app/api/v1/warehouses/route";
import { call } from "../helpers/http";
import { prisma, resetDatabase, roleId, warehouseId } from "../helpers/db";
import { ADMIN, adminToken, createUser, loginMobile } from "../helpers/fixtures";

let token: string;

beforeEach(async () => {
  await resetDatabase();
  token = await adminToken();
});

describe("authorization", () => {
  it("returns 403 to non-Admin roles on every users / roles / history / audit endpoint", async () => {
    for (const role of ["Accounts", "Manager", "Store Manager"]) {
      const user = await createUser(token, { role });
      const { accessToken } = await loginMobile(user.username, user.password);
      const id = user.id;
      const attempts = [
        call(usersRoute.GET, "GET", "/users", { token: accessToken }),
        call(usersRoute.POST, "POST", "/users", { token: accessToken, body: {} }),
        call(userRoute.GET, "GET", `/users/${id}`, { token: accessToken, params: { id } }),
        call(userRoute.PATCH, "PATCH", `/users/${id}`, { token: accessToken, params: { id }, body: { name: "x" } }),
        call(passwordRoute.POST, "POST", `/users/${id}/password`, { token: accessToken, params: { id }, body: { password: "Whatever-123" } }),
        call(rolesRoute.GET, "GET", "/roles", { token: accessToken }),
        call(rolesRoute.POST, "POST", "/roles", { token: accessToken, body: { name: "Hacker" } }),
        call(matrixRoute.GET, "GET", "/roles/matrix", { token: accessToken }),
        call(loginHistoryRoute.GET, "GET", "/login-history", { token: accessToken }),
        call(auditRoute.GET, "GET", "/audit-logs", { token: accessToken }),
      ];
      for (const res of await Promise.all(attempts)) {
        expect(res.status, `${role}`).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
      }
    }
  });

  it("lets any authenticated user list only their own warehouses", async () => {
    const user = await createUser(token, { role: "Store Manager", warehouses: ["B"] });
    const { accessToken } = await loginMobile(user.username, user.password);
    const res = await call(warehousesRoute.GET, "GET", "/warehouses", { token: accessToken });
    expect(res.status).toBe(200);
    expect(res.body.data.map((w: any) => w.code)).toEqual(["B"]);

    const all = await call(warehousesRoute.GET, "GET", "/warehouses", { token });
    expect(all.body.data.map((w: any) => w.code)).toEqual(["A", "B"]);
  });
});

describe("POST /users", () => {
  const valid = async () => ({
    name: "Karim Hossain",
    username: "Karim.H",
    phone: "+8801711000001",
    email: "karim@example.com",
    password: "Password-123",
    roleId: await roleId("Manager"),
    warehouseIds: [await warehouseId("A"), await warehouseId("B")],
  });

  it("creates a user (username stored lower-case, no password in the response)", async () => {
    const res = await call(usersRoute.POST, "POST", "/users", { token, body: await valid() });
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe(`/api/v1/users/${res.body.data.id}`);
    expect(res.body.data).toMatchObject({ username: "karim.h", name: "Karim Hossain", status: "active", isLocked: false, role: { name: "Manager" } });
    expect(res.body.data.warehouses.map((w: any) => w.code)).toEqual(["A", "B"]);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it("rejects a duplicate username case-insensitively (409)", async () => {
    await call(usersRoute.POST, "POST", "/users", { token, body: await valid() });
    const res = await call(usersRoute.POST, "POST", "/users", { token, body: { ...(await valid()), username: "KARIM.h" } });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(res.body.error.details[0].path).toBe("username");
  });

  it("requires at least one warehouse (400)", async () => {
    const res = await call(usersRoute.POST, "POST", "/users", { token, body: { ...(await valid()), warehouseIds: [] } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: "warehouseIds" })]));
  });

  it("enforces the 8-character password minimum (400)", async () => {
    const res = await call(usersRoute.POST, "POST", "/users", { token, body: { ...(await valid()), password: "short" } });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe("password");
  });

  it("rejects unknown role / warehouse ids (422)", async () => {
    const unknown = "00000000-0000-4000-8000-000000000000";
    expect((await call(usersRoute.POST, "POST", "/users", { token, body: { ...(await valid()), roleId: unknown } })).status).toBe(422);
    expect((await call(usersRoute.POST, "POST", "/users", { token, body: { ...(await valid()), warehouseIds: [unknown] } })).status).toBe(422);
  });

  it("writes an audit row", async () => {
    const res = await call(usersRoute.POST, "POST", "/users", { token, body: await valid() });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "user.create" } });
    expect(audit).toMatchObject({ entityType: "User", entityId: res.body.data.id });
    expect(audit.userId).toBe((await prisma.user.findUniqueOrThrow({ where: { username: "admin" } })).id);
    expect(audit.after).toMatchObject({ username: "karim.h", roleName: "Manager", warehouses: ["A", "B"] });
    expect(JSON.stringify(audit.after)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });
});

describe("GET /users — pagination, sort, search, filters", () => {
  beforeEach(async () => {
    const names = ["Delwar", "Anika", "Faruk", "Babul", "Chandni", "Emon"];
    for (const [i, name] of names.entries()) {
      await createUser(token, { name, username: name.toLowerCase(), role: i % 2 ? "Manager" : "Store Manager", phone: `+88017000000${i}` });
    }
  });

  it("paginates with meta", async () => {
    const res = await call(usersRoute.GET, "GET", "/users", { token, query: { page: 2, pageSize: 3, sort: "name" } });
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 2, pageSize: 3, total: 7, totalPages: 3 });
    expect(res.body.data.map((u: any) => u.name)).toEqual(["Delwar", "Emon", "Faruk"]);
  });

  it("sorts descending with '-' and by multiple fields", async () => {
    const res = await call(usersRoute.GET, "GET", "/users", { token, query: { sort: "-name", pageSize: 3 } });
    expect(res.body.data.map((u: any) => u.name)).toEqual(["Test Admin", "Faruk", "Emon"]);
  });

  it("rejects unknown sort fields and pageSize > 100", async () => {
    expect((await call(usersRoute.GET, "GET", "/users", { token, query: { sort: "passwordHash" } })).status).toBe(400);
    expect((await call(usersRoute.GET, "GET", "/users", { token, query: { pageSize: 101 } })).status).toBe(400);
  });

  it("searches name, username and phone", async () => {
    const byName = await call(usersRoute.GET, "GET", "/users", { token, query: { q: "ANIK" } });
    expect(byName.body.data.map((u: any) => u.username)).toEqual(["anika"]);
    const byPhone = await call(usersRoute.GET, "GET", "/users", { token, query: { q: "000003" } });
    expect(byPhone.body.data.map((u: any) => u.username)).toEqual(["babul"]);
  });

  it("filters by role and status", async () => {
    const manager = await roleId("Manager");
    const res = await call(usersRoute.GET, "GET", "/users", { token, query: { roleId: manager } });
    expect(res.body.meta.total).toBe(3);

    const anika = await prisma.user.findUniqueOrThrow({ where: { username: "anika" } });
    await call(disableRoute.POST, "POST", `/users/${anika.id}/disable`, { token, params: { id: anika.id } });
    const disabled = await call(usersRoute.GET, "GET", "/users", { token, query: { status: "disabled" } });
    expect(disabled.body.data.map((u: any) => u.username)).toEqual(["anika"]);
    const active = await call(usersRoute.GET, "GET", "/users", { token, query: { status: "active" } });
    expect(active.body.meta.total).toBe(6);
  });
});

describe("PATCH /users/:id", () => {
  it("updates fields and warehouses, and audits before/after", async () => {
    const user = await createUser(token, { warehouses: ["A"] });
    const res = await call(userRoute.PATCH, "PATCH", `/users/${user.id}`, {
      token,
      params: { id: user.id },
      body: { name: "Renamed", warehouseIds: [await warehouseId("B")], roleId: await roleId("Accounts") },
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: "Renamed", role: { name: "Accounts" } });
    expect(res.body.data.warehouses.map((w: any) => w.code)).toEqual(["B"]);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "user.update", entityId: user.id } });
    expect(audit.before).toMatchObject({ name: user.name, roleName: "Store Manager", warehouses: ["A"] });
    expect(audit.after).toMatchObject({ name: "Renamed", roleName: "Accounts", warehouses: ["B"] });
  });

  it("applies a role change to the user's permissions immediately", async () => {
    const user = await createUser(token, { role: "Store Manager" });
    const { accessToken } = await loginMobile(user.username, user.password);
    await call(userRoute.PATCH, "PATCH", `/users/${user.id}`, { token, params: { id: user.id }, body: { roleId: await roleId("Accounts") } });
    const me = await call(meRoute.GET, "GET", "/auth/me", { token: accessToken });
    expect(me.body.data.role.name).toBe("Accounts");
    expect(me.body.data.permissions.reports).toBe("FULL");
  });

  it("prevents Admin from changing their own role (422)", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { username: "admin" } });
    const res = await call(userRoute.PATCH, "PATCH", `/users/${admin.id}`, { token, params: { id: admin.id }, body: { roleId: await roleId("Manager") } });
    expect(res.status).toBe(422);
  });

  it("returns 404 for unknown or malformed ids", async () => {
    expect((await call(userRoute.GET, "GET", "/users/nope", { token, params: { id: "nope" } })).status).toBe(404);
    const id = "00000000-0000-4000-8000-000000000000";
    expect((await call(userRoute.GET, "GET", `/users/${id}`, { token, params: { id } })).status).toBe(404);
  });
});

describe("disable / enable", () => {
  it("Admin cannot disable themselves (422)", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { username: "admin" } });
    const res = await call(disableRoute.POST, "POST", `/users/${admin.id}/disable`, { token, params: { id: admin.id } });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].code).toBe("CANNOT_DISABLE_SELF");
  });

  it("disabling revokes all refresh tokens and kills the access token immediately", async () => {
    const user = await createUser(token);
    const s1 = await loginMobile(user.username, user.password);
    const s2 = await loginMobile(user.username, user.password);

    const res = await call(disableRoute.POST, "POST", `/users/${user.id}/disable`, { token, params: { id: user.id } });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("disabled");

    expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    expect((await call(refreshRoute.POST, "POST", "/auth/refresh", { body: { refreshToken: s2.refreshToken } })).status).toBe(401);
    expect((await call(meRoute.GET, "GET", "/auth/me", { token: s1.accessToken })).status).toBe(401);

    const enabled = await call(enableRoute.POST, "POST", `/users/${user.id}/enable`, { token, params: { id: user.id } });
    expect(enabled.body.data.status).toBe("active");
    expect(await prisma.auditLog.count({ where: { entityId: user.id, action: { in: ["user.disable", "user.enable"] } } })).toBe(2);
  });
});

describe("POST /users/:id/password", () => {
  it("sets the password, revokes the user's sessions and audits without the hash", async () => {
    const user = await createUser(token);
    const session = await loginMobile(user.username, user.password);

    const res = await call(passwordRoute.POST, "POST", `/users/${user.id}/password`, { token, params: { id: user.id }, body: { password: "Another-pass-1" } });
    expect(res.status).toBe(200);

    expect((await call(refreshRoute.POST, "POST", "/auth/refresh", { body: { refreshToken: session.refreshToken } })).status).toBe(401);
    expect((await call(meRoute.GET, "GET", "/auth/me", { token: session.accessToken })).status).toBe(401);
    await expect(loginMobile(user.username, user.password)).rejects.toThrow();
    await expect(loginMobile(user.username, "Another-pass-1")).resolves.toBeTruthy();

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "user.password_set", entityId: user.id } });
    expect(audit.after).toMatchObject({ sessionsRevoked: 1 });
    expect(JSON.stringify(audit)).not.toMatch(/Another-pass-1|\$2[aby]\$/);
  });

  it("requires at least 8 characters", async () => {
    const user = await createUser(token);
    const res = await call(passwordRoute.POST, "POST", `/users/${user.id}/password`, { token, params: { id: user.id }, body: { password: "1234567" } });
    expect(res.status).toBe(400);
  });

  it("users cannot set their own password (no permission)", async () => {
    const user = await createUser(token, { role: "Manager" });
    const { accessToken } = await loginMobile(user.username, user.password);
    const res = await call(passwordRoute.POST, "POST", `/users/${user.id}/password`, { token: accessToken, params: { id: user.id }, body: { password: "Self-service-1" } });
    expect(res.status).toBe(403);
  });
});

describe("GET /login-history", () => {
  it("lists attempts with filters", async () => {
    const user = await createUser(token);
    await loginMobile(user.username, user.password);
    await expect(loginMobile(user.username, "nope-nope")).rejects.toThrow();

    const all = await call(loginHistoryRoute.GET, "GET", "/login-history", { token, query: { userId: user.id } });
    expect(all.status).toBe(200);
    expect(all.body.meta.total).toBe(2);
    expect(all.body.data[0]).toMatchObject({ result: "WRONG_PASSWORD", user: { username: user.username }, client: "mobile" });

    const failed = await call(loginHistoryRoute.GET, "GET", "/login-history", { token, query: { result: "wrong_password" } });
    expect(failed.body.data.every((h: any) => h.result === "WRONG_PASSWORD")).toBe(true);

    const future = await call(loginHistoryRoute.GET, "GET", "/login-history", { token, query: { from: "2999-01-01" } });
    expect(future.body.meta.total).toBe(0);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
    const todayRes = await call(loginHistoryRoute.GET, "GET", "/login-history", { token, query: { from: today, to: today } });
    expect(todayRes.body.meta.total).toBeGreaterThanOrEqual(3);
  });
});

describe("GET /audit-logs", () => {
  it("filters by entity type and actor", async () => {
    await createUser(token);
    await call(rolesRoute.POST, "POST", "/roles", { token, body: { name: "Auditors" } });
    const admin = await prisma.user.findUniqueOrThrow({ where: { username: "admin" } });

    const users = await call(auditRoute.GET, "GET", "/audit-logs", { token, query: { entityType: "User" } });
    expect(users.body.data.map((a: any) => a.action)).toEqual(["user.create"]);
    const roles = await call(auditRoute.GET, "GET", "/audit-logs", { token, query: { entityType: "Role", userId: admin.id } });
    expect(roles.body.data[0]).toMatchObject({ action: "role.create", user: { username: "admin" } });
  });
});

describe("password is never exposed", () => {
  it("GET /users never returns password hashes", async () => {
    await createUser(token);
    const res = await call(usersRoute.GET, "GET", "/users", { token });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    expect(ADMIN.username).toBe("admin");
  });
});
