#!/usr/bin/env node
/**
 * Dependency audit for CI: fails on any HIGH or CRITICAL advisory (production and development
 * dependencies) that is not in security/audit-allowlist.json, and on allow-list entries that
 * have expired. Each exception must say why it is acceptable and until when.
 *
 *   npm run audit:deps
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const allowlist = JSON.parse(readFileSync(new URL("../security/audit-allowlist.json", import.meta.url), "utf8")).advisories;
const today = new Date().toISOString().slice(0, 10);

// Under `npm run` npm's own CLI is in npm_execpath: run it with this node (no shell needed on
// Windows). Run directly, fall back to `npm` on the PATH.
const npmCli = process.env.npm_execpath;
const [cmd, args] = npmCli?.endsWith(".js") ? [process.execPath, [npmCli, "audit", "--json"]] : ["npm", ["audit", "--json"]];
let raw;
try {
  raw = execFileSync(cmd, args, { encoding: "utf8", shell: cmd === "npm" && process.platform === "win32", maxBuffer: 64 * 1024 * 1024 });
} catch (err) {
  raw = err.stdout; // npm audit exits non-zero when it finds anything
}
const report = JSON.parse(raw);

/** Every advisory (GHSA id) with its severity and the packages it reaches. */
const advisories = new Map();
for (const [pkg, v] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of v.via) {
    if (typeof via === "string") continue;
    const id = via.url?.split("/").pop() ?? String(via.source);
    const a = advisories.get(id) ?? { id, title: via.title, severity: via.severity, packages: new Set() };
    a.packages.add(pkg);
    advisories.set(id, a);
  }
}

const blocking = [];
const allowed = [];
for (const a of advisories.values()) {
  if (!["high", "critical"].includes(a.severity)) continue;
  const entry = allowlist.find((x) => x.id === a.id);
  if (!entry) blocking.push(`${a.severity.toUpperCase()} ${a.id} ${a.title} (${[...a.packages].join(", ")})`);
  else if (entry.expires < today) blocking.push(`EXPIRED EXCEPTION ${a.id} (expired ${entry.expires}): review it again`);
  else allowed.push(`${a.id} until ${entry.expires}: ${entry.reason}`);
}
const unused = allowlist.filter((x) => !advisories.has(x.id)).map((x) => x.id);

if (allowed.length) console.log(`Accepted (security/audit-allowlist.json):\n  ${allowed.join("\n  ")}`);
if (unused.length) console.log(`Allow-list entries no longer needed (remove them): ${unused.join(", ")}`);
if (blocking.length) {
  console.error(`\nDependency audit FAILED: ${blocking.length} high/critical advisor${blocking.length === 1 ? "y" : "ies"}:\n  ${blocking.join("\n  ")}`);
  process.exit(1);
}
const counts = report.metadata?.vulnerabilities ?? {};
console.log(`\nDependency audit passed (critical ${counts.critical ?? 0}, high ${counts.high ?? 0} all accepted; moderate ${counts.moderate ?? 0}, low ${counts.low ?? 0} are reported only).`);
