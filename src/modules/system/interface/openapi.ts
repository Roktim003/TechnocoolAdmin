import { z } from "@/shared/validation/zod";
import { AUTHENTICATED, dataOf, errors, json, listOf, registry } from "@/shared/openapi/registry";

const ADMIN = "Requires `users` = FULL (Admin).";
const tags = ["System"];

const Tile = z.object({ key: z.string(), title: z.string(), state: z.enum(["ok", "warning", "error", "not_configured"]), value: z.string(), detail: z.string().nullable().optional(), at: z.string().nullable().optional() });
const Run = z.object({ id: z.string().uuid(), trigger: z.enum(["SCHEDULED", "MANUAL", "PRE_MIGRATION"]), status: z.enum(["RUNNING", "SUCCEEDED", "FAILED"]), startedAt: z.string(), finishedAt: z.string().nullable(), error: z.string().nullable() }).passthrough();
const Started = z.object({ jobId: z.string(), alreadyQueued: z.boolean() });
const QueueParams = z.object({ queue: z.string().openapi({ example: "email" }) });

registry.registerPath({
  method: "get",
  path: "/health/ready",
  tags,
  summary: "Readiness: database, Redis, storage, queue and worker heartbeat",
  description: "200 when PostgreSQL, Redis, the storage bucket and the job queue answer and a worker sent a heartbeat in the last 2 minutes; 503 otherwise or while the process is shutting down.",
  responses: {
    200: json(z.object({ data: z.object({ status: z.literal("ready"), checks: z.record(z.unknown()), time: z.string() }) })),
    503: json(z.object({ data: z.object({ status: z.enum(["not_ready", "shutting_down"]), checks: z.record(z.unknown()), time: z.string() }) }), "Not ready"),
  },
});

registry.registerPath({
  method: "get",
  path: "/system/health",
  tags,
  summary: "System health (Admin page data)",
  description: `${ADMIN} App version, uptime, database size, storage used, last backup / restore test / integrity check, email status, worker heartbeat and the list of things not set up yet.`,
  security: AUTHENTICATED,
  responses: { 200: json(dataOf(z.object({ app: z.object({ version: z.string(), commit: z.string(), uptimeSeconds: z.number() }).passthrough(), tiles: z.array(Tile), warnings: z.array(z.object({ key: z.string(), message: z.string() })) }).passthrough())), ...errors(401, 403) },
});

registry.registerPath({ method: "get", path: "/system/backups", tags, summary: "Last 30 backup runs", description: ADMIN, security: AUTHENTICATED, responses: { 200: json(dataOf(z.array(Run))), ...errors(401, 403) } });
registry.registerPath({
  method: "post",
  path: "/system/backups",
  tags,
  summary: "Back up now",
  description: `${ADMIN} Queues a backup on the backups worker (one at a time; a second click while one is waiting returns alreadyQueued). Audited.`,
  security: AUTHENTICATED,
  responses: { 202: json(dataOf(Started), "Queued"), ...errors(401, 403, 429) },
});
registry.registerPath({
  method: "post",
  path: "/system/restore-tests",
  tags,
  summary: "Test restore of the latest backup",
  description: `${ADMIN} Restores the latest backup into a temporary database, runs the sanity and integrity checks, drops it and records the result. Audited.`,
  security: AUTHENTICATED,
  responses: { 202: json(dataOf(Started), "Queued"), ...errors(401, 403, 429) },
});
registry.registerPath({ method: "get", path: "/system/integrity-checks", tags, summary: "Last 10 integrity check runs", description: ADMIN, security: AUTHENTICATED, responses: { 200: json(dataOf(z.array(Run))), ...errors(401, 403) } });
registry.registerPath({
  method: "post",
  path: "/system/integrity-checks",
  tags,
  summary: "Run the integrity check now",
  description: `${ADMIN} Reports problems only; nothing is corrected. Audited.`,
  security: AUTHENTICATED,
  responses: { 202: json(dataOf(Started), "Queued"), ...errors(401, 403, 429) },
});

registry.registerPath({
  method: "get",
  path: "/system/jobs",
  tags,
  summary: "Background jobs: counts per queue",
  description: `${ADMIN} Waiting / active / delayed / completed / failed per queue, and failed jobs in the last hour against the alert threshold.`,
  security: AUTHENTICATED,
  responses: { 200: json(dataOf(z.object({ queues: z.array(z.object({ name: z.string(), label: z.string(), counts: z.record(z.number()) })), failedLastHour: z.number(), threshold: z.number() }))), ...errors(401, 403) },
});
registry.registerPath({
  method: "get",
  path: "/system/jobs/{queue}/failed",
  tags,
  summary: "Failed jobs of a queue",
  description: `${ADMIN} Newest first: error (first line), attempts, when it failed.`,
  security: AUTHENTICATED,
  request: { params: QueueParams, query: z.object({ page: z.number().int().optional(), pageSize: z.number().int().max(100).optional() }) },
  responses: { 200: json(listOf(z.object({ id: z.string(), name: z.string(), error: z.string(), attempts: z.number(), maxAttempts: z.number(), failedAt: z.string().nullable() }))), ...errors(401, 403, 404) },
});
registry.registerPath({
  method: "post",
  path: "/system/jobs/{queue}/{jobId}/retry",
  tags,
  summary: "Retry a failed job",
  description: `${ADMIN} Audited as system.job.retry.`,
  security: AUTHENTICATED,
  request: { params: QueueParams.extend({ jobId: z.string() }) },
  responses: { 200: json(dataOf(z.object({ queue: z.string(), jobId: z.string(), retried: z.boolean() }))), ...errors(400, 401, 403, 404) },
});
