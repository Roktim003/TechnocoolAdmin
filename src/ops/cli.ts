/**
 * One-off operations from the same image (bundled to dist/ops.js):
 *
 *   node dist/ops.js check-env                     validate the configuration, list what is not set up yet
 *   node dist/ops.js backup [--trigger PRE_MIGRATION|MANUAL]
 *   node dist/ops.js restore-test
 *   node dist/ops.js integrity
 *
 * The Docker entrypoint runs `backup --trigger PRE_MIGRATION` before every `migrate`.
 */
import { env, optionalServices } from "@/shared/config/env";
import { prisma } from "@/shared/db/prisma";
import { logger } from "@/shared/logger/logger";
import { redis } from "@/shared/redis/redis";
import { closeQueues } from "@/shared/queue/queue";
import { wireModules } from "@/modules/bootstrap";
import type { OpsTrigger } from "@/modules/system/domain/types";
import { system } from "@/modules/system/interface/container";

const log = logger.child({ component: "ops" });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main(command: string | undefined): Promise<number> {
  const e = env();
  switch (command) {
    case "check-env": {
      const o = optionalServices(e);
      const lines = [
        `APP_URL            ${e.APP_URL}`,
        `email (SMTP)       ${o.email ? "set" : "NOT SET YET: emails are logged as not sent"}`,
        `off-site backup    ${o.offsiteBackup ? "set" : "NOT SET YET: backups stay on this server only"}`,
        `backup encryption  ${o.backupEncryption ? "set" : "NOT SET YET: backups are not encrypted"}`,
        `error tracking     ${o.errorTracking ? "set" : "NOT SET YET: errors go to the logs only"}`,
        `CORS origins       ${o.cors ? e.CORS_ORIGINS.join(", ") : "none (closed)"}`,
      ];
      process.stdout.write(`Configuration is valid.\n${lines.join("\n")}\n`);
      return 0;
    }
    case "backup": {
      const trigger = (arg("trigger") ?? "MANUAL").toUpperCase() as OpsTrigger;
      if (!["MANUAL", "PRE_MIGRATION", "SCHEDULED"].includes(trigger)) throw new Error(`Unknown trigger ${trigger}`);
      if (trigger === "PRE_MIGRATION") {
        // First deploy: nothing has been migrated yet, so there is nothing to back up.
        const [{ migrated }] = await prisma.$queryRaw<[{ migrated: boolean }]>`SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS migrated`;
        if (!migrated) {
          process.stdout.write("Empty database (first deploy): no pre-migration backup needed.\n");
          return 0;
        }
      }
      const r = await system(log).backups.run(trigger);
      process.stdout.write(`${JSON.stringify({ file: r.run.fileName, sizeBytes: r.run.sizeBytes, encrypted: r.run.encrypted, location: r.location })}\n`);
      return 0;
    }
    case "restore-test": {
      const r = await system(log).restoreTests.run("MANUAL");
      process.stdout.write(`${JSON.stringify({ passed: r.passed, problems: (r as { problems?: string[] }).problems ?? [] })}\n`);
      return r.passed ? 0 : 2;
    }
    case "integrity": {
      const r = await system(log).integrity.run("MANUAL");
      for (const c of r.checks) process.stdout.write(`${c.passed ? "PASS" : "FAIL"}  ${c.label}${c.passed ? "" : ` (${c.problems})`}\n`);
      return r.passed ? 0 : 2;
    }
    default:
      process.stderr.write("Usage: node dist/ops.js <check-env | backup [--trigger PRE_MIGRATION|MANUAL] | restore-test | integrity>\n");
      return 64;
  }
}

wireModules();
main(process.argv[2])
  .then(async (code) => {
    await Promise.allSettled([prisma.$disconnect(), closeQueues()]);
    await redis().quit().catch(() => undefined);
    process.exit(code);
  })
  .catch(async (err) => {
    log.error({ err }, "operation failed");
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    await Promise.allSettled([prisma.$disconnect(), closeQueues()]);
    process.exit(1);
  });
