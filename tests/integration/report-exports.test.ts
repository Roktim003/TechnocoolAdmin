import ExcelJS from "exceljs";
import { Worker } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as exportRoute from "@/app/api/v1/reports/[id]/exports/route";
import * as statusRoute from "@/app/api/v1/exports/[jobId]/route";
import * as downloadRoute from "@/app/api/v1/exports/[jobId]/download/route";
import { browserPath } from "@/modules/inventory/infrastructure/pdf";
import { ReportFiles } from "@/modules/reporting/application/export.service";
import { reportHtml } from "@/modules/reporting/infrastructure/pdf-writer";
import { hmacLinkSigner } from "@/modules/reporting/infrastructure/signer";
import { writeXlsx } from "@/modules/reporting/infrastructure/xlsx-writer";
import { processReportJob, reporting, viewerOf } from "@/modules/reporting/interface/container";
import { principalForUser } from "@/modules/identity/interface/principal-loader";
import { logger } from "@/shared/logger/logger";
import { QUEUES, queuePrefix } from "@/shared/queue/queue";
import { bullConnection } from "@/shared/redis/redis";
import { call } from "../helpers/http";
import { resetDatabase } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";
import { customer, grn, post, prisma, product, project, userToken, wh } from "../helpers/inventory";
import { customUser } from "../helpers/purchasing";

let token: string;
let worker: Worker;
let A: string;

const requestExport = (id: string, body: Record<string, unknown>, t = token) => call(exportRoute.POST, "POST", "/x", { token: t, params: { id }, body });
const status = (jobId: string, t = token) => call(statusRoute.GET, "GET", "/x", { token: t, params: { jobId } });

async function finished(jobId: string, t = token) {
  for (let i = 0; i < 120; i++) {
    const s = await status(jobId, t);
    if (s.body.data?.status === "completed" || s.body.data?.status === "failed") return s.body.data;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("export did not finish");
}

async function download(url: string) {
  const u = new URL(url, "http://x");
  const jobId = u.pathname.split("/")[4]!;
  return call(downloadRoute.GET, "GET", u.pathname.replace("/api/v1", ""), { params: { jobId }, query: Object.fromEntries(u.searchParams) });
}

async function exportFile(id: string, format: "xlsx" | "pdf", params: Record<string, string> = {}, t = token) {
  const r = await requestExport(id, { format, params }, t);
  if (r.status !== 202) throw new Error(`export ${r.status} ${JSON.stringify(r.body)}`);
  const done = await finished(r.body.data.jobId, t);
  if (done.status !== "completed") throw new Error(`export failed: ${done.failedReason}`);
  const file = await download(done.downloadUrl);
  expect(file.status).toBe(200);
  return { job: done, bytes: file.bytes, headers: file.headers };
}

async function workbook(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  return wb;
}
const headerRow = (ws: ExcelJS.Worksheet) => (ws.getRow(6).values as unknown[]).slice(1).map(String);
const cellText = (ws: ExcelJS.Worksheet, r: number) => String(ws.getRow(r).getCell(1).value ?? "");

/** The HTML a viewer's PDF is printed from (Chromium is not needed to check its content). */
async function pdfHtml(userId: string, reportId: string) {
  const v = viewerOf((await principalForUser(userId))!);
  let html = "";
  const files = new ReportFiles({ reports: reporting().reports, writer: { xlsx: writeXlsx, pdf: async (input) => new TextEncoder().encode((html = await reportHtml(input))) }, companyName: () => "StockBook" });
  await files.build(await reporting().reports.prepare(v, reportId, {}), "pdf", v.name);
  return html;
}

beforeAll(async () => {
  await resetDatabase();
  token = await adminToken();
  A = await wh("A");
  worker = new Worker(QUEUES.reports, (job) => processReportJob(job, logger), { connection: bullConnection(), prefix: queuePrefix() });
  const p1 = await product(token, { sellingPrice: "1500" });
  const p2 = await product(token);
  await grn(token, A, [{ productId: p1.id, qty: 10, unitPrice: 1000 }]);
  await grn(token, await wh("B"), [{ productId: p2.id, qty: 4, unitPrice: 500 }]);
  await post(token, { type: "SALE", warehouseId: A, customerId: await customer(), lines: [{ productId: p1.id, qty: 2 }] });
  await post(token, { type: "ISSUE_TO_PROJECT", warehouseId: A, projectId: await project(), lines: [{ productId: p1.id, qty: 3 }] });
}, 120_000);

afterAll(async () => {
  await worker.close();
  await prisma.$disconnect();
});

describe("Excel export", () => {
  it("header block, frozen bold header with filter, typed columns, totals and chart data", async () => {
    const { bytes, job, headers } = await exportFile("stock-summary", "xlsx", { q: "INV" });
    expect(headers.get("content-type")).toContain("spreadsheetml");
    expect(job.fileName).toMatch(/^stock-summary-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const wb = await workbook(bytes);
    const ws = wb.worksheets[0]!;
    expect(cellText(ws, 1)).toBe("StockBook");
    expect(cellText(ws, 2)).toBe("Stock summary");
    expect(cellText(ws, 3)).toBe("Filters: Search: “INV”");
    expect(cellText(ws, 4)).toMatch(/^Generated \d{2} \w{3} \d{4}, \d{2}:\d{2} \(Asia\/Dhaka\) by /);
    expect(headerRow(ws)).toEqual(["Code", "Product", "Brand", "Category", "Warehouse A", "Warehouse B", "Damaged", "Reserved", "Available", "In transit", "Total", "Avg cost", "Value"]);
    expect(ws.getRow(6).getCell(1).font?.bold).toBe(true);
    expect((ws.getRow(6).getCell(1).fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFE0E0E0");
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 6 });
    expect(ws.autoFilter).toBeTruthy();

    const data = [7, 8].map((r) => ws.getRow(r));
    const values = data.map((r) => r.getCell(13).value).sort();
    expect(values).toEqual([2000, 5000]);
    expect(data[0]!.getCell(13).numFmt).toBe("#,##0.00");
    const total = ws.getRow(9);
    expect(total.getCell(1).value).toBe("Total");
    expect(total.getCell(11).value).toBe(9);
    expect(total.getCell(13).value).toBe(7000);
    expect(wb.getWorksheet("Chart data")).toBeTruthy();
  });

  it("columns the user may not see are absent from the file", async () => {
    const u = await customUser(token, { reports: "VIEW" }, {});
    const wb = await workbook((await exportFile("stock-summary", "xlsx", {}, u.token)).bytes);
    const head = headerRow(wb.worksheets[0]!);
    expect(head).not.toContain("Value");
    expect(head).not.toContain("Avg cost");
    const all = JSON.stringify(wb.worksheets[0]!.getSheetValues());
    expect(all).not.toMatch(/7000|5000/);
    expect(wb.getWorksheet("Chart data")?.getRow(2).values ?? []).not.toContain("Value");
  });

  it("Accounts: profit yes, margin and contract value no (Excel)", async () => {
    const t = (await userToken(token, "Accounts")).token;
    const sales = headerRow((await workbook((await exportFile("sales", "xlsx", {}, t)).bytes)).worksheets[0]!);
    expect(sales).toContain("Profit");
    expect(sales).toContain("Margin %"); // the sale's profit %, covered by seeProfit
    const projects = await workbook((await exportFile("project-cost-summary", "xlsx", {}, t)).bytes);
    const head = headerRow(projects.worksheets[0]!);
    expect(head).toContain("Total cost");
    expect(head).not.toContain("Margin");
    expect(head).not.toContain("Contract value");
    expect(JSON.stringify(projects.worksheets[0]!.getSheetValues())).not.toMatch(/16500000/);
  });
});

describe("PDF export", () => {
  it("Accounts: profit yes, margin and contract value no (PDF content)", async () => {
    const accounts = await userToken(token, "Accounts");
    const sales = await pdfHtml(accounts.id, "sales");
    expect(sales).toContain(">Profit<");
    const projects = await pdfHtml(accounts.id, "project-cost-summary");
    expect(projects).toContain(">Total cost<");
    expect(projects).not.toContain(">Margin<");
    expect(projects).not.toContain("Contract value");
    expect(projects).not.toMatch(/1,65,00,000|16500000/);
    const admin = await prisma.user.findFirstOrThrow({ where: { username: "admin" } });
    expect(await pdfHtml(admin.id, "project-cost-summary")).toContain(">Margin<");
  });

  it("the HTML has the title, filters, KPI tiles, chart SVG and a repeating table header", async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { username: "admin" } });
    const html = await pdfHtml(admin.id, "stock-summary");
    expect(html).toContain("<h1>Stock summary</h1>");
    expect(html).toContain('class="tile"');
    expect(html).toContain("<svg");
    expect(html).toContain("<thead>");
    expect(html).toContain("display: table-header-group");
    expect(html).toContain("IBM Plex Sans");
  });

  it.skipIf(!browserPath())("renders a non-empty PDF in the worker", async () => {
    const { bytes, headers } = await exportFile("stock-movement", "pdf");
    expect(headers.get("content-type")).toContain("application/pdf");
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(5000);
  }, 60_000);
});

describe("export jobs", () => {
  it("every export writes an audit row", async () => {
    const before = await prisma.auditLog.count({ where: { action: "report.export" } });
    const r = await requestExport("sales", { format: "xlsx", params: { dateFrom: "monthStart" } });
    expect(r.status).toBe(202);
    await finished(r.body.data.jobId);
    const rows = await prisma.auditLog.findMany({ where: { action: "report.export" }, orderBy: { createdAt: "desc" } });
    expect(rows.length).toBe(before + 1);
    expect(rows[0]).toMatchObject({ entityType: "Report", entityId: "sales" });
    expect(rows[0]!.after).toMatchObject({ format: "xlsx", jobId: r.body.data.jobId, params: { dateFrom: "monthStart" } });
  });

  it("status is the requester's only; the signed link expires and can't be forged", async () => {
    const r = await requestExport("stock-summary", { format: "xlsx" });
    const done = await finished(r.body.data.jobId);
    expect(done.downloadUrl).toMatch(/\/api\/v1\/exports\/.+\/download\?expires=\d+&signature=[0-9a-f]{64}$/);
    expect(new Date(done.expiresAt).getTime() - Date.now()).toBeGreaterThan(59 * 60_000);

    const other = await customUser(token, { reports: "VIEW" }, { seeCost: true });
    expect((await status(r.body.data.jobId, other.token)).status).toBe(404);

    expect((await download(done.downloadUrl.replace(/signature=[0-9a-f]+/, `signature=${"ab".repeat(32)}`))).status).toBe(403);
    const expired = hmacLinkSigner.sign(`/api/v1/exports/${r.body.data.jobId}/download`, new Date(Date.now() - 1000));
    expect((await download(expired)).status).toBe(403);
  });

  it("an out-of-scope warehouse or a bad format is refused before queueing", async () => {
    const u = await customUser(token, { reports: "VIEW" }, {}, ["B"]);
    expect((await requestExport("stock-summary", { format: "xlsx", params: { warehouseId: A } }, u.token)).status).toBe(403);
    expect((await requestExport("stock-summary", { format: "csv" })).status).toBe(400);
  });
});
