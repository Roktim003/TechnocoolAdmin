import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { Worker } from "bullmq";
import * as listRoute from "@/app/api/v1/notifications/route";
import * as unreadRoute from "@/app/api/v1/notifications/unread-count/route";
import * as readRoute from "@/app/api/v1/notifications/[id]/read/route";
import * as readAllRoute from "@/app/api/v1/notifications/read-all/route";
import * as prefsRoute from "@/app/api/v1/notification-preferences/route";
import * as alertSettingsRoute from "@/app/api/v1/alert-settings/route";
import * as lowStockRoute from "@/app/api/v1/stock/low-stock/route";
import * as lowStockExportRoute from "@/app/api/v1/stock/low-stock/export/route";
import { inventory } from "@/modules/inventory/interface/container";
import { processEmailJob, setMailer } from "@/modules/notifications/interface/container";
import type { EmailMessage } from "@/modules/notifications/application/ports";
import { getQueue, queuePrefix, QUEUES } from "@/shared/queue/queue";
import { bullConnection } from "@/shared/redis/redis";
import { logger } from "@/shared/logger/logger";
import { call } from "../helpers/http";
import { resetDatabase, roleId } from "../helpers/db";
import { adminToken, createUser, loginMobile } from "../helpers/fixtures";
import { catalogId, categoryId } from "../helpers/catalog";
import { approve, createEntry, grn, key, post, prisma, product, project, receive, reject, wh } from "../helpers/inventory";
import { approveCount, countLine, createCount, lineOf, recount, startCount, submitCount } from "../helpers/control";

let token: string;
let A: string;
let B: string;
let n = 0;

beforeEach(async () => {
  await resetDatabase();
  token = await adminToken();
  A = await wh("A");
  B = await wh("B");
});
afterEach(() => setMailer(null));
afterAll(async () => {
  await getQueue(QUEUES.email).close();
  await getQueue(QUEUES.alerts).close();
});

/** A user with an email address, logged in. */
async function person(role: string, warehouses: string[]) {
  n++;
  const u = await createUser(token, { role, warehouses, email: `user${n}-${Date.now()}@example.com` });
  return { id: u.id as string, email: u.email as string, token: (await loginMobile(u.username, u.password)).accessToken };
}

const inbox = (userId: string, type?: string) => prisma.notification.findMany({ where: { userId, ...(type ? { type } : {}) }, orderBy: { createdAt: "asc" } });
const issue = (productId: string, qty: number, extra: Record<string, unknown> = {}) => ({ type: "ISSUE_TO_PROJECT", warehouseId: A, lines: [{ productId, qty }], ...extra });

describe("notification recipients", () => {
  it("submitted → approvers of that warehouse (not the creator); approved / rejected → the creator", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "10" }]);
    const creator = await person("Store Manager", ["A"]);
    const mgrA = await person("Manager", ["A"]);
    const accountsA = await person("Accounts", ["A", "B"]);
    const mgrB = await person("Manager", ["B"]);
    const storeA = await person("Store Manager", ["A"]);
    const e = (await createEntry(creator.token, { ...issue(p.id, 2), action: "submit", projectId: await project() })).body.data;

    expect((await inbox(mgrA.id, "STOCK_ENTRY_SUBMITTED")).map((x) => x.link)).toEqual([`/stock/${e.id}`]);
    expect(await inbox(accountsA.id, "STOCK_ENTRY_SUBMITTED")).toHaveLength(1);
    expect(await inbox(mgrB.id)).toHaveLength(0); // out of scope
    expect(await inbox(storeA.id)).toHaveLength(0); // can't approve
    expect(await inbox(creator.id, "STOCK_ENTRY_SUBMITTED")).toHaveLength(0); // creator excluded

    await approve(e.id, mgrA.token);
    const [ok] = await inbox(creator.id, "STOCK_ENTRY_APPROVED");
    expect(ok!.title).toBe(`${e.number} was approved`);

    const e2 = (await createEntry(creator.token, { ...issue(p.id, 1), action: "submit", projectId: await project() })).body.data;
    await reject(e2.id, mgrA.token, "Wrong project code");
    const [no] = await inbox(creator.id, "STOCK_ENTRY_REJECTED");
    expect(no!.body).toContain("Wrong project code");
    expect(await inbox(mgrA.id, "STOCK_ENTRY_REJECTED")).toHaveLength(0);
  });

  it("transfer dispatched → users of the destination; received short → approvers of the source", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "10" }]);
    const storeB = await person("Store Manager", ["B"]);
    const storeA = await person("Store Manager", ["A"]);
    const mgrA = await person("Manager", ["A"]);
    const mgrB = await person("Manager", ["B"]);
    const t = await post(token, { type: "TRANSFER", warehouseId: A, toWarehouseId: B, lines: [{ productId: p.id, qty: 4 }] });
    expect(await inbox(storeB.id, "TRANSFER_DISPATCHED")).toHaveLength(1);
    expect(await inbox(mgrB.id, "TRANSFER_DISPATCHED")).toHaveLength(1);
    expect(await inbox(storeA.id, "TRANSFER_DISPATCHED")).toHaveLength(0);

    await receive(t.id, storeB.token, { lines: [{ lineId: t.lines[0].id, receivedQty: 3 }] });
    const [short] = await inbox(mgrA.id, "TRANSFER_SHORTAGE");
    expect(short!.title).toContain("arrived short");
    expect(await inbox(mgrB.id, "TRANSFER_SHORTAGE")).toHaveLength(0);
    expect(await inbox(storeB.id, "TRANSFER_SHORTAGE")).toHaveLength(0);
  });

  it("count submitted → approvers; recount and approval → creator and counters", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 5, unitPrice: "10" }]);
    const creator = await person("Store Manager", ["A"]);
    const counter = await person("Store Manager", ["A"]);
    const mgrA = await person("Manager", ["A"]);
    const mgrB = await person("Manager", ["B"]);
    const c = await createCount(creator.token, { warehouseId: A, scope: "SELECTED_PRODUCTS", scopeIds: [p.id] });
    await startCount(c.id, creator.token);
    await countLine(c.id, lineOf(c, p.id).id, counter.token, { countedQty: "4" });
    await submitCount(c.id, counter.token);
    expect(await inbox(mgrA.id, "STOCK_COUNT_SUBMITTED")).toHaveLength(1);
    expect(await inbox(mgrB.id, "STOCK_COUNT_SUBMITTED")).toHaveLength(0);
    expect(await inbox(counter.id, "STOCK_COUNT_SUBMITTED")).toHaveLength(0);

    await recount(c.id, mgrA.token, [lineOf(c, p.id).id]);
    expect(await inbox(creator.id, "STOCK_COUNT_RECOUNT")).toHaveLength(1);
    expect(await inbox(counter.id, "STOCK_COUNT_RECOUNT")).toHaveLength(1);
    await countLine(c.id, lineOf(c, p.id).id, counter.token, { countedQty: "4" });
    await submitCount(c.id, counter.token);
    await approveCount(c.id, mgrA.token);
    expect(await inbox(creator.id, "STOCK_COUNT_APPROVED")).toHaveLength(1);
    expect(await inbox(counter.id, "STOCK_COUNT_APPROVED")).toHaveLength(1);
    expect(await inbox(mgrA.id, "STOCK_COUNT_APPROVED")).toHaveLength(0);
  });
});

describe("email", () => {
  it("is queued per preference (type default otherwise); in-app always", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "10" }]);
    const creator = await person("Store Manager", ["A"]);
    const on = await person("Manager", ["A"]);
    const off = await person("Manager", ["A"]);
    const res = await call(prefsRoute.PATCH, "PATCH", "/notification-preferences", { token: off.token, body: { preferences: [{ type: "STOCK_ENTRY_SUBMITTED", email: false }] } });
    expect(res.body.data.find((x: any) => x.type === "STOCK_ENTRY_SUBMITTED")).toMatchObject({ email: false, inApp: true });
    expect((await call(prefsRoute.PATCH, "PATCH", "/x", { token: off.token, body: { preferences: [{ type: "NOPE", email: true }] } })).status).toBe(400);

    await createEntry(creator.token, { ...issue(p.id, 1), action: "submit", projectId: await project() });
    expect(await inbox(off.id, "STOCK_ENTRY_SUBMITTED")).toHaveLength(1); // in-app regardless
    const logs = await prisma.emailLog.findMany({ where: { type: "STOCK_ENTRY_SUBMITTED" } });
    expect(logs.map((l) => l.to)).toEqual([on.email]);
    expect(logs[0]).toMatchObject({ status: "QUEUED" });
    const jobs = await getQueue(QUEUES.email).getJobs(["waiting", "delayed"]);
    const job = jobs.find((j) => j.data.emailLogId === logs[0]!.id)!;
    expect(job.opts).toMatchObject({ attempts: 3, backoff: { type: "exponential", delay: 20 } });
    expect(job.data.html).toContain("needs verification");
    expect(job.data.html).toContain("http://localhost:3000/stock/");
  });

  it("retries failures with backoff, then SENT (or FAILED after the last attempt)", async () => {
    let calls = 0;
    const sent: EmailMessage[] = [];
    setMailer({
      configured: true,
      async send(m) {
        calls++;
        if (m.to.startsWith("always-fail") || calls < 3) throw new Error(`SMTP 421 try again (${calls})`);
        sent.push(m);
      },
    });
    const worker = new Worker(QUEUES.email, (job) => processEmailJob(job, logger), { connection: bullConnection(), prefix: queuePrefix() });
    try {
      const svc = (await import("@/modules/notifications/interface/container")).notifications().service;
      const okId = await svc.queueEmail({ to: "someone@example.com", subject: "Hi", html: "<p>x</p>", text: "x" }, null);
      const until = async (id: string, status: string) => {
        for (let i = 0; i < 100; i++) {
          const l = await prisma.emailLog.findUniqueOrThrow({ where: { id } });
          if (l.status === status) return l;
          await new Promise((r) => setTimeout(r, 50));
        }
        throw new Error(`email ${id} never reached ${status}`);
      };
      expect(await until(okId, "SENT")).toMatchObject({ attempts: 3, error: null });
      expect(sent).toHaveLength(1);

      const badId = await svc.queueEmail({ to: "always-fail@example.com", subject: "Hi", html: "<p>x</p>", text: "x" }, null);
      const bad = await until(badId, "FAILED");
      expect(bad.attempts).toBe(3);
      expect(bad.error).toMatch(/SMTP 421/);
    } finally {
      await worker.close();
    }
  });

  it("without SMTP the email is logged as SKIPPED", async () => {
    const { notifications } = await import("@/modules/notifications/interface/container");
    const id = await notifications().service.queueEmail({ to: "x@example.com", subject: "s", html: "h", text: "t" }, null);
    const job = (await getQueue(QUEUES.email).getJobs(["waiting"])).find((j) => j.data.emailLogId === id)!;
    await processEmailJob(job, logger);
    expect((await prisma.emailLog.findUniqueOrThrow({ where: { id } })).status).toBe("SKIPPED");
  });
});

describe("inbox API", () => {
  it("lists, counts unread, marks one / all as read — own notifications only", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "10" }]);
    const creator = await person("Store Manager", ["A"]);
    const mgr = await person("Manager", ["A"]);
    for (let i = 0; i < 3; i++) await createEntry(creator.token, { ...issue(p.id, 1), action: "submit", projectId: await project() });
    expect((await call(unreadRoute.GET, "GET", "/x", { token: mgr.token })).body.data.count).toBe(3);
    const list = (await call(listRoute.GET, "GET", "/notifications", { token: mgr.token, query: { pageSize: 2 } })).body;
    expect(list.meta.total).toBe(3);
    expect(list.data).toHaveLength(2);
    const id = list.data[0].id;
    expect((await call(readRoute.POST, "POST", "/x", { token: creator.token, params: { id } })).status).toBe(404); // not theirs
    expect((await call(readRoute.POST, "POST", "/x", { token: mgr.token, params: { id } })).body.data.readAt).toBeTruthy();
    expect((await call(unreadRoute.GET, "GET", "/x", { token: mgr.token })).body.data.count).toBe(2);
    expect((await call(listRoute.GET, "GET", "/x", { token: mgr.token, query: { unread: "true" } })).body.meta.total).toBe(2);
    expect((await call(readAllRoute.POST, "POST", "/x", { token: mgr.token })).body.data.updated).toBe(2);
    expect((await call(unreadRoute.GET, "GET", "/x", { token: mgr.token })).body.data.count).toBe(0);
  });
});

describe("low stock", () => {
  it("alerts once per crossing below the minimum and re-arms above it (via the alerts queue)", async () => {
    const p = await product(token, { minStockLevel: "5" });
    const mgr = await person("Manager", ["B"]);
    const store = await person("Store Manager", ["A"]);
    const check = () => inventory().alerts.checkCrossings([p.id]);

    await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "10" }]);
    const queued = await getQueue(QUEUES.alerts).getJobs(["waiting"]);
    expect(queued.some((j) => j.name === "low-stock-check" && j.data.productIds.includes(p.id))).toBe(true);
    expect((await check()).crossed).toEqual([]);

    await post(token, { ...issue(p.id, 6), projectId: await project() }); // 4 < 5
    expect((await check()).crossed).toEqual([p.id]);
    await post(token, { ...issue(p.id, 1), projectId: await project() }); // 3: still low
    expect((await check()).crossed).toEqual([]);
    expect(await inbox(mgr.id, "LOW_STOCK")).toHaveLength(1); // Manager role (default recipients), any warehouse
    expect(await inbox(store.id, "LOW_STOCK")).toHaveLength(0);
    expect((await inbox(mgr.id, "LOW_STOCK"))[0]!.body).toContain("Short by 1"); // at the crossing: 4 available, minimum 5

    await grn(token, A, [{ productId: p.id, qty: 5, unitPrice: "10" }]); // 8
    expect((await check()).reset).toEqual([p.id]);
    // Reservations count too: a pending issue makes the available quantity drop.
    const storeA = await person("Store Manager", ["A"]);
    await createEntry(storeA.token, { ...issue(p.id, 4), action: "submit", projectId: await project() }); // available 4
    expect((await check()).crossed).toEqual([p.id]);
    expect(await inbox(mgr.id, "LOW_STOCK")).toHaveLength(2);
  });

  it("list math, filters and Excel export", async () => {
    const lg = await catalogId("LG");
    const low = await product(token, { minStockLevel: "10" });
    const ok = await product(token, { minStockLevel: "2" });
    const daikin = await product(token, { minStockLevel: "4", catalogId: await catalogId("Daikin") });
    await product(token); // no minimum
    await grn(token, A, [{ productId: low.id, qty: 3, unitPrice: "10" }, { productId: ok.id, qty: 5, unitPrice: "10" }]);
    await grn(token, B, [{ productId: low.id, qty: 1, unitPrice: "10" }]);
    const store = await person("Store Manager", ["A"]);
    await createEntry(store.token, { ...issue(low.id, 1), action: "submit", projectId: await project() }); // reserves 1 in A

    const res = await call(lowStockRoute.GET, "GET", "/stock/low-stock", { token });
    expect(res.body.data.map((r: any) => r.product.code)).toEqual([low.code, daikin.code]); // sorted by short-by
    expect(res.body.data[0]).toMatchObject({ totalAvailable: "3.000", minStockLevel: "10.000", shortBy: "7.000", suggestedQty: "17.000" });
    expect(res.body.data[0].warehouses).toEqual([
      { warehouseId: A, code: "A", available: "2.000" },
      { warehouseId: B, code: "B", available: "1.000" },
    ]);
    expect(res.body.data[1]).toMatchObject({ totalAvailable: "0.000", shortBy: "4.000", suggestedQty: "8.000" });

    const byCatalog = await call(lowStockRoute.GET, "GET", "/x", { token, query: { catalogId: lg } });
    expect(byCatalog.body.data.map((r: any) => r.product.code)).toEqual([low.code]);
    const byCategory = await call(lowStockRoute.GET, "GET", "/x", { token, query: { categoryId: await categoryId("Split AC") } });
    expect(byCategory.body.meta.total).toBe(2);
    const onlyB = await call(lowStockRoute.GET, "GET", "/x", { token, query: { warehouseId: B } });
    expect(onlyB.body.data.find((r: any) => r.product.id === low.id)).toMatchObject({ totalAvailable: "1.000", shortBy: "9.000" });
    // Store Manager: per-warehouse columns only for their warehouses; other warehouse → 403.
    const sm = await call(lowStockRoute.GET, "GET", "/x", { token: store.token });
    expect(sm.body.data[0].warehouses.map((w: any) => w.code)).toEqual(["A"]);
    expect((await call(lowStockRoute.GET, "GET", "/x", { token: store.token, query: { warehouseId: B } })).status).toBe(403);

    const xlsx = await call(lowStockExportRoute.GET, "GET", "/x", { token });
    expect(xlsx.headers.get("content-type")).toContain("spreadsheetml");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.bytes as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    expect(ws.getRow(1).values).toEqual(expect.arrayContaining(["Code", "Available A", "Available B", "Short by", "Suggested reorder"]));
    expect(ws.getRow(2).getCell(1).value).toBe(low.code);
  });

  it("daily digest emails the full list to opted-in recipients of the chosen roles", async () => {
    const p = await product(token, { minStockLevel: "3" });
    const mgr = await person("Manager", ["A"]);
    const optOut = await person("Manager", ["A"]);
    const accounts = await person("Accounts", ["A"]);
    await call(prefsRoute.PATCH, "PATCH", "/x", { token: optOut.token, body: { preferences: [{ type: "LOW_STOCK_DIGEST", email: false }] } });
    const r = await inventory().alerts.digest();
    expect(r).toEqual({ products: 1, emailed: 1 });
    const jobs = await getQueue(QUEUES.email).getJobs(["waiting"]);
    const digest = jobs.find((j) => j.data.to === mgr.email)!;
    expect(digest.data.subject).toMatch(/low-stock digest/);
    expect(digest.data.html).toContain(p.code);
    expect(digest.data.text).toContain(p.code);
    expect(jobs.some((j) => j.data.to === accounts.email)).toBe(false); // Accounts isn't a recipient role by default

    // Settings (FULL): add Accounts, schedule the digest; audit-logged.
    const before = (await call(alertSettingsRoute.GET, "GET", "/x", { token })).body.data;
    expect(before).toMatchObject({ digestEnabled: true, digestTime: "09:00" });
    expect(before.roles.map((x: any) => x.name)).toEqual(expect.arrayContaining(["Admin", "Manager", "Accounts"]));
    const upd = await call(alertSettingsRoute.PATCH, "PATCH", "/x", { token, body: { lowStockRoleIds: [...before.lowStockRoleIds, await roleId("Accounts")], digestTime: "08:30" } });
    expect(upd.status).toBe(200);
    expect((await getQueue(QUEUES.alerts).getJobScheduler("low-stock-digest"))?.pattern).toBe("30 8 * * *");
    expect(await prisma.auditLog.count({ where: { action: "alert_settings.update" } })).toBe(1);
    expect((await inventory().alerts.digest()).emailed).toBe(2);
    expect((await call(alertSettingsRoute.PATCH, "PATCH", "/x", { token, body: { digestTime: "25:00" } })).status).toBe(400);
    expect((await call(alertSettingsRoute.GET, "GET", "/x", { token: mgr.token })).status).toBe(403);
    await call(alertSettingsRoute.PATCH, "PATCH", "/x", { token, body: { digestEnabled: false } });
    expect(await getQueue(QUEUES.alerts).getJobScheduler("low-stock-digest")).toBeFalsy();
    expect(await inventory().alerts.digest()).toEqual({ products: 0, emailed: 0 });
    void key;
  });
});
