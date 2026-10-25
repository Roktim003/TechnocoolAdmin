#!/usr/bin/env node
/**
 * Post-deploy smoke test. Needs only Node 20+ (no npm install), so any server can run it:
 *
 *   SMOKE_URL=https://stock.example.com SMOKE_USERNAME=smoke SMOKE_PASSWORD=... node scripts/smoke-test.mjs
 *   docker compose -f docker-compose.prod.yml run --rm -e SMOKE_URL=http://web:3000 web smoke-test
 *
 * Checks, in order: liveness, readiness, login as the test user, list products, calculate a
 * stock entry WITHOUT posting it, open a report, log out. Nothing is created or changed.
 * The test user needs catalog VIEW, inventory CREATE and reports VIEW (e.g. the Accounts role,
 * or a dedicated "Smoke test" role). Exit code 0 = all passed.
 */
const base = (process.env.SMOKE_URL || process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const username = process.env.SMOKE_USERNAME || process.argv[3];
const password = process.env.SMOKE_PASSWORD || process.argv[4];
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 15000);

const results = [];
let token = null;
let refreshToken = null;

async function request(method, path, body) {
  const started = Date.now();
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return { status: res.status, json, ms: Date.now() - started };
}

async function step(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (err) {
    results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) });
  }
}

const expect = (r, status, what) => {
  if (r.status !== status) throw new Error(`${what}: HTTP ${r.status} ${r.json?.error?.message ?? ""}`.trim());
  return `${r.status} in ${r.ms} ms`;
};

await step("liveness  GET /health", async () => expect(await request("GET", "/health"), 200, "liveness"));
await step("readiness GET /health/ready", async () => {
  const r = await request("GET", "/health/ready");
  if (r.status !== 200) {
    const down = Object.entries(r.json?.data?.checks ?? {}).filter(([, c]) => c.status !== "up").map(([k]) => k);
    throw new Error(`not ready (${down.join(", ") || r.status})`);
  }
  return `${r.status} in ${r.ms} ms`;
});

if (!username || !password) {
  results.push({ name: "login", ok: false, detail: "set SMOKE_USERNAME and SMOKE_PASSWORD" });
} else {
  await step("login", async () => {
    const r = await request("POST", "/auth/login", { username, password, client: "mobile" });
    const out = expect(r, 200, "login");
    token = r.json.data.accessToken;
    refreshToken = r.json.data.refreshToken;
    return out;
  });

  if (token) {
    let productId = null;
    let warehouses = [];
    await step("list products", async () => {
      const r = await request("GET", "/products?pageSize=5");
      const out = expect(r, 200, "products");
      productId = r.json.data[0]?.id ?? null;
      return `${out}, ${r.json.meta?.total ?? r.json.data.length} products`;
    });
    await step("calculate a stock entry (not posted)", async () => {
      const w = await request("GET", "/warehouses");
      expect(w, 200, "warehouses");
      warehouses = w.json.data;
      if (!productId) return "skipped: no products yet";
      if (warehouses.length < 2) return "skipped: needs two warehouses";
      const r = await request("POST", "/stock-entries/calculate", { type: "TRANSFER", warehouseId: warehouses[0].id, toWarehouseId: warehouses[1].id, lines: [{ productId, qty: 1 }] });
      return expect(r, 200, "calculate");
    });
    await step("open a report (stock summary)", async () => expect(await request("GET", "/reports/stock-summary/run?pageSize=5"), 200, "report"));
    await step("logout", async () => {
      token = null;
      return expect(await request("POST", "/auth/logout", { refreshToken }), 204, "logout");
    });
  }
}

const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) process.stdout.write(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(width)}  ${r.detail ?? ""}\n`);
const failed = results.filter((r) => !r.ok).length;
process.stdout.write(failed ? `\n${failed} check(s) failed against ${base}\n` : `\nAll ${results.length} checks passed against ${base}\n`);
process.exit(failed ? 1 : 0);
