import { afterAll, describe, expect, it } from "vitest";
import { Worker } from "bullmq";
import * as healthRoute from "@/app/api/v1/health/route";
import * as openapiRoute from "@/app/api/v1/openapi.json/route";
import { bullConnection } from "@/shared/redis/redis";
import { enqueueSystemJob, getQueue, queueEvents, queuePrefix, QUEUES } from "@/shared/queue/queue";
import { processSystemJob } from "@/worker/processors/system";
import { logger } from "@/shared/logger/logger";
import { call } from "../helpers/http";

describe("GET /health", () => {
  it("reports database and redis up", async () => {
    const res = await call(healthRoute.GET, "GET", "/health");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ok");
    expect(res.body.data.checks.database.status).toBe("up");
    expect(res.body.data.checks.redis.status).toBe("up");
  });
});

describe("GET /openapi.json", () => {
  it("documents every Module 0 endpoint with both auth methods", async () => {
    const res = await openapiRoute.GET();
    const doc = await res.json();
    const ops = Object.entries(doc.paths as Record<string, object>).flatMap(([path, methods]) => Object.keys(methods).map((m) => `${m.toUpperCase()} ${path}`));
    expect(ops).toEqual(
      expect.arrayContaining([
        "POST /auth/login",
        "POST /auth/refresh",
        "POST /auth/logout",
        "GET /auth/me",
        "GET /users",
        "POST /users",
        "GET /users/{id}",
        "PATCH /users/{id}",
        "POST /users/{id}/disable",
        "POST /users/{id}/enable",
        "POST /users/{id}/password",
        "GET /roles",
        "POST /roles",
        "GET /roles/matrix",
        "GET /roles/{id}",
        "PATCH /roles/{id}",
        "DELETE /roles/{id}",
        "GET /warehouses",
        "GET /login-history",
        "GET /audit-logs",
        "GET /health",
      ]),
    );
    expect(Object.keys(doc.components.securitySchemes)).toEqual(["bearerAuth", "cookieAuth"]);
    expect(doc.paths["/users"].post.requestBody.content["application/json"].schema.$ref).toBe("#/components/schemas/CreateUserRequest");
    expect(doc.components.schemas.CreateUserRequest.required).toEqual(expect.arrayContaining(["username", "password", "roleId", "warehouseIds"]));
  });
});

describe("BullMQ queue → worker", () => {
  const worker = new Worker(QUEUES.system, (job) => processSystemJob(job, logger), { connection: bullConnection(), prefix: queuePrefix() });
  const events = queueEvents(QUEUES.system);

  afterAll(async () => {
    await worker.close();
    await events.close();
    await getQueue(QUEUES.system).close();
  });

  it("processes the ping test job", async () => {
    await events.waitUntilReady();
    const job = await enqueueSystemJob("ping", { message: "hello", requestedAt: new Date().toISOString() });
    const result = await job.waitUntilFinished(events, 10_000);
    expect(result).toMatchObject({ pong: true, message: "hello" });
  });
});
