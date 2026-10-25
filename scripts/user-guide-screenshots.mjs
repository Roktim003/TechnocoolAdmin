#!/usr/bin/env node
/**
 * Screenshots for docs/user-guides/ — one set per role, taken from a running StockBook with
 * sample data (e.g. the local production stack with SEED_SAMPLE_DATA=true, or `npm run dev`).
 *
 *   GUIDE_URL=http://localhost:3000 ADMIN_USERNAME=admin ADMIN_PASSWORD=... npm run docs:screenshots
 *
 * Signs in as the Admin through the API, creates (once) one guide user per standard role —
 * guide-accounts, guide-manager, guide-store (Warehouse A only) — then opens each page in
 * Chrome and saves docs/user-guides/img/<role>-<page>.png (1440 × 900).
 * Needs Google Chrome or Chromium installed; set CHROME_PATH if it is not found.
 */
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const base = (process.env.GUIDE_URL || "http://localhost:3000").replace(/\/$/, "");
const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD;
const guidePassword = process.env.GUIDE_PASSWORD || "Guide-Lantern-4417";
const outDir = new URL("../docs/user-guides/img/", import.meta.url);
if (!adminPassword) throw new Error("Set ADMIN_PASSWORD.");

/** Pages per guide: [file name, path, optional element to wait for]. */
const SHOTS = {
  admin: [
    ["dashboard", "/dashboard"],
    ["users", "/users"],
    ["system-health", "/admin/system"],
    ["background-jobs", "/admin/jobs"],
    ["opening-stock", "/stock/opening"],
  ],
  accounts: [
    ["pending-approvals", "/stock?tab=pending"],
    ["entries", "/stock?tab=entries"],
    ["reports", "/reports"],
    ["purchases", "/purchases"],
  ],
  manager: [
    ["dashboard", "/dashboard"],
    ["purchases", "/purchases"],
    ["new-po", "/purchases/new"],
    ["projects", "/projects"],
    ["low-stock", "/stock/low-stock"],
  ],
  "store-manager": [
    ["new-entry", "/stock?tab=new"],
    ["stock-levels", "/stock?tab=levels"],
    ["serials", "/serials"],
    ["stock-counts", "/stock/counts"],
  ],
};

async function api(method, path, token, body) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(method === "POST" ? { "Idempotency-Key": randomUUID() } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function prepareUsers() {
  const login = await api("POST", "/auth/login", null, { username: adminUsername, password: adminPassword, client: "mobile" });
  if (login.status !== 200) throw new Error(`Admin login failed: HTTP ${login.status}`);
  const token = login.json.data.accessToken;
  const roles = (await api("GET", "/roles", token)).json.data;
  const warehouses = (await api("GET", "/warehouses", token)).json.data;
  const role = (name) => roles.find((r) => r.name === name)?.id ?? (() => { throw new Error(`Role "${name}" not found`); })();
  const users = {
    accounts: { username: "guide-accounts", name: "Accounts (guide)", roleId: role("Accounts"), warehouseIds: warehouses.map((w) => w.id) },
    manager: { username: "guide-manager", name: "Manager (guide)", roleId: role("Manager"), warehouseIds: warehouses.map((w) => w.id) },
    "store-manager": { username: "guide-store", name: "Store Manager (guide)", roleId: role("Store Manager"), warehouseIds: [warehouses[0].id] },
  };
  for (const u of Object.values(users)) {
    const r = await api("POST", "/users", token, { ...u, password: guidePassword });
    if (![201, 409].includes(r.status)) throw new Error(`Creating ${u.username}: HTTP ${r.status} ${r.json?.error?.message ?? ""}`);
  }

  // Something for the "Pending verification" screenshot: the guide Store Manager submits a GRN.
  const pending = await api("GET", "/stock-entries?status=PENDING&pageSize=1", token);
  if (!pending.json?.meta?.total) {
    const store = (await api("POST", "/auth/login", null, { username: users["store-manager"].username, password: guidePassword, client: "mobile" })).json.data.accessToken;
    const supplier = (await api("GET", "/suppliers?pageSize=1", store)).json.data[0];
    const products = (await api("GET", "/products?trackSerial=false&pageSize=3", store)).json.data;
    if (supplier && products.length) {
      await api("POST", "/stock-entries", store, { action: "submit", type: "GRN_LOCAL", warehouseId: warehouses[0].id, supplierId: supplier.id, supplierInvoiceNo: "INV-2041", challanNo: "CH-2041", lines: products.map((p) => ({ productId: p.id, qty: 10 })) });
    }
  }
  return { admin: { username: adminUsername, password: adminPassword }, ...Object.fromEntries(Object.entries(users).map(([k, u]) => [k, { username: u.username, password: guidePassword }])) };
}

async function launch() {
  const executablePath = process.env.CHROME_PATH;
  try {
    return await chromium.launch(executablePath ? { executablePath } : { channel: "chrome" });
  } catch {
    return chromium.launch({ channel: "msedge" }); // Windows always has Edge (Chromium)
  }
}

const accounts = await prepareUsers();
await mkdir(outDir, { recursive: true });
const browser = await launch();
let count = 0;
try {
  for (const [guide, shots] of Object.entries(SHOTS)) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, timezoneId: "Asia/Dhaka", locale: "en-GB" });
    const page = await context.newPage();
    await page.goto(`${base}/login`);
    await page.fill('input[name="username"]', accounts[guide].username);
    await page.fill('input[name="password"]', accounts[guide].password);
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 }), page.click('button[type="submit"]')]);
    for (const [name, path] of shots) {
      await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400); // charts and late lists settle
      const file = fileURLToPath(new URL(`${guide}-${name}.png`, outDir));
      try {
        await page.screenshot({ path: file, fullPage: false });
      } catch (err) {
        process.stdout.write(`retrying ${guide}-${name} (${err.message.split("\n")[0]})\n`);
        await page.waitForTimeout(2000);
        await page.screenshot({ path: file, fullPage: false, animations: "disabled", caret: "initial" });
      }
      process.stdout.write(`saved docs/user-guides/img/${guide}-${name}.png\n`);
      count++;
    }
    await context.close();
  }
} finally {
  await browser.close();
}
process.stdout.write(`${count} screenshots\n`);
