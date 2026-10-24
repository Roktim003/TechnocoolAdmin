import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as schedulesRoute from "@/app/api/v1/report-schedules/route";
import * as scheduleRoute from "@/app/api/v1/report-schedules/[id]/route";
import * as pauseRoute from "@/app/api/v1/report-schedules/[id]/pause/route";
import * as resumeRoute from "@/app/api/v1/report-schedules/[id]/resume/route";
import * as runNowRoute from "@/app/api/v1/report-schedules/[id]/run-now/route";
import * as runsRoute from "@/app/api/v1/report-schedules/[id]/runs/route";
import * as fileRoute from "@/app/api/v1/report-schedules/[id]/runs/[runId]/files/[index]/route";
import { identity } from "@/modules/identity/interface/container";
import { reporting } from "@/modules/reporting/interface/container";
import { getQueue, QUEUES } from "@/shared/queue/queue";
import { storage } from "@/shared/storage/storage";
import { call } from "../helpers/http";
import { resetDatabase, roleId } from "../helpers/db";
import { adminToken, createUser, loginMobile } from "../helpers/fixtures";
import { grn, post, prisma, product, project, wh } from "../helpers/inventory";
import { customUser } from "../helpers/purchasing";

let token: string;
let adminId: string;

const create = (body: Record<string, unknown>, t = token) =>
  call(schedulesRoute.POST, "POST", "/report-schedules", { token: t, body: { reportId: "project-cost-summary", frequency: "WEEKLY", dayOfWeek: 0, time: "09:00", format: "XLSX", ...body } });
async function schedule(body: Record<string, unknown>, t = token) {
  const r = await create(body, t);
  if (r.status !== 201) throw new Error(`schedule ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data;
}
const list = (t = token) => call(schedulesRoute.GET, "GET", "/x", { token: t });
const get = (id: string, t = token) => call(scheduleRoute.GET, "GET", "/x", { token: t, params: { id } });
const patch = (id: string, body: unknown, t = token) => call(scheduleRoute.PATCH, "PATCH", "/x", { token: t, params: { id }, body });
const act = (route: { POST: any }, id: string, t = token) => call(route.POST, "POST", "/x", { token: t, params: { id } });
const runs = (id: string, t = token) => call(runsRoute.GET, "GET", "/x", { token: t, params: { id } });
const file = (id: string, runId: string, index: number, t = token) => call(fileRoute.GET, "GET", "/x", { token: t, params: { id, runId, index: String(index) } });

/** A user with an email address (scheduled reports are emailed). */
async function person(role: string, email: string, warehouses = ["A", "B"]) {
  const u = await createUser(token, { role, email, warehouses });
  return { id: u.id, token: (await loginMobile(u.username, u.password)).accessToken };
}
async function customPerson(levels: Record<string, string>, flags: Record<string, boolean>, email: string) {
  const u = await customUser(token, levels as never, flags);
  await prisma.user.update({ where: { id: u.id }, data: { email } });
  await identity().principalStore.invalidateUser(u.id);
  return u;
}

const emails = async () => (await getQueue(QUEUES.email).getJobs(["waiting", "delayed", "prioritized"])).map((j) => j.data as { to: string; subject: string; attachments?: { filename: string; fileKey: string }[] });
const runJobs = async () => (await getQueue(QUEUES.reports).getJobs(["waiting", "delayed", "prioritized"])).filter((j) => j.name === "schedule-run");

async function headers(fileKey: string) {
  const obj = (await storage().get(fileKey))!;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(obj.body) as unknown as ArrayBuffer);
  return (wb.worksheets[0]!.getRow(6).values as unknown[]).slice(1).map(String);
}

async function setReportsLevel(userId: string, level: "NONE" | "VIEW" | "FULL") {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await prisma.rolePermission.updateMany({ where: { roleId: u.roleId, module: "reports" }, data: { level } });
  await prisma.role.update({ where: { id: u.roleId }, data: { permissionVersion: { increment: 1 } } });
  await identity().principalStore.invalidateRole(u.roleId);
}

beforeEach(async () => {
  await resetDatabase();
  await getQueue(QUEUES.email).obliterate({ force: true });
  await getQueue(QUEUES.reports).obliterate({ force: true });
  token = await adminToken();
  adminId = (await prisma.user.findFirstOrThrow({ where: { username: "admin" } })).id;
  await prisma.user.update({ where: { id: adminId }, data: { email: "admin@example.com" } });
  await identity().principalStore.invalidateUser(adminId);
  const p = await product(token);
  await grn(token, await wh("A"), [{ productId: p.id, qty: 5, unitPrice: 1000 }]);
  await post(token, { type: "ISSUE_TO_PROJECT", warehouseId: await wh("A"), projectId: await project(), lines: [{ productId: p.id, qty: 2 }] });
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("create, edit and list", () => {
  it("creates a weekly schedule with its next run and an audit row", async () => {
    const acc = await person("Accounts", "acc@example.com");
    const s = await schedule({ recipientUserIds: [acc.id], externalEmails: ["Boss@Example.com"], params: { status: "RUNNING" } });
    expect(s).toMatchObject({ description: "Weekly · Sunday 9:00 AM", reportTitle: "Project cost summary", externalEmails: ["boss@example.com"], isActive: true, owner: { id: adminId } });
    const next = new Date(s.nextRunAt);
    expect(next.getTime()).toBeGreaterThan(Date.now());
    expect(next.getTime() - Date.now()).toBeLessThanOrEqual(7 * 86400_000);
    expect(new Date(next.getTime() + 6 * 3600_000).getUTCDay()).toBe(0);
    expect(new Date(next.getTime() + 6 * 3600_000).toISOString().slice(11, 16)).toBe("09:00");
    expect(await prisma.auditLog.count({ where: { action: "report_schedule.create", entityId: s.id } })).toBe(1);

    const edited = await patch(s.id, { frequency: "MONTHLY", dayOfMonth: 31, time: "18:00" });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ description: "Monthly · last day 6:00 PM", dayOfWeek: null, dayOfMonth: 31 });
    expect(await prisma.auditLog.count({ where: { action: "report_schedule.update", entityId: s.id } })).toBe(1);
  });

  it("validation: day per frequency, recipients, filters", async () => {
    expect((await create({ dayOfWeek: null, recipientUserIds: [adminId] })).status).toBe(400);
    expect((await create({ frequency: "MONTHLY", dayOfMonth: 32, recipientUserIds: [adminId] })).status).toBe(400);
    expect((await create({ time: "9am", recipientUserIds: [adminId] })).status).toBe(400);
    expect((await create({ recipientUserIds: [] })).status).toBe(400);
    expect((await create({ reportId: "nope", recipientUserIds: [adminId] })).status).toBe(404);
    expect((await create({ params: { dateFrom: "someday" }, recipientUserIds: [adminId] })).status).toBe(400);
  });

  it("recipients must have Reports access themselves; external emails need FULL", async () => {
    const mgr = await person("Manager", "mgr@example.com");
    const r = await create({ recipientUserIds: [mgr.id] });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body.error.details)).toMatch(/Test User .* access to Reports/);

    const viewer = await customPerson({ reports: "VIEW" }, { seeCost: true }, "viewer@example.com");
    const ext = await create({ recipientUserIds: [viewer.id], externalEmails: ["x@example.com"] }, viewer.token);
    expect(ext.status).toBe(403);
    expect((await create({ recipientUserIds: [viewer.id] }, viewer.token)).status).toBe(201);
  });

  it("VIEW manages its own schedules only; FULL sees everyone's", async () => {
    const viewer = await customPerson({ reports: "VIEW" }, { seeCost: true }, "viewer@example.com");
    const mine = await schedule({ recipientUserIds: [viewer.id] }, viewer.token);
    const admins = await schedule({ recipientUserIds: [adminId] });
    expect((await list(viewer.token)).body.data.map((s: any) => s.id)).toEqual([mine.id]);
    expect((await list()).body.data.map((s: any) => s.id).sort()).toEqual([mine.id, admins.id].sort());
    expect((await get(admins.id, viewer.token)).status).toBe(404);
    expect((await patch(admins.id, { time: "10:00" }, viewer.token)).status).toBe(404);
    expect((await get(mine.id)).status).toBe(200);
    const del = await call(scheduleRoute.DELETE, "DELETE", "/x", { token: viewer.token, params: { id: mine.id } });
    expect(del.status).toBe(204);
    expect(await prisma.auditLog.count({ where: { action: "report_schedule.delete", entityId: mine.id } })).toBe(1);
  });
});

describe("pause, resume and run now", () => {
  it("pause clears the next run, resume sets it again, both audited", async () => {
    const s = await schedule({ recipientUserIds: [adminId] });
    const paused = await act(pauseRoute, s.id);
    expect(paused.body.data).toMatchObject({ isActive: false, nextRunAt: null });
    const resumed = await act(resumeRoute, s.id);
    expect(resumed.body.data.isActive).toBe(true);
    expect(resumed.body.data.nextRunAt).toBeTruthy();
    expect(await prisma.auditLog.count({ where: { entityId: s.id, action: { in: ["report_schedule.pause", "report_schedule.resume"] } } })).toBe(2);
    // A paused schedule is never claimed.
    await act(pauseRoute, s.id);
    await prisma.reportSchedule.update({ where: { id: s.id }, data: { nextRunAt: new Date(Date.now() - 60_000) } });
    expect((await reporting().schedules.tick(new Date())).claimed).toBe(0);
  });

  it("run now: per-recipient files, emails with attachments, run history and downloads", async () => {
    const acc = await person("Accounts", "acc@example.com");
    const accToken = acc.token;
    const s = await schedule({ recipientUserIds: [adminId, acc.id], externalEmails: ["boss@example.com"], format: "XLSX" });
    const r = await act(runNowRoute, s.id);
    expect(r.status).toBe(202);
    expect(await prisma.auditLog.count({ where: { action: "report_schedule.run_now", entityId: s.id } })).toBe(1);
    const jobs = await runJobs();
    expect(jobs.map((j) => j.data.runId)).toEqual([r.body.data.runId]);

    const out = await reporting().schedules.execute(r.body.data.runId);
    expect(out).toMatchObject({ status: "SUCCESS", files: 2, emailed: 3 });

    const sent = await emails();
    expect(sent.map((e) => e.to).sort()).toEqual(["acc@example.com", "admin@example.com", "boss@example.com"]);
    const toAdmin = sent.find((e) => e.to === "admin@example.com")!;
    const toAcc = sent.find((e) => e.to === "acc@example.com")!;
    const toBoss = sent.find((e) => e.to === "boss@example.com")!;
    expect(toAdmin.subject).toContain("Project cost summary");
    expect(toAdmin.attachments![0]!.fileKey).toBe(toBoss.attachments![0]!.fileKey); // externals get the owner's view
    expect(await headers(toAdmin.attachments![0]!.fileKey)).toContain("Margin");
    const accHead = await headers(toAcc.attachments![0]!.fileKey);
    expect(accHead).toContain("Total cost");
    expect(accHead).not.toContain("Margin");
    expect(accHead).not.toContain("Contract value");

    const history = await runs(s.id);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0]).toMatchObject({ trigger: "MANUAL", status: "SUCCESS", emailed: 3 });
    expect(history.body.data[0].files.map((f: any) => f.downloadable)).toEqual([true, true]);
    expect((await get(s.id)).body.data.lastStatus).toBe("SUCCESS");

    // Accounts (FULL, no seeMargin) may download its own file but not the owner's margin file.
    const accHistory = await runs(s.id, accToken);
    const files = accHistory.body.data[0].files;
    const ownerIndex = files.findIndex((f: any) => !f.downloadable);
    expect(ownerIndex).toBeGreaterThanOrEqual(0);
    expect((await file(s.id, history.body.data[0].id, ownerIndex, accToken)).status).toBe(403);
    expect((await file(s.id, history.body.data[0].id, 1 - ownerIndex, accToken)).status).toBe(200);
    const dl = await file(s.id, history.body.data[0].id, 0);
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toContain("spreadsheetml");
  });

  it("BOTH attaches an Excel file and a PDF", async () => {
    const s = await schedule({ recipientUserIds: [adminId], format: "BOTH" });
    // Rendering is tested in report-exports; here a stub PDF keeps the test independent of Chromium.
    const files = reporting().files as unknown as { d: { writer: { pdf: unknown } } };
    const original = files.d.writer.pdf;
    files.d.writer.pdf = async () => new TextEncoder().encode("%PDF-1.4 stub");
    try {
      const { runId } = (await act(runNowRoute, s.id)).body.data;
      expect(await reporting().schedules.execute(runId)).toMatchObject({ status: "SUCCESS", files: 2, emailed: 1 });
      const [mail] = await emails();
      expect(mail!.attachments!.map((a) => a.filename.split(".").pop()).sort()).toEqual(["pdf", "xlsx"]);
    } finally {
      files.d.writer.pdf = original;
    }
  });
});

describe("run as owner", () => {
  it("a recipient who lost access gets nothing; the run lists who was skipped", async () => {
    const acc = await person("Accounts", "acc@example.com");
    const s = await schedule({ recipientUserIds: [adminId, acc.id] });
    await prisma.user.update({ where: { id: acc.id }, data: { roleId: await roleId("Store Manager") } });
    await identity().principalStore.invalidateUser(acc.id);
    const { runId } = (await act(runNowRoute, s.id)).body.data;
    const out = await reporting().schedules.execute(runId);
    expect(out).toMatchObject({ status: "SUCCESS", emailed: 1 });
    expect((await emails()).map((e) => e.to)).toEqual(["admin@example.com"]);
    expect((await runs(s.id)).body.data[0].error).toContain("Not sent to");
  });

  it("external emails go out only while the owner has FULL", async () => {
    const owner = await customPerson({ reports: "FULL" }, { seeCost: true }, "owner@example.com");
    const s = await schedule({ recipientUserIds: [owner.id], externalEmails: ["boss@example.com"] }, owner.token);
    await setReportsLevel(owner.id, "VIEW");
    const runId = await prisma.reportScheduleRun.create({ data: { scheduleId: s.id, trigger: "MANUAL" } }).then((r) => r.id);
    expect(await reporting().schedules.execute(runId)).toMatchObject({ status: "SUCCESS", emailed: 1 });
    expect((await emails()).map((e) => e.to)).toEqual(["owner@example.com"]);
  });

  it("a disabled owner: the run is skipped, marked failed and Admins are notified", async () => {
    const owner = await customPerson({ reports: "VIEW" }, { seeCost: true }, "owner@example.com");
    const s = await schedule({ recipientUserIds: [owner.id] }, owner.token);
    await prisma.user.update({ where: { id: owner.id }, data: { status: "DISABLED" } });
    await identity().principalStore.invalidateUser(owner.id);
    await prisma.reportSchedule.update({ where: { id: s.id }, data: { nextRunAt: new Date(Date.now() - 60_000) } });

    const tick = await reporting().schedules.tick(new Date());
    expect(tick.claimed).toBe(1);
    expect(await reporting().schedules.execute(tick.runIds[0]!)).toMatchObject({ status: "FAILED" });
    expect(await emails()).toHaveLength(1); // only the Admin notice
    const run = await prisma.reportScheduleRun.findFirstOrThrow({ where: { scheduleId: s.id } });
    expect(run).toMatchObject({ status: "FAILED", trigger: "SCHEDULE" });
    expect(run.error).toMatch(/disabled/);
    const notes = await prisma.notification.findMany({ where: { type: "REPORT_SCHEDULE_FAILED" } });
    expect(notes.map((n) => n.userId)).toEqual([adminId]);
    expect((await prisma.reportSchedule.findUniqueOrThrow({ where: { id: s.id } })).lastStatus).toBe("FAILED");
  });

  it("an owner who lost Reports access: failed and Admins notified", async () => {
    const owner = await customPerson({ reports: "VIEW" }, { seeCost: true }, "owner@example.com");
    const s = await schedule({ recipientUserIds: [owner.id] }, owner.token);
    await setReportsLevel(owner.id, "NONE");
    const { runId } = (await act(runNowRoute, s.id)).body.data;
    expect(await reporting().schedules.execute(runId)).toMatchObject({ status: "FAILED" });
    expect(await prisma.notification.count({ where: { type: "REPORT_SCHEDULE_FAILED", userId: adminId } })).toBe(1);
  });
});

describe("scheduler tick", () => {
  it("two workers ticking at once claim a due schedule exactly once and move nextRunAt forward", async () => {
    const s = await schedule({ recipientUserIds: [adminId], frequency: "DAILY", dayOfWeek: null, time: "09:00" });
    await prisma.reportSchedule.update({ where: { id: s.id }, data: { nextRunAt: new Date(Date.now() - 60_000) } });
    const now = new Date();
    const [a, b] = await Promise.all([reporting().schedules.tick(now), reporting().schedules.tick(now)]);
    expect(a.claimed + b.claimed).toBe(1);
    expect(await prisma.reportScheduleRun.count({ where: { scheduleId: s.id } })).toBe(1);
    expect((await runJobs()).length).toBe(1);
    const after = await prisma.reportSchedule.findUniqueOrThrow({ where: { id: s.id } });
    expect(after.nextRunAt!.getTime()).toBeGreaterThan(now.getTime());
    expect((await reporting().schedules.tick(new Date())).claimed).toBe(0);
  });
});
