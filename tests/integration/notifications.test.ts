import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { Worker } from "bullmq";
import * as listRoute from "@/app/api/v1/notifications/route";
import * as unreadRoute from "@/app/api/v1/notifications/unread-count/route";
import * as readRoute from "@/app/api/v1/notifications/[id]/read/route";
import * as readAllRoute from "@/app/api/v1/notifications/read-all/route";
import * as prefsRoute from "@/app/api/v1/notification-preferences/route";
import * as devicesRoute from "@/app/api/v1/push-devices/route";
import * as deviceRoute from "@/app/api/v1/push-devices/[id]/route";
import * as openapiRoute from "@/app/api/v1/openapi.json/route";
import * as alertSettingsRoute from "@/app/api/v1/alert-settings/route";
import * as lowStockRoute from "@/app/api/v1/stock/low-stock/route";
import * as lowStockExportRoute from "@/app/api/v1/stock/low-stock/export/route";
import { inventory } from "@/modules/inventory/interface/container";
import { processEmailJob, processPushJob, setMailer, setPushSender } from "@/modules/notifications/interface/container";
import type { EmailMessage, PushMessage, PushResult } from "@/modules/notifications/application/ports";
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

/* ───────────────────────────── push (mobile app) ───────────────────────────── */

describe("push notifications", () => {
  /** A fake FCM: per-token answers, records what was sent. */
  function fakeFcm(answer: (token: string) => PushResult = () => ({ ok: true })) {
    const sent: PushMessage[] = [];
    setPushSender({
      configured: true,
      async send(m) {
        sent.push(m);
        return answer(m.token);
      },
    });
    return sent;
  }
  const fcm = (s: string) => `${s}-fcm-token-${"x".repeat(24)}`;
  const register = (tok: string, fcmToken: string, extra: Record<string, unknown> = {}) =>
    call(devicesRoute.POST, "POST", "/push-devices", { token: tok, body: { token: fcmToken, platform: "android", deviceName: "Galaxy A15", appVersion: "1.0.0", ...extra } });
  const myDevices = async (tok: string) => (await call(devicesRoute.GET, "GET", "/push-devices", { token: tok })).body.data as any[];
  const pushJobs = async () => (await getQueue(QUEUES.push).getJobs(["waiting", "delayed"])).sort((a, b) => a.timestamp - b.timestamp || a.data.deviceId.localeCompare(b.data.deviceId));

  afterEach(() => setPushSender(null));
  afterAll(async () => {
    await getQueue(QUEUES.push).close();
  });

  it("registers phones (own only); a token moves to whoever signs in on that phone; at most 10 per user", async () => {
    const a = await person("Store Manager", ["A"]);
    const b = await person("Manager", ["A"]);
    const first = await register(a.token, fcm("one"));
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ platform: "ANDROID", deviceName: "Galaxy A15", appVersion: "1.0.0" });
    expect(first.body.data).not.toHaveProperty("token");
    const again = await register(a.token, fcm("one"), { appVersion: "1.0.1" });
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ id: first.body.data.id, appVersion: "1.0.1" });
    expect((await register(a.token, fcm("two"), { platform: "WINDOWS" })).status).toBe(400);
    expect((await register(a.token, "short")).status).toBe(400);
    expect((await call(devicesRoute.POST, "POST", "/push-devices", { body: { token: fcm("anon"), platform: "IOS" } })).status).toBe(401);

    // Someone else signs in on the same phone.
    expect((await register(b.token, fcm("one"), { platform: "IOS" })).status).toBe(200);
    expect(await myDevices(a.token)).toEqual([]);
    const [moved] = await myDevices(b.token);
    expect(moved).toMatchObject({ id: first.body.data.id, platform: "IOS" });

    const remove = (tok: string, id: string) => call(deviceRoute.DELETE, "DELETE", `/push-devices/${id}`, { token: tok, params: { id } });
    expect((await remove(a.token, moved.id)).status).toBe(404); // not theirs
    expect((await remove(b.token, "not-a-uuid")).status).toBe(404);
    expect((await remove(b.token, moved.id)).status).toBe(204);
    expect((await remove(b.token, moved.id)).status).toBe(404);

    for (let i = 1; i <= 10; i++) await register(a.token, fcm(`phone${i}`));
    await prisma.pushDevice.update({ where: { token: fcm("phone1") }, data: { lastSeenAt: new Date("2026-01-01T00:00:00Z") } });
    await register(a.token, fcm("phone11"));
    const kept = await prisma.pushDevice.findMany({ where: { userId: a.id } });
    expect(kept).toHaveLength(10);
    expect(kept.map((d) => d.token)).not.toContain(fcm("phone1")); // least recently seen dropped
  });

  it("each notification queues one push per phone with its notification id; the push preference can turn a type off", async () => {
    fakeFcm();
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "10" }]);
    const creator = await person("Store Manager", ["A"]);
    const twoPhones = await person("Manager", ["A"]);
    const muted = await person("Manager", ["A"]);
    const noPhone = await person("Accounts", ["A"]);
    await register(twoPhones.token, fcm("m1"));
    await register(twoPhones.token, fcm("m2"), { platform: "IOS" });
    await register(muted.token, fcm("muted"));
    await register(creator.token, fcm("creator"));
    const res = await call(prefsRoute.PATCH, "PATCH", "/notification-preferences", { token: muted.token, body: { preferences: [{ type: "STOCK_ENTRY_SUBMITTED", push: false }] } });
    expect(res.body.data.find((x: any) => x.type === "STOCK_ENTRY_SUBMITTED")).toMatchObject({ push: false, email: true }); // email keeps its default

    const e = (await createEntry(creator.token, { ...issue(p.id, 1), action: "submit", projectId: await project() })).body.data;
    const [n] = await inbox(twoPhones.id, "STOCK_ENTRY_SUBMITTED");
    const jobs = await pushJobs();
    expect(jobs.map((j) => j.data.userId)).toEqual([twoPhones.id, twoPhones.id]);
    expect(jobs[0]!.data).toMatchObject({ notificationId: n!.id, type: "STOCK_ENTRY_SUBMITTED", title: n!.title, body: n!.body, link: `/stock/${e.id}` });
    expect(jobs[0]!.opts).toMatchObject({ attempts: 4, backoff: { type: "exponential", delay: 5000 } });
    expect(await inbox(muted.id, "STOCK_ENTRY_SUBMITTED")).toHaveLength(1); // still in-app
    expect((await prisma.emailLog.findMany({ where: { type: "STOCK_ENTRY_SUBMITTED" } })).map((l) => l.to)).toEqual(expect.arrayContaining([muted.email, noPhone.email]));

    // Without FCM configured nothing is queued.
    setPushSender(null);
    await getQueue(QUEUES.push).obliterate({ force: true });
    await createEntry(creator.token, { ...issue(p.id, 1), action: "submit", projectId: await project() });
    expect(await pushJobs()).toHaveLength(0);
  });

  it("the worker sends with the unread count as badge, removes dead tokens, retries temporary errors and skips phones that moved", async () => {
    const sent = fakeFcm((t) =>
      t === fcm("dead") ? { ok: false, error: "FCM 404 UNREGISTERED", invalidToken: true, retryable: false } : t === fcm("busy") ? { ok: false, error: "FCM 503 UNAVAILABLE", invalidToken: false, retryable: true } : { ok: true },
    );
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "10" }]);
    const creator = await person("Store Manager", ["A"]);
    const mgr = await person("Manager", ["A"]);
    const other = await person("Manager", ["B"]);
    for (const name of ["good", "dead", "busy", "moved"]) await register(mgr.token, fcm(name));
    await createEntry(creator.token, { ...issue(p.id, 1), action: "submit", projectId: await project() });
    await createEntry(creator.token, { ...issue(p.id, 1), action: "submit", projectId: await project() });
    await register(other.token, fcm("moved")); // signs in on that phone before the push goes out

    const deviceOf = async (name: string) => (await prisma.pushDevice.findUnique({ where: { token: fcm(name) } }))?.id;
    const ids = { good: await deviceOf("good"), dead: await deviceOf("dead"), busy: await deviceOf("busy"), moved: await deviceOf("moved") };
    const jobs = await pushJobs();
    expect(jobs).toHaveLength(8); // 2 notifications × 4 phones
    const jobFor = (name: keyof typeof ids, nth = 0) => jobs.filter((j) => j.data.deviceId === ids[name])[nth]!;

    expect(await processPushJob(jobFor("good"), logger)).toBe("SENT");
    expect(sent.at(-1)).toMatchObject({ token: fcm("good"), badge: 2, data: { type: "STOCK_ENTRY_SUBMITTED", link: expect.stringMatching(/^\/stock\//), notificationId: expect.any(String) } });
    expect(await processPushJob(jobFor("dead"), logger)).toBe("INVALID_TOKEN");
    expect(await deviceOf("dead")).toBeUndefined();
    await expect(processPushJob(jobFor("busy"), logger)).rejects.toThrow("FCM 503 UNAVAILABLE");
    expect(await deviceOf("busy")).toBeTruthy();
    expect(await processPushJob(jobFor("moved"), logger)).toBe("GONE");
    expect(sent.map((m) => m.token)).not.toContain(fcm("moved"));

    // Reading notifications lowers the badge on the next push.
    await call(readAllRoute.POST, "POST", "/x", { token: mgr.token });
    await processPushJob(jobFor("good", 1), logger);
    expect(sent.at(-1)!.badge).toBe(0);

    setPushSender(null);
    expect(await processPushJob(jobFor("good", 1), logger)).toBe("SKIPPED");
  });

  it("preferences: push per in-app type, none for email-only types; each change touches only the channels given", async () => {
    const u = await person("Manager", ["A"]);
    const get = async () => (await call(prefsRoute.GET, "GET", "/notification-preferences", { token: u.token })).body.data as any[];
    const of = (list: any[], type: string) => list.find((x) => x.type === type);
    let prefs = await get();
    expect(of(prefs, "STOCK_ENTRY_APPROVED")).toMatchObject({ inApp: true, push: true, email: false });
    expect(of(prefs, "LOW_STOCK_DIGEST")).toMatchObject({ inApp: false, push: false, email: true });

    const patch = (preferences: unknown[]) => call(prefsRoute.PATCH, "PATCH", "/notification-preferences", { token: u.token, body: { preferences } });
    expect((await patch([{ type: "STOCK_ENTRY_APPROVED", email: true }])).status).toBe(200);
    expect((await patch([{ type: "STOCK_ENTRY_APPROVED", push: false }])).status).toBe(200);
    prefs = await get();
    expect(of(prefs, "STOCK_ENTRY_APPROVED")).toMatchObject({ push: false, email: true });
    expect((await patch([{ type: "LOW_STOCK_DIGEST", push: true }])).status).toBe(400);
    expect((await patch([{ type: "STOCK_ENTRY_APPROVED" }])).status).toBe(400);

    // The digests read the stored email choice directly: an explicit "off" still turns them off.
    expect((await patch([{ type: "LOW_STOCK_DIGEST", email: false }])).status).toBe(200);
    expect(of(await get(), "LOW_STOCK_DIGEST").email).toBe(false);
  });

  it("is documented in OpenAPI", async () => {
    const doc = await (await openapiRoute.GET()).json();
    const ops = Object.entries(doc.paths as Record<string, object>).flatMap(([p, methods]) => Object.keys(methods).map((m) => `${m.toUpperCase()} ${p}`));
    expect(ops).toEqual(expect.arrayContaining(["GET /push-devices", "POST /push-devices", "DELETE /push-devices/{id}", "GET /notification-preferences", "PATCH /notification-preferences"]));
    expect(doc.components.schemas.NotificationPreferenceItem.properties).toHaveProperty("push");
    expect(doc.components.schemas.PushDeviceItem.properties).not.toHaveProperty("token");
  });
});
