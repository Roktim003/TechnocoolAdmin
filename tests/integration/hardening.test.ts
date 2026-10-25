import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { decodeJwt } from "jose";
import { middleware } from "@/middleware";
import * as loginRoute from "@/app/api/v1/auth/login/route";
import * as refreshRoute from "@/app/api/v1/auth/refresh/route";
import * as meRoute from "@/app/api/v1/auth/me/route";
import * as usersRoute from "@/app/api/v1/users/route";
import * as userRoute from "@/app/api/v1/users/[id]/route";
import * as passwordRoute from "@/app/api/v1/users/[id]/password/route";
import * as logoutAllRoute from "@/app/api/v1/users/[id]/logout-all/route";
import * as productsRoute from "@/app/api/v1/products/route";
import * as productExportRoute from "@/app/api/v1/products/export/route";
import * as photosRoute from "@/app/api/v1/products/[id]/photos/route";
import * as readyRoute from "@/app/api/v1/health/ready/route";
import * as systemHealthRoute from "@/app/api/v1/system/health/route";
import { redis } from "@/shared/redis/redis";
import { startHeartbeat } from "@/shared/lifecycle/heartbeat";
import { resetLifecycle, shutdown, trackInFlight } from "@/shared/lifecycle/shutdown";
import { captureError, errorTrackingActive, initErrorTracking } from "@/shared/monitoring/sentry";
import { optionalServices } from "@/shared/config/env";
import { notifications } from "@/modules/notifications/interface/container";
import { call, ORIGIN } from "../helpers/http";
import { prisma, resetDatabase, roleId, warehouseId } from "../helpers/db";
import { ADMIN, adminToken, createUser, loginMobile, loginWeb } from "../helpers/fixtures";
import { form } from "../helpers/catalog";
import { resetEnvCache } from "@/shared/config/env";
import { product } from "../helpers/inventory";

// Small limits so the tests can reach them (this file has its own environment).
process.env.RATE_LIMIT_API_PER_MINUTE = "40";
process.env.RATE_LIMIT_EXPORTS_PER_MINUTE = "3";
process.env.RATE_LIMIT_REFRESH_PER_MINUTE = "5";
process.env.MAX_JSON_BODY_KB = "16";
process.env.MAX_UPLOAD_MB = "1";
resetEnvCache(); // the setup file already parsed the environment

let token: string;
beforeAll(async () => {
  await resetDatabase();
  await redis().flushdb();
  token = await adminToken();
});

const req = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) => new NextRequest(new URL(path, ORIGIN), { method: init.method ?? "GET", headers: init.headers });

describe("security headers (middleware, every response)", () => {
  it("sets a per-request CSP nonce and the hardening headers on pages and API", () => {
    for (const path of ["/dashboard", "/api/v1/products"]) {
      const a = middleware(req(path));
      const b = middleware(req(path));
      const csp = a.headers.get("content-security-policy")!;
      const nonce = /'nonce-([^']+)'/.exec(csp)![1];
      expect(nonce).toBeTruthy();
      expect(b.headers.get("content-security-policy")).not.toContain(nonce); // fresh each time
      expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
      expect(csp).toContain("frame-ancestors 'none'");
      expect(a.headers.get("x-content-type-options")).toBe("nosniff");
      expect(a.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(a.headers.get("permissions-policy")).toContain("camera=()");
      // The nonce is handed to Next.js through the request headers.
      expect(a.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    }
  });

  it("sends HSTS only when APP_URL is https", () => {
    expect(middleware(req("/dashboard")).headers.get("strict-transport-security")).toBeNull();
    const before = process.env.APP_URL;
    process.env.APP_URL = "https://stock.example.com";
    try {
      expect(middleware(req("/dashboard")).headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
    } finally {
      process.env.APP_URL = before;
    }
  });
});

describe("CORS (closed by default, allow-list from CORS_ORIGINS)", () => {
  const preflight = (origin: string) => middleware(req("/api/v1/products", { method: "OPTIONS", headers: { origin, "access-control-request-method": "POST" } }));

  it("refuses every cross-origin call when no origin is listed", () => {
    delete process.env.CORS_ORIGINS;
    const res = preflight("https://partner.example.com");
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(middleware(req("/api/v1/products", { headers: { origin: "https://partner.example.com" } })).headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers listed origins (bearer only, never credentials) and still refuses others", () => {
    process.env.CORS_ORIGINS = "https://partner.example.com";
    try {
      const ok = preflight("https://partner.example.com");
      expect(ok.status).toBe(204);
      expect(ok.headers.get("access-control-allow-origin")).toBe("https://partner.example.com");
      expect(ok.headers.get("access-control-allow-headers")).toContain("Authorization");
      expect(ok.headers.get("access-control-allow-credentials")).toBeNull();
      expect(preflight("https://evil.example.com").status).toBe(403);
    } finally {
      delete process.env.CORS_ORIGINS;
    }
  });
});

describe("rate limits (Redis, 429 with Retry-After)", () => {
  it("limits each user's API calls per minute", async () => {
    const u = await createUser(token, { role: "Store Manager", username: "rl.user" });
    const t = (await loginMobile(u.username, u.password)).accessToken;
    let limited: { status: number; body: any; headers: Headers } | null = null;
    for (let i = 0; i < 45 && !limited; i++) {
      const r = await call(meRoute.GET, "GET", "/auth/me", { token: t });
      if (r.status === 429) limited = r;
    }
    expect(limited?.status).toBe(429);
    expect(limited!.body.error.code).toBe("RATE_LIMITED");
    expect(Number(limited!.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another user is not affected.
    expect((await call(meRoute.GET, "GET", "/auth/me", { token })).status).toBe(200);
  });

  it("limits exports and PDF jobs per user (RATE_LIMIT_EXPORTS_PER_MINUTE)", async () => {
    const u = await createUser(token, { role: "Admin", username: "rl.exporter", warehouses: ["A", "B"] });
    const t = (await loginMobile(u.username, u.password)).accessToken;
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await call(productExportRoute.GET, "GET", "/products/export", { token: t })).status);
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429);
  });

  it("limits token refreshes per client IP", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await call(refreshRoute.POST, "POST", "/auth/refresh", { body: { refreshToken: "x".repeat(40) }, headers: { "x-real-ip": "203.0.113.77" } })).status);
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
    // Another IP still gets through.
    expect((await call(refreshRoute.POST, "POST", "/auth/refresh", { body: { refreshToken: "x".repeat(40) }, headers: { "x-real-ip": "203.0.113.78" } })).status).toBe(401);
  });

  it("login lockout answers 429 with Retry-After", async () => {
    const u = await createUser(token, { role: "Store Manager", username: "rl.login" });
    let last = 0;
    let retry: string | null = null;
    for (let i = 0; i < 8; i++) {
      const r = await call(loginRoute.POST, "POST", "/auth/login", { body: { username: "no.such.user", password: "wrong-password", client: "mobile" } });
      last = r.status;
      retry = r.headers.get("retry-after");
    }
    expect(last).toBe(429);
    expect(Number(retry)).toBeGreaterThan(0);
    expect(u.id).toBeTruthy();
  });
});

describe("request size limits", () => {
  it("refuses a JSON body over MAX_JSON_BODY_KB with 413", async () => {
    const big = { name: "x".repeat(20 * 1024), username: "big.body", password: "Mango-Rain-42", roleId: await roleId("Store Manager"), warehouseIds: [await warehouseId("A")] };
    const r = await call(usersRoute.POST, "POST", "/users", { token, body: big });
    expect(r.status).toBe(413);
    expect(r.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("refuses an upload over MAX_UPLOAD_MB with 413, before parsing it", async () => {
    const p = await product(token);
    const r = await call(photosRoute.POST as never, "POST", `/products/${p.id}/photos`, { token, params: { id: p.id }, body: form([{ name: "big.jpg", bytes: new Uint8Array(1.5 * 1024 * 1024), type: "image/jpeg" }]) });
    expect(r.status).toBe(413);
  });
});

describe("no mass assignment (Zod whitelists fields)", () => {
  it("ignores fields that aren't part of the create schema", async () => {
    const r = await call(usersRoute.POST, "POST", "/users", {
      token,
      body: { name: "Mass Assign", username: "mass.assign", password: "Mango-Rain-42", roleId: await roleId("Store Manager"), warehouseIds: [await warehouseId("A")], isAdmin: true, tokenVersion: 99, passwordHash: "x", status: "DISABLED", lockedAt: "2020-01-01" },
    });
    expect(r.status).toBe(201);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: r.body.data.id }, include: { role: true } });
    expect(row).toMatchObject({ tokenVersion: 0, status: "ACTIVE", lockedAt: null });
    expect(row.role.name).toBe("Store Manager");
    expect(row.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("rejects unknown fields on updates (a password can't be set through PATCH)", async () => {
    const u = await createUser(token, { role: "Store Manager", username: "patch.guard" });
    const r = await call(userRoute.PATCH, "PATCH", `/users/${u.id}`, { token, params: { id: u.id }, body: { name: "Renamed", password: "Mango-Rain-42" } });
    expect(r.status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).name).not.toBe("Renamed");
  });

  it("rejects product fields the client may not set (no status or cost override on create)", async () => {
    const r = await call(productsRoute.POST, "POST", "/products", { token, body: { code: "MASS-1", name: "x", averageCost: "1" } });
    expect(r.status).toBe(400);
  });
});

describe("password policy (Admin-set passwords)", () => {
  it.each([
    ["9 characters", "Abc-12345"],
    ["a common password", "Password123"],
    ["a keyboard run", "qwertyuiop"],
  ])("refuses %s", async (_label, password) => {
    const u = await createUser(token, { role: "Store Manager" });
    const r = await call(passwordRoute.POST, "POST", `/users/${u.id}/password`, { token, params: { id: u.id }, body: { password } });
    expect(r.status).toBe(400);
  });

  it("stores bcrypt hashes with the configured cost (12 in production)", async () => {
    const u = await createUser(token, { role: "Store Manager" });
    const hash = (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).passwordHash;
    expect(hash).toMatch(/^\$2[aby]\$04\$/); // tests run with BCRYPT_ROUNDS=4; production refuses < 12
  });
});

describe("web session idle timeout", () => {
  it("ends a web session after the idle period; the refresh cookie can't revive it", async () => {
    const u = await createUser(token, { role: "Store Manager", username: "idle.web" });
    const cookies = await loginWeb(u.username, u.password);
    expect((await call(meRoute.GET, "GET", "/auth/me", { cookies })).status).toBe(200);

    // Simulate 30 minutes without a request: the activity key expires.
    const sid = decodeJwt(cookies.sb_at).sid as string;
    expect(await redis().ttl(`session:idle:${sid}`)).toBeGreaterThan(29 * 60);
    await redis().del(`session:idle:${sid}`);

    const me = await call(meRoute.GET, "GET", "/auth/me", { cookies });
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe("SESSION_IDLE");
    const refresh = await call(refreshRoute.POST, "POST", "/auth/refresh", { cookies: { sb_rt: cookies.sb_rt } });
    expect(refresh.status).toBe(401);
    expect(await prisma.refreshToken.count({ where: { familyId: sid, revokedAt: null } })).toBe(0);
  });

  it("keeps an active session alive and leaves mobile sessions alone", async () => {
    const u = await createUser(token, { role: "Store Manager", username: "idle.mobile" });
    const cookies = await loginWeb(u.username, u.password);
    const sid = decodeJwt(cookies.sb_at).sid as string;
    await redis().expire(`session:idle:${sid}`, 5);
    expect((await call(meRoute.GET, "GET", "/auth/me", { cookies })).status).toBe(200);
    expect(await redis().ttl(`session:idle:${sid}`)).toBeGreaterThan(29 * 60); // extended by the request

    const mobile = await loginMobile(u.username, u.password);
    await redis().del(`session:idle:${decodeJwt(mobile.accessToken).sid as string}`);
    expect((await call(meRoute.GET, "GET", "/auth/me", { token: mobile.accessToken })).status).toBe(200);
  });
});

describe("Admin: log out all devices", () => {
  it("revokes every refresh token and invalidates access tokens already issued; audited", async () => {
    const u = await createUser(token, { role: "Store Manager", username: "logout.all" });
    const phone = await loginMobile(u.username, u.password);
    const browser = await loginWeb(u.username, u.password);

    const store = await loginMobile(u.username, u.password);
    expect((await call(logoutAllRoute.POST, "POST", `/users/${u.id}/logout-all`, { token: store.accessToken, params: { id: u.id } })).status).toBe(403);

    const r = await call(logoutAllRoute.POST, "POST", `/users/${u.id}/logout-all`, { token, params: { id: u.id } });
    expect(r.status).toBe(200);
    expect(r.body.data.sessionsRevoked).toBe(3);
    expect((await call(meRoute.GET, "GET", "/auth/me", { token: phone.accessToken })).status).toBe(401);
    expect((await call(meRoute.GET, "GET", "/auth/me", { cookies: browser })).status).toBe(401);
    expect((await call(refreshRoute.POST, "POST", "/auth/refresh", { body: { refreshToken: phone.refreshToken }, headers: { "x-real-ip": "198.51.100.9" } })).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: "user.logout_all", entityId: u.id } })).toBe(1);
    // They can log in again with their password.
    expect((await loginMobile(u.username, u.password)).accessToken).toBeTruthy();
  });
});

describe("health: liveness and readiness", () => {
  it("is not ready without a worker heartbeat, ready with one, not ready while shutting down", async () => {
    await redis().del(...((await redis().keys("sbtest:worker:hb:*")).map((k) => k.replace(/^sbtest:/, "")).concat("none")));
    const down = await call(readyRoute.GET, "GET", "/health/ready");
    expect(down.status).toBe(503);
    expect(down.body.data.checks.worker.status).toBe("down");
    expect(down.body.data.checks.database.status).toBe("up");

    const stop = startHeartbeat(["email"]);
    try {
      await new Promise((r) => setTimeout(r, 100));
      const up = await call(readyRoute.GET, "GET", "/health/ready");
      expect(up.status).toBe(200);
      expect(up.body.data).toMatchObject({ status: "ready", checks: { database: { status: "up" }, redis: { status: "up" }, storage: { status: "up" }, queue: { status: "up" }, worker: { status: "up", processes: 1 } } });

      // Draining: readiness fails at once and new API requests are refused with 503.
      resetLifecycle();
      const hold = trackInFlight();
      const done = shutdown("SIGTERM", { timeoutMs: 5000, exit: () => undefined });
      const draining = await call(readyRoute.GET, "GET", "/health/ready");
      expect(draining.status).toBe(503);
      expect((await call(meRoute.GET, "GET", "/auth/me", { token })).status).toBe(503);
      hold();
      await done;
    } finally {
      resetLifecycle();
      await stop();
    }
  });
});

describe('"not set up yet" behaviour', () => {
  it("email: queued and logged as NOT_SENT_SMTP_MISSING, in-app notification still created", async () => {
    expect(optionalServices().email).toBe(false);
    const admin = await prisma.user.findUniqueOrThrow({ where: { username: ADMIN.username } });
    await prisma.user.update({ where: { id: admin.id }, data: { email: "admin@stockbook.local" } });
    const r = await notifications().service.publish({ type: "BACKUP_FAILED", userIds: [admin.id], title: "Test", body: "Body" });
    expect(r).toEqual({ notified: 1, emailed: 1 });
    const log = await prisma.emailLog.findFirstOrThrow({ where: { type: "BACKUP_FAILED" }, orderBy: { createdAt: "desc" } });
    const { EmailSender } = await import("@/modules/notifications/application/notification.service");
    const { prismaNotificationStore } = await import("@/modules/notifications/infrastructure/prisma-notification.store");
    const { smtpMailer } = await import("@/modules/notifications/infrastructure/smtp-mailer");
    const result = await new EmailSender({ store: prismaNotificationStore(prisma), mailer: smtpMailer }).send({ emailLogId: log.id, to: log.to, subject: log.subject, html: "<p>x</p>", text: "x" }, 1, 5);
    expect(result).toBe("NOT_SENT_SMTP_MISSING");
    expect(await prisma.emailLog.findUniqueOrThrow({ where: { id: log.id } })).toMatchObject({ status: "NOT_SENT_SMTP_MISSING", error: "Email is not set up yet (SMTP_HOST is empty)." });
    expect(await prisma.notification.count({ where: { userId: admin.id, type: "BACKUP_FAILED" } })).toBe(1);
  });

  it("System health says what is not set up yet (email, off-site backup, encryption key, error tracking)", async () => {
    const r = await call(systemHealthRoute.GET, "GET", "/system/health", { token });
    expect(r.status).toBe(200);
    const messages = r.body.data.warnings.map((w: { message: string }) => w.message);
    expect(messages.some((m: string) => m.startsWith("Email is not set up yet"))).toBe(true);
    expect(messages.some((m: string) => m.startsWith("Off-site backup not set up yet: backups are only on this server"))).toBe(true);
    expect(messages.some((m: string) => m.startsWith("Backup encryption key not set"))).toBe(true);
    expect(messages.some((m: string) => m.startsWith("Error tracking not set up yet"))).toBe(true);
    expect(r.body.data.tiles.find((t: { key: string }) => t.key === "email")).toMatchObject({ state: "not_configured", value: "Not set up yet" });
  });

  it("error tracking: without SENTRY_DSN nothing is started and errors only go to the logs", async () => {
    expect(await initErrorTracking("web")).toBe(false);
    expect(errorTrackingActive()).toBe(false);
    expect(() => captureError(new Error("boom"), { requestId: "r1" })).not.toThrow();
  });
});
