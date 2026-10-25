import { PassThrough, Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, corsHeaders, dsnOrigin, parseOrigins, securityHeaders } from "@/shared/http/security-headers";
import { scrub } from "@/shared/logger/logger";
import { isCommonPassword } from "@/modules/identity/domain/common-passwords";
import { backupName, backupsToKeep, backupTime, weekKey } from "@/modules/system/domain/retention";
import { decryptStream, encryptStream } from "@/modules/system/infrastructure/backup-crypto";
import { libpqTarget, withDatabase } from "@/modules/system/infrastructure/pg-tools";
import { isAllowedPdfRequest } from "@/modules/inventory/infrastructure/pdf";
import { selectQueues } from "@/worker/select-queues";
import { inFlight, isDraining, onShutdown, resetLifecycle, shutdown, trackInFlight } from "@/shared/lifecycle/shutdown";

describe("security headers", () => {
  const base = { nonce: "abc123", appUrl: "https://stock.example.com", dev: false };

  it("CSP uses the nonce and never allows inline or eval scripts in production", () => {
    const csp = contentSecurityPolicy(base);
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).toContain("'nonce-abc123'");
    expect(script).not.toContain("unsafe-inline");
    expect(script).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("sends HSTS only when APP_URL is https", () => {
    expect(securityHeaders(base)["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
    expect(securityHeaders({ ...base, appUrl: "http://10.0.0.5:3000" })["Strict-Transport-Security"]).toBeUndefined();
    expect(contentSecurityPolicy({ ...base, appUrl: "http://10.0.0.5:3000" })).not.toContain("upgrade-insecure-requests");
  });

  it("sets nosniff, referrer, permissions and frame headers", () => {
    const h = securityHeaders(base);
    expect(h).toMatchObject({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY" });
    expect(h["Permissions-Policy"]).toContain("camera=()");
  });

  it("allows the error-tracking ingest origin to receive reports", () => {
    expect(dsnOrigin("https://public@o1.ingest.example.io/42")).toBe("https://o1.ingest.example.io");
    expect(contentSecurityPolicy({ ...base, reportOrigin: "https://o1.ingest.example.io" })).toContain("connect-src 'self' https://o1.ingest.example.io");
  });
});

describe("CORS", () => {
  const allowed = parseOrigins("https://partner.example.com, not a url ,http://localhost:5173/");

  it("parses the allow-list into origins", () => {
    expect(allowed).toEqual(["https://partner.example.com", "http://localhost:5173"]);
  });

  it("is closed by default and for unlisted origins", () => {
    expect(corsHeaders("https://evil.example.com", [], false)).toBeNull();
    expect(corsHeaders("https://evil.example.com", allowed, true)).toBeNull();
    expect(corsHeaders(null, allowed, false)).toBeNull();
  });

  it("answers listed origins without ever allowing credentials", () => {
    const h = corsHeaders("https://partner.example.com", allowed, true)!;
    expect(h["Access-Control-Allow-Origin"]).toBe("https://partner.example.com");
    expect(h["Access-Control-Allow-Headers"]).toContain("Authorization");
    expect(h).not.toHaveProperty("Access-Control-Allow-Credentials");
  });
});

describe("log redaction", () => {
  it("replaces credentials, tokens, cookies, headers and cost fields at any depth", () => {
    const out = scrub({
      password: "x",
      body: { refreshToken: "r", nested: { lines: [{ unitCost: "100.00", qty: "2" }], totalValue: "5" } },
      headers: { authorization: "Bearer t", cookie: "sb_at=1", "user-agent": "ok" },
      SMTP_PASS: "p",
      route: "/api/v1/products",
    }) as Record<string, any>;
    expect(out.password).toBe("[redacted]");
    expect(out.body.refreshToken).toBe("[redacted]");
    expect(out.body.nested.lines[0]).toEqual({ unitCost: "[redacted]", qty: "2" });
    expect(out.body.nested.totalValue).toBe("[redacted]");
    expect(out.headers).toEqual({ authorization: "[redacted]", cookie: "[redacted]", "user-agent": "ok" });
    expect(out.SMTP_PASS).toBe("[redacted]");
    expect(out.route).toBe("/api/v1/products");
  });
});

describe("password policy", () => {
  it.each(["password123", "Password123", "1234567890", "qwertyuiop", "aaaaaaaaaaaa", "abcdefghijkl", "9876543210", "StockBook123"])("rejects %s", (p) => {
    expect(isCommonPassword(p)).toBe(true);
  });
  it.each(["Mango-Rain-42", "Password-123x", "rahim@Godown7"])("accepts %s", (p) => {
    expect(isCommonPassword(p)).toBe(false);
  });
});

describe("backup retention (14 daily, 8 weekly, 12 monthly)", () => {
  const day = 86_400_000;
  const now = Date.parse("2026-10-25T02:00:00+06:00");
  // One nightly backup for 400 days.
  const items = Array.from({ length: 400 }, (_, i) => {
    const at = new Date(now - i * day);
    return { name: backupName(at, "SCHEDULED", true), at };
  });
  const keep = backupsToKeep(items, { daily: 14, weekly: 8, monthly: 12 });

  it("keeps the last 14 days, one per week for 8 weeks and one per month for 12 months", () => {
    for (let i = 0; i < 14; i++) expect(keep.has(items[i]!.name)).toBe(true);
    const weeks = new Set([...keep].map((n) => weekKey(backupTime(n)!)));
    expect(weeks.size).toBeGreaterThanOrEqual(8);
    const months = new Set(items.filter((i) => keep.has(i.name)).map((i) => i.at.toISOString().slice(0, 7)));
    expect(months.size).toBeGreaterThanOrEqual(12);
    expect(keep.size).toBeLessThanOrEqual(14 + 8 + 12);
    expect(keep.has(items[399]!.name)).toBe(false);
  });

  it("never deletes the only backup", () => {
    expect([...backupsToKeep([items[300]!], { daily: 1, weekly: 0, monthly: 0 })]).toEqual([items[300]!.name]);
  });

  it("names backups in Asia/Dhaka time and reads the time back", () => {
    const at = new Date("2026-10-24T20:00:00Z"); // 02:00 on the 25th in Dhaka
    const name = backupName(at, "PRE_MIGRATION", true);
    expect(name).toBe("stockbook-20261025-020000-pre-migration.dump.enc");
    expect(backupTime(name)!.toISOString()).toBe(at.toISOString());
    expect(backupTime("../../etc/passwd")).toBeNull();
  });
});

describe("backup encryption", () => {
  const key = "a-backup-passphrase-of-at-least-32-bytes!";

  it("round-trips through the OpenSSL-compatible stream", async () => {
    const plain = Buffer.from("PGDMP".repeat(10_000));
    const enc: Buffer[] = [];
    const sink = new PassThrough();
    sink.on("data", (c: Buffer) => enc.push(c));
    await pipeline(Readable.from([plain.subarray(0, 7), plain.subarray(7)]), encryptStream(key), sink);
    const encrypted = Buffer.concat(enc);
    expect(encrypted.subarray(0, 8).toString("latin1")).toBe("Salted__");
    expect(encrypted.includes(Buffer.from("PGDMP"))).toBe(false);

    const dec: Buffer[] = [];
    const out = new PassThrough();
    out.on("data", (c: Buffer) => dec.push(c));
    await pipeline(Readable.from([encrypted.subarray(0, 5), encrypted.subarray(5)]), decryptStream(key), out);
    expect(Buffer.concat(dec).equals(plain)).toBe(true);
  });

  it("fails clearly with the wrong key", async () => {
    const enc: Buffer[] = [];
    const sink = new PassThrough();
    sink.on("data", (c: Buffer) => enc.push(c));
    await pipeline(Readable.from([Buffer.from("secret data")]), encryptStream(key), sink);
    await expect(pipeline(Readable.from([Buffer.concat(enc)]), decryptStream("another-passphrase-of-32-bytes-or-more"), new PassThrough())).rejects.toThrow(/wrong BACKUP_ENCRYPTION_KEY/);
  });

  const openssl = spawnSync("openssl", ["version"], { encoding: "utf8" });
  it.skipIf(openssl.status !== 0)("can be decrypted by the openssl command (scripts/restore.sh)", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "sb-enc-"));
    const enc: Buffer[] = [];
    const sink = new PassThrough();
    sink.on("data", (c: Buffer) => enc.push(c));
    await pipeline(Readable.from([Buffer.from("hello from node")]), encryptStream(key), sink);
    writeFileSync(path.join(dir, "x.enc"), Buffer.concat(enc));
    const r = spawnSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-md", "sha256", "-pass", "env:K", "-in", path.join(dir, "x.enc"), "-out", path.join(dir, "x.txt")], { env: { ...process.env, K: key } });
    expect(r.status).toBe(0);
    expect(readFileSync(path.join(dir, "x.txt"), "utf8")).toBe("hello from node");
  });
});

describe("pg tool targets", () => {
  it("moves the password out of the URL and drops Prisma-only parameters", () => {
    const t = libpqTarget("postgresql://sb:p%40ss@localhost:5433/stockbook_test?schema=public&connection_limit=5&sslmode=require", true);
    expect(t.password).toBe("p@ss");
    expect(t.url).toBe("postgresql://sb@host.docker.internal:5433/stockbook_test?sslmode=require");
    expect(t.database).toBe("stockbook_test");
    expect(withDatabase("postgresql://sb:pw@db:5432/stockbook?schema=public", "sb_restore_test_1")).toBe("postgresql://sb:pw@db:5432/sb_restore_test_1?schema=public");
  });
});

describe("PDF rendering is sandboxed", () => {
  it.each(["http://169.254.169.254/latest/meta-data/", "https://example.com/logo.png", "file:///etc/passwd", "ws://localhost:3000", "http://localhost:3000/api/v1/users"])("blocks %s", (url) => {
    expect(isAllowedPdfRequest(url)).toBe(false);
  });
  it("allows only inline data", () => {
    expect(isAllowedPdfRequest("data:font/woff2;base64,AAAA")).toBe(true);
    expect(isAllowedPdfRequest("about:blank")).toBe(true);
  });
});

describe("WORKER_QUEUES", () => {
  const all = ["system", "email", "reports", "backups", "integrity"];
  it("selects all, excludes, or lists queues", () => {
    expect(selectQueues("*", all)).toEqual(all);
    expect(selectQueues("*,!backups", all)).toEqual(["system", "email", "reports", "integrity"]);
    expect(selectQueues("backups", all)).toEqual(["backups"]);
    expect(selectQueues("email, reports, nope", all)).toEqual(["email", "reports"]);
  });
});

describe("graceful shutdown", () => {
  it("stops taking work, waits for in-flight requests, then closes resources in reverse order", async () => {
    resetLifecycle();
    const order: string[] = [];
    onShutdown("prisma", async () => void order.push("prisma"));
    onShutdown("redis", async () => void order.push("redis"));
    const done = trackInFlight();
    let exitCode: number | null = null;
    const p = shutdown("SIGTERM", { timeoutMs: 2000, exit: (c) => void (exitCode = c) });
    expect(isDraining()).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(order).toEqual([]); // still waiting for the request
    order.push("request finished");
    done();
    await p;
    expect(order).toEqual(["request finished", "redis", "prisma"]);
    expect(exitCode).toBe(0);
    expect(inFlight()).toBe(0);
  });

  it("closes anyway after the timeout and runs only once", async () => {
    resetLifecycle();
    const closed: string[] = [];
    onShutdown("db", async () => void closed.push("db"));
    trackInFlight(); // never finishes
    const started = Date.now();
    const a = shutdown("SIGTERM", { timeoutMs: 100, exit: () => undefined });
    const b = shutdown("SIGINT", { timeoutMs: 100, exit: () => undefined });
    expect(a).toBe(b);
    await a;
    expect(Date.now() - started).toBeGreaterThanOrEqual(90);
    expect(closed).toEqual(["db"]);
    resetLifecycle();
  });
});
