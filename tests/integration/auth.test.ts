import { beforeEach, describe, expect, it } from "vitest";
import * as loginRoute from "@/app/api/v1/auth/login/route";
import * as refreshRoute from "@/app/api/v1/auth/refresh/route";
import * as logoutRoute from "@/app/api/v1/auth/logout/route";
import * as meRoute from "@/app/api/v1/auth/me/route";
import * as usersRoute from "@/app/api/v1/users/route";
import * as disableRoute from "@/app/api/v1/users/[id]/disable/route";
import { call, type CallOptions } from "../helpers/http";
import { prisma, resetDatabase } from "../helpers/db";
import { ADMIN, adminToken, createUser, loginMobile, loginWeb } from "../helpers/fixtures";

const login = (body: Record<string, unknown>, opts: CallOptions = {}) => call(loginRoute.POST, "POST", "/auth/login", { body, ...opts });

beforeEach(resetDatabase);

describe("POST /auth/login", () => {
  it("logs in a web client: sets HttpOnly cookies and returns the profile without tokens", async () => {
    const res = await login({ username: "ADMIN", password: ADMIN.password }); // usernames are case-insensitive

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(res.body.data.me.user.username).toBe("admin");
    expect(res.body.data.me.role).toMatchObject({ name: "Admin", isLocked: true });
    expect(res.body.data.me.permissions.users).toBe("FULL");
    expect(res.body.data.me.warehouses).toHaveLength(2);
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.body.data.refreshToken).toBeUndefined();

    const at = res.rawSetCookies.find((c) => c.startsWith("sb_at="))!;
    const rt = res.rawSetCookies.find((c) => c.startsWith("sb_rt="))!;
    expect(at).toMatch(/HttpOnly/i);
    expect(at).toMatch(/SameSite=lax/i);
    expect(at).toMatch(/Path=\//);
    expect(rt).toMatch(/HttpOnly/i);
    expect(rt).toMatch(/Path=\/api\/v1\/auth/);

    const history = await prisma.loginHistory.findMany();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ result: "SUCCESS", client: "web", userAgent: "vitest" });
    expect((await prisma.user.findUniqueOrThrow({ where: { username: "admin" } })).lastLoginAt).not.toBeNull();
  });

  it("logs in a mobile client: returns tokens in the body and sets no cookies", async () => {
    const res = await login({ username: ADMIN.username, password: ADMIN.password, client: "mobile" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ tokenType: "Bearer", accessTokenExpiresIn: 900 });
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(res.rawSetCookies).toHaveLength(0);
    // Only a hash of the refresh token is stored.
    const stored = await prisma.refreshToken.findFirstOrThrow();
    expect(stored.tokenHash).not.toBe(res.body.data.refreshToken);
    expect(stored.client).toBe("mobile");
  });

  it("rejects a wrong password with 401 and records it", async () => {
    const res = await login({ username: ADMIN.username, password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: "INVALID_CREDENTIALS", requestId: expect.any(String) });
    const h = await prisma.loginHistory.findFirstOrThrow();
    expect(h.result).toBe("WRONG_PASSWORD");
    expect(h.userId).not.toBeNull();
  });

  it("rejects an unknown username with the same 401 and records UNKNOWN_USER", async () => {
    const res = await login({ username: "nobody", password: "whatever-1" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    expect((await prisma.loginHistory.findFirstOrThrow()).result).toBe("UNKNOWN_USER");
  });

  it("validates the body (400)", async () => {
    const res = await login({ username: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.map((d: any) => d.path)).toEqual(expect.arrayContaining(["username", "password"]));
  });

  it("locks the account after 5 failed attempts until an Admin sets a new password", async () => {
    const token = await adminToken();
    const user = await createUser(token, { username: "lockme" });

    for (let i = 1; i <= 4; i++) {
      expect((await login({ username: "lockme", password: "bad-password" })).status).toBe(401);
    }
    const fifth = await login({ username: "lockme", password: "bad-password" });
    expect(fifth.status).toBe(403);
    expect(fifth.body.error.code).toBe("ACCOUNT_LOCKED");

    // Even the correct password is refused now.
    const correct = await login({ username: "lockme", password: user.password });
    expect(correct.status).toBe(403);
    expect(correct.body.error.code).toBe("ACCOUNT_LOCKED");

    const results = (await prisma.loginHistory.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } })).map((h) => h.result);
    expect(results).toEqual(["WRONG_PASSWORD", "WRONG_PASSWORD", "WRONG_PASSWORD", "WRONG_PASSWORD", "WRONG_PASSWORD", "LOCKED"]);
    expect(await prisma.auditLog.count({ where: { action: "user.locked", entityId: user.id } })).toBe(1);

    // Admin sets a new password → unlocked.
    const passwordRoute = await import("@/app/api/v1/users/[id]/password/route");
    const reset = await call(passwordRoute.POST, "POST", `/users/${user.id}/password`, { token, params: { id: user.id }, body: { password: "Brand-new-pass" } });
    expect(reset.status).toBe(200);
    expect(reset.body.data.isLocked).toBe(false);
    expect((await login({ username: "lockme", password: "Brand-new-pass" })).status).toBe(200);
  });

  it("blocks a disabled user with 403 ACCOUNT_DISABLED", async () => {
    const token = await adminToken();
    const user = await createUser(token);
    await call(disableRoute.POST, "POST", `/users/${user.id}/disable`, { token, params: { id: user.id } });

    const res = await login({ username: user.username, password: user.password });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_DISABLED");
    expect((await prisma.loginHistory.findFirstOrThrow({ where: { userId: user.id }, orderBy: { createdAt: "desc" } })).result).toBe("DISABLED");
  });
});

describe("POST /auth/refresh", () => {
  it("rotates the refresh token (mobile, body)", async () => {
    const first = await loginMobile(ADMIN.username, ADMIN.password);
    const res = await call(refreshRoute.POST, "POST", "/auth/refresh", { body: { refreshToken: first.refreshToken } });

    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).not.toBe(first.refreshToken);
    expect(res.body.data.accessToken).toEqual(expect.any(String));

    const tokens = await prisma.refreshToken.findMany({ orderBy: { createdAt: "asc" } });
    expect(tokens).toHaveLength(2);
    expect(tokens[0]!.familyId).toBe(tokens[1]!.familyId);
    expect(tokens[0]!.revokedAt).not.toBeNull();
    expect(tokens[0]!.replacedById).toBe(tokens[1]!.id);
    expect(tokens[1]!.revokedAt).toBeNull();

    // The new refresh token works too.
    const again = await call(refreshRoute.POST, "POST", "/auth/refresh", { body: { refreshToken: res.body.data.refreshToken } });
    expect(again.status).toBe(200);
  });

  it("rotates via the HttpOnly cookie for web clients and sets new cookies", async () => {
    const cookies = await loginWeb(ADMIN.username, ADMIN.password);
    const res = await call(refreshRoute.POST, "POST", "/auth/refresh", { cookies: { sb_rt: cookies.sb_rt } });
    expect(res.status).toBe(200);
    expect(res.setCookies.sb_rt).toBeTruthy();
    expect(res.setCookies.sb_rt).not.toBe(cookies.sb_rt);
    expect(res.setCookies.sb_at).toBeTruthy();
    expect(res.body.data.refreshToken).toBeUndefined();
  });

  it("revokes the whole token family when an old refresh token is reused", async () => {
    const first = await loginMobile(ADMIN.username, ADMIN.password);
    const second = await call(refreshRoute.POST, "POST", "/auth/refresh", { body: { refreshToken: first.refreshToken } });
    const current = second.body.data.refreshToken as string;

    // Attacker (or a buggy client) replays the first token.
    const reuse = await call(refreshRoute.POST, "POST", "/auth/refresh", { body: { refreshToken: first.refreshToken } });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe("REFRESH_TOKEN_REUSED");

    // The legitimate latest token is now dead as well.
    const legit = await call(refreshRoute.POST, "POST", "/auth/refresh", { body: { refreshToken: current } });
    expect(legit.status).toBe(401);
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    expect(await prisma.refreshToken.count({ where: { revokedReason: "reuse_detected" } })).toBe(1);
  });

  it("does not revoke other login sessions (other families) on reuse", async () => {
    const deviceA = await loginMobile(ADMIN.username, ADMIN.password);
    const deviceB = await loginMobile(ADMIN.username, ADMIN.password);
    await call(refreshRoute.POST, "POST", "/auth/refresh", { body: { refreshToken: deviceA.refreshToken } });
    await call(refreshRoute.POST, "POST", "/auth/refresh", { body: { refreshToken: deviceA.refreshToken } }); // reuse

    const b = await call(refreshRoute.POST, "POST", "/auth/refresh", { body: { refreshToken: deviceB.refreshToken } });
    expect(b.status).toBe(200);
  });

  it("rejects an unknown refresh token", async () => {
    const res = await call(refreshRoute.POST, "POST", "/auth/refresh", { body: { refreshToken: "x".repeat(43) } });
    expect(res.status).toBe(401);
  });
});

describe("GET /auth/me — one auth resolver for cookie and bearer", () => {
  it("works with the web access cookie", async () => {
    const cookies = await loginWeb(ADMIN.username, ADMIN.password);
    const res = await call(meRoute.GET, "GET", "/auth/me", { cookies: { sb_at: cookies.sb_at } });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ user: { username: "admin" }, role: { name: "Admin" }, flags: { seeCost: true, seeProfit: true, seeMargin: true } });
  });

  it("works with a mobile bearer token", async () => {
    const session = await loginMobile(ADMIN.username, ADMIN.password);
    const res = await call(meRoute.GET, "GET", "/auth/me", { token: session.accessToken });
    expect(res.status).toBe(200);
    expect(res.body.data.user.username).toBe("admin");
    expect(Object.keys(res.body.data.permissions)).toEqual(["dashboard", "catalog", "inventory", "purchasing", "projects", "reports", "users"]);
  });

  it("returns 401 without credentials or with a garbage token", async () => {
    expect((await call(meRoute.GET, "GET", "/auth/me")).status).toBe(401);
    const bad = await call(meRoute.GET, "GET", "/auth/me", { token: "not-a-jwt" });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns permissions and warehouses of a restricted role", async () => {
    const token = await adminToken();
    const user = await createUser(token, { role: "Store Manager", warehouses: ["B"] });
    const session = await loginMobile(user.username, user.password);
    const res = await call(meRoute.GET, "GET", "/auth/me", { token: session.accessToken });
    expect(res.body.data.permissions).toMatchObject({ inventory: "CREATE", users: "NONE" });
    expect(res.body.data.flags).toEqual({ seeCost: false, seeProfit: false, seeMargin: false });
    expect(res.body.data.warehouses.map((w: any) => w.code)).toEqual(["B"]);
  });
});

describe("CSRF protection on cookie-authenticated mutations", () => {
  const newUser = async () => ({
    name: "Csrf Test",
    username: "csrf.test",
    password: "Password-123",
    roleId: (await prisma.role.findFirstOrThrow({ where: { name: "Manager" } })).id,
    warehouseIds: [(await prisma.warehouse.findFirstOrThrow()).id],
  });

  it("rejects a cookie-auth POST from a foreign Origin", async () => {
    const cookies = await loginWeb(ADMIN.username, ADMIN.password);
    const res = await call(usersRoute.POST, "POST", "/users", { cookies: { sb_at: cookies.sb_at }, origin: "https://evil.example.com", body: await newUser() });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_REJECTED");
    expect(await prisma.user.count({ where: { username: "csrf.test" } })).toBe(0);
  });

  it("rejects a cookie-auth POST with no Origin or Referer", async () => {
    const cookies = await loginWeb(ADMIN.username, ADMIN.password);
    const res = await call(usersRoute.POST, "POST", "/users", { cookies: { sb_at: cookies.sb_at }, origin: null, body: await newUser() });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_REJECTED");
  });

  it("accepts a cookie-auth POST from the app's own origin", async () => {
    const cookies = await loginWeb(ADMIN.username, ADMIN.password);
    const res = await call(usersRoute.POST, "POST", "/users", { cookies: { sb_at: cookies.sb_at }, body: await newUser() });
    expect(res.status).toBe(201);
  });

  it("does not apply to bearer-token requests (mobile)", async () => {
    const token = await adminToken();
    const res = await call(usersRoute.POST, "POST", "/users", { token, origin: "https://evil.example.com", body: await newUser() });
    expect(res.status).toBe(201);
  });

  it("rejects a cookie refresh from a foreign Origin", async () => {
    const cookies = await loginWeb(ADMIN.username, ADMIN.password);
    const res = await call(refreshRoute.POST, "POST", "/auth/refresh", { cookies: { sb_rt: cookies.sb_rt }, origin: "https://evil.example.com" });
    expect(res.status).toBe(403);
  });
});

describe("POST /auth/logout", () => {
  it("revokes the refresh-token family and clears cookies", async () => {
    const cookies = await loginWeb(ADMIN.username, ADMIN.password);
    const res = await call(logoutRoute.POST, "POST", "/auth/logout", { cookies: { sb_rt: cookies.sb_rt } });
    expect(res.status).toBe(204);
    expect(res.setCookies.sb_at).toBe("");
    expect(res.setCookies.sb_rt).toBe("");
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);

    const refresh = await call(refreshRoute.POST, "POST", "/auth/refresh", { cookies: { sb_rt: cookies.sb_rt } });
    expect(refresh.status).toBe(401);
  });
});
