import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Worker } from "bullmq";
import { isValidElement, type ReactElement } from "react";
import * as jobsRoute from "@/app/api/v1/system/jobs/route";
import * as failedRoute from "@/app/api/v1/system/jobs/[queue]/failed/route";
import * as retryRoute from "@/app/api/v1/system/jobs/[queue]/[jobId]/retry/route";
import * as backupsRoute from "@/app/api/v1/system/backups/route";
import { resetEnvCache } from "@/shared/config/env";
import { bullConnection } from "@/shared/redis/redis";
import { getQueue, queuePrefix, QUEUES } from "@/shared/queue/queue";
import { logger } from "@/shared/logger/logger";
import { processSystemJob } from "@/worker/processors/system";
import { call } from "../helpers/http";
import { prisma, resetDatabase } from "../helpers/db";
import { adminToken, createUser, loginWeb } from "../helpers/fixtures";
import { grn, product, wh } from "../helpers/inventory";

/*
 * Server Actions and the Admin pages (System health, Background jobs). Next.js request APIs are
 * replaced by a cookie jar the test controls, so the real actions and pages run as that user.
 */

const jar = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.cookies.has(name) ? { name, value: jar.cookies.get(name)! } : undefined) }),
  headers: async () => new Headers({ host: "localhost:3000", "user-agent": "vitest", "x-real-ip": "127.0.0.1" }),
}));

process.env.FAILED_JOBS_ALERT_THRESHOLD = "1";
resetEnvCache();

let admin: string;
const web: Record<string, { sb_at: string; sb_rt: string }> = {};
const signInAs = (who: string) => {
  jar.cookies = new Map(Object.entries(web[who]!));
};

beforeAll(async () => {
  await resetDatabase();
  admin = await adminToken();
  web.admin = await loginWeb("admin", "Admin-pass-123");
  for (const [who, role, whs] of [
    ["accounts", "Accounts", ["A", "B"]],
    ["storeA", "Store Manager", ["A"]],
    ["storeB", "Store Manager", ["B"]],
  ] as const) {
    const u = await createUser(admin, { role, warehouses: [...whs], username: `sa.${who.toLowerCase()}` });
    web[who] = await loginWeb(u.username, u.password);
  }
  await getQueue(QUEUES.system).obliterate({ force: true });
  await getQueue(QUEUES.backups).obliterate({ force: true });
});

describe("Server Actions use the same permission checks as the API", () => {
  it("System health actions refuse a non-Admin, even with a valid session", async () => {
    const { runBackupNowAction, runIntegrityCheckAction, runRestoreTestAction, retryJobAction } = await import("@/modules/system/interface/actions");
    for (const who of ["accounts", "storeA"]) {
      signInAs(who);
      for (const action of [runBackupNowAction, runRestoreTestAction, runIntegrityCheckAction]) {
        expect(await action()).toEqual({ ok: false, error: { code: "FORBIDDEN", message: expect.any(String) } });
      }
      expect((await retryJobAction("email", "x")).ok).toBe(false);
    }
    expect(await getQueue(QUEUES.backups).count()).toBe(0);
  });

  it("refuse an anonymous or revoked session", async () => {
    const { runBackupNowAction } = await import("@/modules/system/interface/actions");
    jar.cookies = new Map();
    expect(await runBackupNowAction()).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
    jar.cookies = new Map([["sb_at", "not-a-jwt"]]);
    expect((await runBackupNowAction()).ok).toBe(false);
  });

  it("let an Admin start a backup (queued once, audited)", async () => {
    const { runBackupNowAction } = await import("@/modules/system/interface/actions");
    signInAs("admin");
    const first = await runBackupNowAction();
    expect(first).toEqual({ ok: true, data: { jobId: "manual-backup", alreadyQueued: false } });
    expect(await runBackupNowAction()).toEqual({ ok: true, data: { jobId: "manual-backup", alreadyQueued: true } });
    expect(await getQueue(QUEUES.backups).getJobCounts("waiting")).toMatchObject({ waiting: 1 });
    expect(await prisma.auditLog.count({ where: { action: "system.backup.requested" } })).toBe(1);
    // The API button does the same thing (and dedupes the same way).
    expect((await call(backupsRoute.POST, "POST", "/system/backups", { token: admin })).body.data).toEqual({ jobId: "manual-backup", alreadyQueued: true });
  });

  it("can't bypass warehouse scope: an action calling the inventory service sees only the user's warehouses", async () => {
    const { authedAction } = await import("@/shared/http/action");
    const { inventory } = await import("@/modules/inventory/interface/container");
    const { principalActor } = await import("@/modules/inventory/interface/http");
    const viewEntry = authedAction({ permission: ["inventory", "VIEW"] }, async (ctx, id: string) => (await inventory().entries.get(principalActor(ctx.principal), id)).number);

    const p = await product(admin);
    const entry = await grn(admin, await wh("A"), [{ productId: p.id, qty: 1, unitPrice: "10" }]);
    signInAs("storeA");
    expect(await viewEntry(entry.id)).toEqual({ ok: true, data: entry.number });
    signInAs("storeB");
    expect(await viewEntry(entry.id)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

    const approve = authedAction({ permission: ["inventory", "APPROVE"] }, async () => "approved");
    expect(await approve()).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } }); // Store Manager = CREATE
  });

  it('every "use server" file except login exports only authedAction-wrapped actions', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && /^\s*["']use server["']/.test(readFileSync(p, "utf8"))) files.push(p);
      }
    };
    walk(path.resolve(__dirname, "../../src"));
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const exports = [...src.matchAll(/^export (?:async function|const) (\w+)/gm)].map((m) => m[1]!);
      for (const name of exports) {
        if (name === "loginAction") continue; // signs in: there is no session yet
        expect(new RegExp(`export const ${name} = authedAction\\(`).test(src), `${path.relative(process.cwd(), f)}: ${name} must be built with authedAction`).toBe(true);
      }
    }
  });
});

describe("System health page", () => {
  it("shows Access denied to anyone but an Admin", async () => {
    const { default: Page } = await import("@/app/(app)/admin/system/page");
    const { AccessDenied } = await import("@/components/shell/PageStates");
    signInAs("accounts");
    const el = (await Page()) as ReactElement<{ what: string }>;
    expect(el.type).toBe(AccessDenied);
    expect(el.props.what).toBe("System health");
  });

  it("renders the health snapshot for an Admin (tiles, warnings, backups, integrity)", async () => {
    const { default: Page } = await import("@/app/(app)/admin/system/page");
    signInAs("admin");
    const el = (await Page()) as ReactElement<{ children: ReactElement[] }>;
    const view = el.props.children.find((c) => isValidElement(c) && (c.props as { snapshot?: unknown }).snapshot) as ReactElement<{ snapshot: { tiles: { key: string }[]; warnings: { key: string }[] } }>;
    expect(view.props.snapshot.tiles.map((t) => t.key)).toEqual(["version", "database", "storage", "backup", "restore", "integrity", "email", "worker"]);
    expect(view.props.snapshot.warnings.map((w) => w.key)).toEqual(expect.arrayContaining(["email", "offsite", "encryption", "sentry", "worker"]));
  });
});

async function failSystemJob(jobId: string) {
  await getQueue(QUEUES.system).add("not-a-real-job", {}, { attempts: 1, jobId });
  const worker = new Worker(QUEUES.system, (job) => processSystemJob(job, logger), { connection: bullConnection(), prefix: queuePrefix() });
  await new Promise<void>((resolve) => worker.on("failed", () => resolve()));
  await worker.close();
}

describe("Background jobs page and API", () => {
  it("lists counts per queue and failed jobs with error and attempts; Retry puts a job back", async () => {
    const q = getQueue(QUEUES.system);
    for (const n of [1, 2]) await q.add("not-a-real-job", { n }, { attempts: 1, jobId: `boom-${n}` });
    const worker = new Worker(QUEUES.system, (job) => processSystemJob(job, logger), { connection: bullConnection(), prefix: queuePrefix() });
    await new Promise<void>((resolve) => {
      let failed = 0;
      worker.on("failed", () => ++failed === 2 && resolve());
    });
    await worker.close();

    const overview = await call(jobsRoute.GET, "GET", "/system/jobs", { token: admin });
    expect(overview.status).toBe(200);
    const sys = overview.body.data.queues.find((x: { name: string }) => x.name === "system");
    expect(sys).toMatchObject({ label: "System", counts: { failed: 2 } });
    expect(overview.body.data.queues.map((x: { name: string }) => x.name)).toEqual(expect.arrayContaining(["email", "reports", "documents", "catalog-import", "opening-import", "backups", "integrity"]));
    expect(overview.body.data).toMatchObject({ failedLastHour: 2, threshold: 1 });

    const failed = await call(failedRoute.GET, "GET", "/system/jobs/system/failed", { token: admin, params: { queue: "system" } });
    expect(failed.body.meta.total).toBe(2);
    expect(failed.body.data[0]).toMatchObject({ name: "not-a-real-job", error: "Unknown system job: not-a-real-job", attempts: 1, maxAttempts: 1 });

    expect((await call(retryRoute.POST, "POST", "/x", { token: admin, params: { queue: "system", jobId: "boom-1" } })).body.data).toEqual({ queue: "system", jobId: "boom-1", retried: true });
    expect(await (await q.getJob("boom-1"))!.getState()).toBe("waiting");
    expect((await call(retryRoute.POST, "POST", "/x", { token: admin, params: { queue: "system", jobId: "boom-1" } })).status).toBe(400); // not failed any more
    expect((await call(retryRoute.POST, "POST", "/x", { token: admin, params: { queue: "nope", jobId: "boom-1" } })).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: "system.job.retry" } })).toBe(1);
  });

  it("alerts Admins once an hour when failures pass the threshold", async () => {
    const { system } = await import("@/modules/system/interface/container");
    await failSystemJob("boom-3");
    const first = await system().jobs.checkFailures();
    expect(first).toMatchObject({ alerted: true });
    expect(await prisma.notification.count({ where: { type: "BACKGROUND_JOBS_FAILING" } })).toBeGreaterThan(0);
    expect(await system().jobs.checkFailures()).toMatchObject({ alerted: false }); // same hour
  });

  it("the page shows the failed jobs of the chosen queue; non-Admins are refused", async () => {
    const { default: Page } = await import("@/app/(app)/admin/jobs/page");
    signInAs("storeA");
    expect(((await Page({ searchParams: Promise.resolve({}) })) as ReactElement).type).not.toBe("div");
    const denied = (await Page({ searchParams: Promise.resolve({}) })) as ReactElement<{ what: string }>;
    expect(denied.props.what).toBe("Background jobs");

    signInAs("admin");
    const el = (await Page({ searchParams: Promise.resolve({ queue: "system" }) })) as ReactElement<{ children: ReactElement[] }>;
    const view = el.props.children.find((c) => isValidElement(c) && (c.props as { data?: unknown }).data) as ReactElement<{ data: { selected: string; failed: { total: number; items: { id: string }[] } } }>;
    expect(view.props.data.selected).toBe("system");
    // boom-1 was retried above and failed again in the next worker run.
    expect(view.props.data.failed.items.map((j) => j.id).sort()).toEqual(["boom-1", "boom-2", "boom-3"]);
  });
});
