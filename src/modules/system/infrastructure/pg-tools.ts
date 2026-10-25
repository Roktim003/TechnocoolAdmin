import { spawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";

/**
 * pg_dump / pg_restore (PostgreSQL 16 client tools, installed in the Docker image).
 *
 * The password goes in PGPASSWORD, never on the command line, and Prisma-only URL parameters
 * (schema, connection_limit…) are removed because libpq rejects them.
 *
 * Development / tests without local client tools: set PG_TOOLS_DOCKER_IMAGE=postgres:16-alpine
 * and the tools run in that container instead (localhost becomes host.docker.internal).
 */
const PRISMA_ONLY_PARAMS = ["schema", "connection_limit", "pool_timeout", "pgbouncer", "statement_cache_size", "socket_timeout", "connect_timeout"];

export function libpqTarget(url: string, inDocker = false): { url: string; password: string | undefined; database: string } {
  const u = new URL(url);
  const password = u.password ? decodeURIComponent(u.password) : undefined;
  u.password = "";
  for (const p of PRISMA_ONLY_PARAMS) u.searchParams.delete(p);
  if (inDocker && ["localhost", "127.0.0.1"].includes(u.hostname)) u.hostname = "host.docker.internal";
  return { url: u.toString(), password, database: decodeURIComponent(u.pathname.replace(/^\//, "")) };
}

/** The same server, another database (restore test target). */
export function withDatabase(url: string, database: string): string {
  const u = new URL(url);
  u.pathname = `/${encodeURIComponent(database)}`;
  return u.toString();
}

interface Tool {
  label: string;
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

function tool(name: "pg_dump" | "pg_restore", args: string[], password: string | undefined): Tool {
  const image = process.env.PG_TOOLS_DOCKER_IMAGE?.trim();
  const env = { ...process.env, ...(password ? { PGPASSWORD: password } : {}) };
  if (!image) return { label: name, command: name, args, env };
  return {
    label: name,
    command: "docker",
    args: ["run", "--rm", "-i", "-e", "PGPASSWORD", "--add-host", "host.docker.internal:host-gateway", image, name, ...args],
    env,
  };
}

function run(t: Tool, opts: { stdin?: Readable; stdout?: Writable }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(t.command, t.args, { env: t.env, stdio: [opts.stdin ? "pipe" : "ignore", opts.stdout ? "pipe" : "ignore", "pipe"], windowsHide: true });
    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => {
      if (stderr.length < 8000) stderr += d.toString();
    });
    child.on("error", (err) => reject(new Error(`${t.label} could not start: ${err.message}`)));
    if (opts.stdin && child.stdin) {
      opts.stdin.on("error", (err) => {
        child.kill();
        reject(err);
      });
      child.stdin.on("error", () => undefined);
      opts.stdin.pipe(child.stdin);
    }
    let outError: Error | null = null;
    if (opts.stdout && child.stdout) {
      opts.stdout.on("error", (err) => {
        outError = err;
        child.kill();
      });
      child.stdout.pipe(opts.stdout);
    }
    child.on("close", (code) => {
      if (outError) return reject(outError);
      if (code === 0) resolve();
      else reject(new Error(`${t.label} exited with code ${code}: ${stderr.trim().slice(-2000)}`));
    });
  });
}

const inDocker = () => !!process.env.PG_TOOLS_DOCKER_IMAGE?.trim();

/** pg_dump in custom format (-Fc, compressed) written to `out`. */
export function pgDump(databaseUrl: string, out: Writable): Promise<void> {
  const t = libpqTarget(databaseUrl, inDocker());
  return run(tool("pg_dump", ["--format=custom", "--compress=6", "--no-owner", "--no-privileges", `--dbname=${t.url}`], t.password), { stdout: out });
}

/** pg_restore of a custom-format dump read from `input` into an (empty) database. */
export function pgRestore(databaseUrl: string, input: Readable): Promise<void> {
  const t = libpqTarget(databaseUrl, inDocker());
  return run(tool("pg_restore", ["--no-owner", "--no-privileges", "--exit-on-error", `--dbname=${t.url}`], t.password), { stdin: input });
}
