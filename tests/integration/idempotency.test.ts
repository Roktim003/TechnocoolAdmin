import { beforeEach, describe, expect, it } from "vitest";
import * as rolesRoute from "@/app/api/v1/roles/route";
import * as usersRoute from "@/app/api/v1/users/route";
import { IDEMPOTENCY_TTL_MS } from "@/shared/idempotency/idempotency";
import { call } from "../helpers/http";
import { prisma, resetDatabase, roleId, warehouseId } from "../helpers/db";
import { adminToken, createUser, loginMobile } from "../helpers/fixtures";

let token: string;

beforeEach(async () => {
  await resetDatabase();
  token = await adminToken();
});

const post = (body: unknown, key: string, t = token) => call(rolesRoute.POST, "POST", "/roles", { token: t, body, headers: { "Idempotency-Key": key } });

describe("Idempotency-Key middleware", () => {
  it("replays the saved response for the same key + body without re-executing", async () => {
    const first = await post({ name: "Estimator" }, "key-0000000001");
    const second = await post({ name: "Estimator" }, "key-0000000001");

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(second.headers.get("idempotent-replayed")).toBe("true");
    expect(first.headers.get("idempotent-replayed")).toBeNull();
    expect(await prisma.role.count({ where: { name: "Estimator" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "role.create" } })).toBe(1);
  });

  it("returns 409 when the same key is sent with a different body", async () => {
    await post({ name: "Estimator" }, "key-0000000002");
    const res = await post({ name: "Different" }, "key-0000000002");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await prisma.role.count({ where: { name: "Different" } })).toBe(0);
  });

  it("replays error responses too (4xx are stored)", async () => {
    const first = await post({ name: "Manager" }, "key-0000000003"); // duplicate name → 409
    const second = await post({ name: "Manager" }, "key-0000000003");
    expect(first.status).toBe(409);
    expect(second.status).toBe(409);
    expect(second.headers.get("idempotent-replayed")).toBe("true");
  });

  it("scopes keys per user", async () => {
    const other = await createUser(token, { role: "Admin" });
    const otherToken = (await loginMobile(other.username, other.password)).accessToken;
    expect((await post({ name: "Role One" }, "key-0000000004")).status).toBe(201);
    // Same key, different user and body — independent.
    expect((await post({ name: "Role Two" }, "key-0000000004", otherToken)).status).toBe(201);
  });

  it("stores key, user, request hash and response with a 24h expiry", async () => {
    await post({ name: "Estimator" }, "key-0000000005");
    const row = await prisma.idempotencyKey.findFirstOrThrow({ where: { key: "key-0000000005" } });
    expect(row).toMatchObject({ method: "POST", path: "/api/v1/roles", responseStatus: 201 });
    expect(row.requestHash).toMatch(/^[a-f0-9]{64}$/);
    const ttl = row.expiresAt.getTime() - row.createdAt.getTime();
    expect(Math.abs(ttl - IDEMPOTENCY_TTL_MS)).toBeLessThan(5_000);
  });

  it("treats an expired key as new", async () => {
    await post({ name: "Estimator" }, "key-0000000006");
    await prisma.idempotencyKey.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await post({ name: "Another" }, "key-0000000006");
    expect(res.status).toBe(201);
  });

  it("rejects malformed keys (400)", async () => {
    const res = await post({ name: "Estimator" }, "short");
    expect(res.status).toBe(400);
  });

  it("works on user creation", async () => {
    const body = { name: "Idem User", username: "idem", password: "Password-123", roleId: await roleId("Manager"), warehouseIds: [await warehouseId("A")] };
    const a = await call(usersRoute.POST, "POST", "/users", { token, body, headers: { "Idempotency-Key": "create-user-0001" } });
    const b = await call(usersRoute.POST, "POST", "/users", { token, body, headers: { "Idempotency-Key": "create-user-0001" } });
    expect(a.status).toBe(201);
    expect(b.body.data.id).toBe(a.body.data.id);
    expect(await prisma.user.count({ where: { username: "idem" } })).toBe(1);
  });
});
