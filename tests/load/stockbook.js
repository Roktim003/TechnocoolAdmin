/**
 * StockBook load test (k6). Run it against a stack loaded with `npm run seed:large`, never
 * against real data: it creates load-test users and posts stock entries.
 *
 *   docker run --rm -i --network stockbook-prod_edge -v "$PWD/tests/load:/load" grafana/k6:1.3.0 run \
 *     -e BASE_URL=http://web:3000 -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD=... \
 *     --summary-export /load/results/summary.json /load/stockbook.js
 *
 * (Against another host: drop --network and set BASE_URL to its address.)
 *
 * Three scenarios run at the same time (DURATION, default 5m):
 *   browse   30 virtual users, each its own account, clicking through the app with think time
 *   post     10 users posting GRN +1 / ISSUE −1 pairs on the SAME 5 products (lock contention)
 *   exports  3 users exporting 90 days of stock movement to Excel (≈54,000 rows; a year is over
 *            the 100,000-row Excel limit and is refused by design) + 2 users rendering PDFs
 *
 * Each virtual user signs in as its own account (load-01 … load-45, created in setup), because
 * the per-user rate limits (300 API calls / 10 exports a minute) are part of what is measured.
 * Targets (thresholds — k6 exits non-zero if one fails): browse p95 < 500 ms, posting p95 < 1 s,
 * zero failed requests, zero failed checks.
 */
import http from "k6/http";
import { check, fail, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/$/, "") + "/api/v1";
const DURATION = __ENV.DURATION || "5m";
const PASSWORD = __ENV.LOAD_PASSWORD || "Load-Test-Kettle-9182";
const BROWSERS = Number(__ENV.BROWSERS || 30);
const POSTERS = Number(__ENV.POSTERS || 10);
const EXPORTERS = Number(__ENV.EXPORTERS || 3);
const PDFS = Number(__ENV.PDFS || 2);

const posting = new Trend("posting_ms", true);
const exportMs = new Trend("export_ready_ms", true);
const pdfMs = new Trend("pdf_ready_ms", true);
const businessErrors = new Counter("business_errors");

export const options = {
  setupTimeout: "5m",
  scenarios: {
    browse: { executor: "constant-vus", vus: BROWSERS, duration: DURATION, exec: "browse" },
    post: { executor: "constant-vus", vus: POSTERS, duration: DURATION, exec: "post" },
    exports: { executor: "constant-vus", vus: EXPORTERS, duration: DURATION, exec: "exportReport" },
    pdfs: { executor: "constant-vus", vus: PDFS, duration: DURATION, exec: "pdf" },
  },
  thresholds: {
    "http_req_duration{scenario:browse}": ["p(95)<500"],
    posting_ms: ["p(95)<1000"],
    http_req_failed: ["rate==0"],
    checks: ["rate==1"],
    business_errors: ["count==0"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

/* ───────────── helpers ───────────── */

const json = (token, extra = {}) => ({ headers: { Accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra } });
const uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => ((c === "x" ? Math.random() * 16 : (Math.random() * 4) + 8) | 0).toString(16));

function login(username, password) {
  const r = http.post(`${BASE}/auth/login`, JSON.stringify({ username, password, client: "mobile" }), json(null, { tags: { name: "login" } }));
  if (r.status !== 200) fail(`login ${username}: HTTP ${r.status} ${r.body}`);
  return r.json("data.accessToken");
}

function get(token, path, name) {
  const r = http.get(`${BASE}${path}`, Object.assign(json(token), { tags: { name } }));
  check(r, { [`${name} 200`]: (x) => x.status === 200 });
  return r;
}

/* ───────────── setup: accounts and reference data ───────────── */

export function setup() {
  const admin = login(__ENV.ADMIN_USERNAME || "admin", __ENV.ADMIN_PASSWORD || fail("set ADMIN_PASSWORD"));
  const roles = http.get(`${BASE}/roles`, json(admin)).json("data");
  const role = roles.find((r) => r.isLocked);
  const warehouses = http.get(`${BASE}/warehouses`, json(admin)).json("data");
  const total = BROWSERS + POSTERS + EXPORTERS + PDFS;
  for (let i = 1; i <= total; i++) {
    const username = `load-${String(i).padStart(2, "0")}`;
    const r = http.post(`${BASE}/users`, JSON.stringify({ name: `Load test ${i}`, username, roleId: role.id, warehouseIds: warehouses.map((w) => w.id), password: PASSWORD }), Object.assign(json(admin, { "Idempotency-Key": uuid() }), { responseCallback: http.expectedStatuses(201, 409) })); // 409: exists from an earlier run
    if (![201, 409, 422].includes(r.status)) fail(`create ${username}: HTTP ${r.status} ${r.body}`);
  }

  const products = http.get(`${BASE}/products?q=LRG-&trackSerial=false&pageSize=100&sort=code`, json(admin)).json("data");
  if (products.length < 20) fail("Load the large dataset first (npm run seed:large).");
  const supplier = http.get(`${BASE}/suppliers?pageSize=1`, json(admin)).json("data")[0];
  const project = http.get(`${BASE}/projects?q=LP-&pageSize=1`, json(admin)).json("data")[0];
  const entries = http.get(`${BASE}/stock-entries?type=GRN_LOCAL&status=POSTED&pageSize=20`, json(admin)).json("data");
  return {
    warehouseId: warehouses[0].id,
    contended: products.slice(0, 5).map((p) => p.id), // every poster uses these five
    browseProducts: products.map((p) => p.id),
    supplierId: supplier.id,
    projectId: project.id,
    entryIds: entries.map((e) => e.id),
  };
}

/* Per-VU session (k6 keeps module state per VU). VU ids are unique across all scenarios
   (1 … total), so VU n signs in as load-n. */
let token = null;
function session() {
  if (!token) token = login(`load-${String(__VU).padStart(2, "0")}`, PASSWORD);
  return token;
}

/* ───────────── scenarios ───────────── */

export function browse(d) {
  const t = session();
  const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
  get(t, "/dashboard", "dashboard");
  sleep(1 + Math.random() * 2);
  get(t, `/products?q=${pick(["AC", "fan", "pipe", "LRG-01", "duct"])}&pageSize=25`, "products search");
  sleep(1 + Math.random() * 2);
  const id = pick(d.browseProducts);
  get(t, `/products/${id}`, "product detail");
  get(t, `/stock/products/${id}`, "product stock card");
  sleep(1 + Math.random() * 2);
  get(t, "/stock/balances?pageSize=50", "stock balances");
  get(t, "/stock-entries?pageSize=25", "entries list");
  sleep(1 + Math.random() * 2);
  get(t, "/stock/movements?pageSize=50", "movements");
  get(t, "/reports/stock-summary/run?pageSize=50", "report stock summary");
  get(t, "/notifications/unread-count", "unread count");
  sleep(2 + Math.random() * 3);
}

export function post(d) {
  const t = session();
  const lines = (withPrice) => d.contended.map((productId) => ({ productId, qty: 1, ...(withPrice ? { unitPrice: "1000.00" } : {}) }));
  const send = (body, name) => {
    const r = http.post(`${BASE}/stock-entries`, JSON.stringify(body), Object.assign(json(t, { "Idempotency-Key": uuid() }), { tags: { name } }));
    posting.add(r.timings.duration);
    const ok = check(r, { [`${name} 201`]: (x) => x.status === 201 });
    if (!ok) {
      businessErrors.add(1);
      console.warn(`${name}: HTTP ${r.status} ${r.body.slice(0, 300)}`);
    }
  };
  // Receive first, then issue the same quantity: stock on these products never drops below its starting level.
  send({ action: "post", type: "GRN_LOCAL", warehouseId: d.warehouseId, supplierId: d.supplierId, lines: lines(true) }, "post GRN");
  sleep(0.5 + Math.random());
  send({ action: "post", type: "ISSUE_TO_PROJECT", warehouseId: d.warehouseId, projectId: d.projectId, lines: lines(false) }, "post issue");
  sleep(0.5 + Math.random());
}

/** Polls a job until it is completed (or failed / timed out); returns the time it took. */
function waitFor(t, path, name, started) {
  for (let i = 0; i < 120; i++) {
    const r = http.get(`${BASE}${path}`, Object.assign(json(t), { tags: { name } }));
    const status = r.json("data.status");
    if (status === "completed") return { ms: Date.now() - started, url: r.json("data.downloadUrl") };
    if (status === "failed" || r.status !== 200) break;
    sleep(1);
  }
  businessErrors.add(1);
  return null;
}

export function exportReport() {
  const t = session();
  const started = Date.now();
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const r = http.post(`${BASE}/reports/stock-movement/exports`, JSON.stringify({ format: "xlsx", params: { dateFrom: from, dateTo: to } }), Object.assign(json(t, { "Idempotency-Key": uuid() }), { tags: { name: "export request" } }));
  if (!check(r, { "export queued 202": (x) => x.status === 202 })) return void sleep(10);
  const done = waitFor(t, `/exports/${r.json("data.jobId")}`, "export status", started);
  if (done) {
    exportMs.add(done.ms);
    // The signed link is built from APP_URL; keep its path + query and send it to BASE_URL
    // (inside a container network APP_URL's host is not reachable).
    if (done.url) check(http.get(`${BASE.replace(/\/api\/v1$/, "")}${done.url.replace(/^https?:\/\/[^/]+/, "")}`, { tags: { name: "export download" }, responseType: "none" }), { "export download 200": (x) => x.status === 200 });
  }
  sleep(15); // stays under the 10 exports/minute limit
}

export function pdf(d) {
  const t = session();
  const started = Date.now();
  const id = d.entryIds[Math.floor(Math.random() * d.entryIds.length)];
  const r = http.post(`${BASE}/stock-entries/${id}/documents`, JSON.stringify({}), Object.assign(json(t, { "Idempotency-Key": uuid() }), { tags: { name: "pdf request" } }));
  if (!check(r, { "pdf queued 202": (x) => x.status === 202 })) return void sleep(10);
  const jobId = r.json("data.jobId");
  const done = waitFor(t, `/documents/${jobId}`, "pdf status", started);
  if (done) {
    pdfMs.add(done.ms);
    check(http.get(`${BASE}/documents/${jobId}?download=1`, Object.assign(json(t), { tags: { name: "pdf download" }, responseType: "none" })), { "pdf download 200": (x) => x.status === 200 });
  }
  sleep(10);
}
