import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CreateBucketCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import { env } from "@/shared/config/env";
import { storageClient } from "@/shared/storage/storage";
import { BackupService } from "@/modules/system/application/backup.service";
import { RestoreTestService } from "@/modules/system/application/restore-test.service";
import type { AdminNotifier } from "@/modules/system/application/ports";
import { backupName, backupsToKeep } from "@/modules/system/domain/retention";
import { LocalBackups, OffsiteBackups } from "@/modules/system/infrastructure/backup-storage";
import { libpqTarget, pgDump, pgRestore, withDatabase } from "@/modules/system/infrastructure/pg-tools";
import { databaseAdmin, inspectDatabase, prismaOpsStore } from "@/modules/system/infrastructure/prisma-ops.store";
import { resetDatabase, prisma } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";
import { grn, product, wh } from "../helpers/inventory";

/*
 * Backups and restores against real PostgreSQL 16 tools. pg_dump / pg_restore / psql / openssl
 * run natively when installed (CI), else in Docker:
 *   - the Node backup job:  PG_TOOLS_DOCKER_IMAGE (default postgres:16.15-alpine)
 *   - the shell scripts:    SCRIPT_TOOLS_IMAGE   (default stockbook:local — the app image has
 *                           pg 16 client tools and openssl; build it first)
 */
const native = spawnSync("pg_dump", ["--version"], { encoding: "utf8" }).status === 0 && spawnSync("openssl", ["version"]).status === 0;
const docker = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" }).status === 0;
const scriptImage = process.env.SCRIPT_TOOLS_IMAGE ?? "stockbook:local";
const scriptImageReady = docker && spawnSync("docker", ["image", "inspect", scriptImage], { stdio: "ignore" }).status === 0;
const canRun = native || docker;

const KEY = "integration-test-backup-passphrase-0123456789";
const OFFSITE_BUCKET = "stockbook-test-offsite";
const REPO = path.resolve(__dirname, "../..");

const notified: { type: string; title: string }[] = [];
const notifier: AdminNotifier = { notify: async (type, title) => void notified.push({ type, title }) };
const log = { info: () => undefined, warn: () => undefined, error: () => undefined };

let dir: string;
let offsite: OffsiteBackups;

function services(opts: { key?: string; withOffsite?: boolean } = {}) {
  const e = env();
  const store = prismaOpsStore(prisma);
  const local = new LocalBackups(dir);
  const off = opts.withOffsite === false ? null : offsite;
  return {
    local,
    backups: new BackupService({ store, dumper: { dump: (out) => pgDump(e.DATABASE_URL, out) }, local, offsite: off, encryptionKey: "key" in opts ? opts.key : KEY, policy: { daily: 14, weekly: 8, monthly: 12 }, attachmentsBucket: e.S3_BUCKET, notifier, log }),
    restores: new RestoreTestService({ store, local, offsite: off, encryptionKey: KEY, databaseUrl: e.DATABASE_URL, admin: databaseAdmin(prisma), restore: pgRestore, inspect: inspectDatabase, notifier, log }),
  };
}

/** Runs scripts/<name> natively or in the tools image; returns exit code and output. */
function runScript(name: string, args: string[], extraEnv: Record<string, string>, stdin = ""): Promise<{ code: number; stdout: string; stderr: string }> {
  const inDocker = !native;
  const fix = (v: string) => (inDocker ? v.replace(/@(localhost|127\.0\.0\.1):/g, "@host.docker.internal:") : v);
  const envVars = Object.fromEntries(Object.entries(extraEnv).map(([k, v]) => [k, fix(v)]));
  const cmd = inDocker
    ? ["docker", ["run", "--rm", "-i", "--entrypoint", "sh", "--add-host", "host.docker.internal:host-gateway", "--mount", `type=bind,source=${path.join(REPO, "scripts")},target=/s,readonly`, "--mount", `type=bind,source=${dir},target=/out`, ...Object.keys(envVars).flatMap((k) => ["-e", k]), scriptImage, `/s/${name}`, ...args.map((a) => fix(a.startsWith(dir) ? `/out/${path.relative(dir, a).split(path.sep).join("/")}` : a))]]
    : ["sh", [path.join(REPO, "scripts", name), ...args]];
  return new Promise((resolve) => {
    const child = spawn(cmd[0] as string, cmd[1] as string[], { env: { ...process.env, ...envVars }, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.stdin.end(stdin);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}

beforeAll(async () => {
  if (!canRun) return;
  if (!native) process.env.PG_TOOLS_DOCKER_IMAGE ??= "postgres:16.15-alpine";
  dir = mkdtempSync(path.join(os.tmpdir(), "sb-backups-"));
  await resetDatabase();
  const token = await adminToken();
  const p = await product(token);
  await grn(token, await wh("A"), [{ productId: p.id, qty: 12, unitPrice: "250" }]);

  // The off-site bucket: the test MinIO with a second bucket.
  const e = env();
  offsite = OffsiteBackups.fromEnv({ ...e, BACKUP_S3_ENDPOINT: e.S3_ENDPOINT, BACKUP_S3_BUCKET: OFFSITE_BUCKET, BACKUP_S3_KEY: e.S3_ACCESS_KEY_ID, BACKUP_S3_SECRET: e.S3_SECRET_ACCESS_KEY, BACKUP_S3_PREFIX: "it" })!;
  await storageClient().send(new CreateBucketCommand({ Bucket: OFFSITE_BUCKET })).catch(() => undefined);
  await storageClient().send(new CreateBucketCommand({ Bucket: e.S3_BUCKET })).catch(() => undefined);
  await storageClient().send(new PutObjectCommand({ Bucket: e.S3_BUCKET, Key: "attachments/test/invoice.pdf", Body: Buffer.from("%PDF-1.4 test"), ContentType: "application/pdf" }));
}, 180_000);

afterAll(async () => {
  if (!canRun) return;
  await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "sb_script_restore" WITH (FORCE)`).catch(() => undefined);
});

describe.skipIf(!canRun)("backup job", () => {
  it("dumps, encrypts, copies off-site, syncs attachments and records the run", async () => {
    const { backups, local } = services();
    const r = await backups.run("MANUAL");
    expect(r.location).toBe("local+offsite");
    expect(r.run.fileName).toMatch(/^stockbook-\d{8}-\d{6}-manual\.dump\.enc$/);
    expect(r.run.encrypted).toBe(true);
    expect(r.run.sizeBytes).toBeGreaterThan(1000);
    expect((await local.list()).map((f) => f.name)).toContain(r.run.fileName);

    const run = await prisma.backupRun.findFirstOrThrow({ orderBy: { startedAt: "desc" } });
    expect(run).toMatchObject({ status: "SUCCEEDED", trigger: "MANUAL", encrypted: true, offsite: true, offsiteError: null });
    expect((run.details as { rowCounts: Record<string, number> }).rowCounts.StockMovement).toBeGreaterThan(0);

    const head = await storageClient().send(new HeadObjectCommand({ Bucket: OFFSITE_BUCKET, Key: `it/db/${r.run.fileName}` }));
    expect(Number(head.ContentLength)).toBe(r.run.sizeBytes);
    // The off-site copy is encrypted: it starts with the OpenSSL header, not PGDMP.
    const obj = await storageClient().send(new GetObjectCommand({ Bucket: OFFSITE_BUCKET, Key: `it/db/${r.run.fileName}`, Range: "bytes=0-7" }));
    expect(Buffer.from(await obj.Body!.transformToByteArray()).toString("latin1")).toBe("Salted__");
    await storageClient().send(new HeadObjectCommand({ Bucket: OFFSITE_BUCKET, Key: "it/attachments/attachments/test/invoice.pdf" }));
  }, 180_000);

  it("applies 14 daily / 8 weekly / 12 monthly retention locally and off-site", async () => {
    const { backups, local } = services();
    // 40 old nightly backups from last year, locally and off-site.
    const old = Array.from({ length: 40 }, (_, i) => backupName(new Date(Date.parse("2025-06-01T20:00:00Z") + i * 86_400_000), "SCHEDULED", true));
    for (const n of old) {
      writeFileSync(path.join(dir, n), "old");
      await storageClient().send(new PutObjectCommand({ Bucket: OFFSITE_BUCKET, Key: `it/db/${n}`, Body: Buffer.from("old") }));
    }
    const before = await local.list();
    const expectedKeep = backupsToKeep(before, { daily: 14, weekly: 8, monthly: 12 });
    const r = await backups.applyRetention();
    expect(r.localDeleted.length).toBeGreaterThan(10);
    expect(r.localDeleted.every((n) => old.includes(n))).toBe(true);
    expect(new Set((await local.list()).map((f) => f.name))).toEqual(expectedKeep);
    // The same rule off-site: the same old names are gone there too.
    expect(r.offsiteDeleted.sort()).toEqual([...r.localDeleted].sort());
    const remote = (await offsite.list()).map((f) => f.name);
    expect(remote.some((n) => r.localDeleted.includes(n))).toBe(false);
    expect(readdirSync(dir).some((n) => n.endsWith(".partial"))).toBe(false);
  }, 120_000);

  it("without the encryption key: stores locally, never sends an unencrypted dump off-site", async () => {
    const { backups } = services({ key: undefined });
    const r = await backups.run("SCHEDULED");
    expect(r.location).toBe("local");
    expect(r.run.fileName).toMatch(/\.dump$/);
    expect(r.run.offsiteError).toContain("set BACKUP_ENCRYPTION_KEY");
    expect(notified.some((n) => n.type === "BACKUP_FAILED" && n.title === "Off-site backup copy failed")).toBe(true);
  }, 180_000);

  it("a failing dump is recorded as FAILED and Admins are notified", async () => {
    const e = env();
    const store = prismaOpsStore(prisma);
    const broken = new BackupService({ store, dumper: { dump: async () => Promise.reject(new Error("connection refused")) }, local: new LocalBackups(dir), offsite: null, encryptionKey: KEY, policy: { daily: 14, weekly: 8, monthly: 12 }, attachmentsBucket: e.S3_BUCKET, notifier, log });
    await expect(broken.run("SCHEDULED")).rejects.toThrow("connection refused");
    expect(await prisma.backupRun.findFirstOrThrow({ orderBy: { startedAt: "desc" } })).toMatchObject({ status: "FAILED", error: "connection refused" });
    expect(notified.some((n) => n.title === "Database backup failed")).toBe(true);
    expect(readdirSync(dir).some((n) => n.endsWith(".partial"))).toBe(false);
  });
});

describe.skipIf(!canRun)("restore test", () => {
  it("restores the latest backup into a temporary database, checks it and drops it", async () => {
    const { backups, restores } = services();
    await backups.run("MANUAL");
    const r = (await restores.run("MANUAL")) as Awaited<ReturnType<RestoreTestService["run"]>> & { rowCounts: Record<string, number>; integrity: { passed: boolean }[]; latestEntryDate: string | null; migrations: number };
    expect(r.passed).toBe(true);
    expect(r.rowCounts.StockMovement).toBe(await prisma.stockMovement.count());
    expect(r.rowCounts.User).toBeGreaterThan(0);
    expect(r.integrity.every((c) => c.passed)).toBe(true);
    expect(r.latestEntryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.migrations).toBeGreaterThan(5);
    const left = await prisma.$queryRawUnsafe<{ datname: string }[]>(`SELECT datname FROM pg_database WHERE datname LIKE 'sb_restore_test_%'`);
    expect(left).toEqual([]);
    expect(await prisma.restoreTestRun.findFirstOrThrow({ orderBy: { startedAt: "desc" } })).toMatchObject({ status: "SUCCEEDED", trigger: "MANUAL" });
  }, 240_000);
});

describe.skipIf(!canRun || (!native && !scriptImageReady))("backup.sh and restore.sh", () => {
  const target = () => withDatabase(env().DATABASE_URL, "sb_script_restore");

  it("backup.sh makes an encrypted dump; restore.sh restores it (and a job-made one) into a new database", async () => {
    const b = await runScript("backup.sh", [dir], { DATABASE_URL: env().DATABASE_URL, BACKUP_ENCRYPTION_KEY: KEY, BACKUP_DIR: dir });
    expect(b.code, b.stderr).toBe(0);
    const scriptFile = path.basename(b.stdout.split("\n").pop()!);
    expect(scriptFile).toMatch(/^stockbook-\d{8}-\d{6}-manual\.dump\.enc$/);

    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "sb_script_restore" WITH (FORCE)`);
    await prisma.$executeRawUnsafe(`CREATE DATABASE "sb_script_restore" TEMPLATE template0`);
    const r = await runScript("restore.sh", [path.join(dir, scriptFile), libpqTarget(target()).url.replace("postgresql://stockbook@", `postgresql://stockbook:stockbook@`)], { BACKUP_ENCRYPTION_KEY: KEY });
    expect(r.code, r.stderr).toBe(0);
    expect(r.stderr).toMatch(/restored into 'sb_script_restore': \d+ stock entries/);

    const copy = new PrismaClient({ datasourceUrl: target() });
    try {
      expect(await copy.stockMovement.count()).toBe(await prisma.stockMovement.count());
      expect(await copy.user.count()).toBe(await prisma.user.count());
    } finally {
      await copy.$disconnect();
    }
  }, 240_000);

  it("asks before replacing a database that isn't empty, and changes nothing when the answer is wrong", async () => {
    const jobFile = (await new LocalBackups(dir).list()).find((f) => f.name.endsWith(".enc") && !f.name.includes("-manual.dump.enc.partial"))!.name;
    const url = libpqTarget(target()).url.replace("postgresql://stockbook@", `postgresql://stockbook:stockbook@`);
    const no = await runScript("restore.sh", [path.join(dir, jobFile), url], { BACKUP_ENCRYPTION_KEY: KEY }, "not-the-name\n");
    expect(no.code).toBe(1);
    expect(no.stderr).toContain("is not empty");
    expect(no.stderr).toContain("Cancelled: nothing was changed.");

    const yes = await runScript("restore.sh", [path.join(dir, jobFile), url], { BACKUP_ENCRYPTION_KEY: KEY }, "sb_script_restore\n");
    expect(yes.code, yes.stderr).toBe(0);

    const wrongKey = await runScript("restore.sh", [path.join(dir, jobFile), url, "--yes"], { BACKUP_ENCRYPTION_KEY: "a-different-key-that-is-also-long-enough" });
    expect(wrongKey.code).not.toBe(0);
  }, 240_000);
});
