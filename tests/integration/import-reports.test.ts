import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as runRoute from "@/app/api/v1/reports/[id]/run/route";
import * as attachmentsRoute from "@/app/api/v1/stock-entries/[id]/attachments/route";
import * as postRoute from "@/app/api/v1/stock-entries/[id]/post/route";
import * as submitRoute from "@/app/api/v1/stock-entries/[id]/submit/route";
import { identity } from "@/modules/identity/interface/container";
import { principalForUser } from "@/modules/identity/interface/principal-loader";
import { inventory } from "@/modules/inventory/interface/container";
import { renderDocumentHtml } from "@/modules/inventory/infrastructure/document-template";
import { ReportFiles } from "@/modules/reporting/application/export.service";
import { reportHtml } from "@/modules/reporting/infrastructure/pdf-writer";
import { writeXlsx } from "@/modules/reporting/infrastructure/xlsx-writer";
import { reporting, viewerOf } from "@/modules/reporting/interface/container";
import { call } from "../helpers/http";
import { resetDatabase } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";
import { action, createEntry, grn, prisma, product, supplier, userToken, wh } from "../helpers/inventory";
import { customUser } from "../helpers/purchasing";

/**
 * Import documents in the reports and the GRN PDF: the new "Import shipments" report (15), BL /
 * B/E numbers in stock movement and purchases by supplier, B/E + origin in the serial lookup.
 *
 * Fixture: G1 (warehouse A, posted, all documents with files), G2 (A, pending, CI file only →
 * incomplete), G3 (B, posted) and a local GRN in A.
 */

let token: string;
let A: string;
let B: string;
const ids = {} as Record<"g1" | "g2" | "g3" | "local" | "g1No" | "g2No" | "g3No" | "g1Cost" | "adminId", string>;

const CI_VALUE = "2345.67"; // unique in the fixture: must not leak to viewers without seeCost

const PDF = (text: string) => new TextEncoder().encode(`%PDF-1.4\n% ${text}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);
async function upload(entryId: string, docType: string, name: string) {
  const fd = new FormData();
  fd.append("file", new File([PDF(name) as BlobPart], name, { type: "application/pdf" }));
  fd.append("docType", docType);
  const r = await call(attachmentsRoute.POST, "POST", `/stock-entries/${entryId}/attachments`, { token, params: { id: entryId }, body: fd });
  if (r.status !== 201) throw new Error(`upload ${r.status} ${JSON.stringify(r.body)}`);
}

async function importDraft(warehouseId: string, lines: Record<string, unknown>[], importShipment: Record<string, unknown>) {
  const r = await createEntry(token, {
    action: "draft",
    type: "GRN_IMPORT",
    warehouseId,
    supplierId: await supplier("Daikin Airconditioning (Thailand)"),
    currency: "USD",
    exchangeRate: "120",
    lines,
    charges: [{ type: "CUSTOMS_DUTY", mode: "PERCENT_OF_GOODS", value: "10", includeInCost: true }],
    importShipment,
  });
  if (r.status !== 201) throw new Error(`draft ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data as { id: string };
}

async function act(route: { POST: unknown }, id: string) {
  const r = await action(route, id, token);
  if (r.status !== 200 && r.status !== 201) throw new Error(`action ${r.status} ${JSON.stringify(r.body)}`);
  return (await prisma.stockEntry.findUniqueOrThrow({ where: { id } })) as { number: string | null; costTotal: { toFixed(n: number): string } };
}

const run = (id: string, query: Record<string, string | number> = {}, t = token) => call(runRoute.GET, "GET", "/x", { token: t, params: { id }, query });
const rowsOf = async (id: string, query: Record<string, string | number> = {}, t = token) => {
  const r = await run(id, query, t);
  if (r.status !== 200) throw new Error(`${id} ${r.status} ${JSON.stringify(r.body)}`);
  return r.body as { data: any[]; meta: any; totals: Record<string, any>; report: any };
};
const keysOf = (r: { report: any }) => r.report.columns.map((c: any) => c.key);

/** Builds a report file through the export engine as `userId` would get it (no worker / Chromium). */
async function reportFile(userId: string, reportId: string, format: "xlsx" | "pdf", params: Record<string, string> = {}) {
  const v = viewerOf((await principalForUser(userId))!);
  let html = "";
  const files = new ReportFiles({ reports: reporting().reports, writer: { xlsx: writeXlsx, pdf: async (input) => new TextEncoder().encode((html = await reportHtml(input))) }, companyName: () => "StockBook" });
  const built = await files.build(await reporting().reports.prepare(v, reportId, params), format, v.name);
  return { bytes: built.bytes, html };
}

async function sheet(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  return wb.worksheets[0]!;
}
const headerRow = (ws: ExcelJS.Worksheet) => (ws.getRow(6).values as unknown[]).slice(1).map(String);

/** The seeded Store Manager role (no seeCost) with Reports VIEW, so it can run the report at all. */
async function storeManagerWithReports() {
  const sm = await userToken(token, "Store Manager");
  const u = await prisma.user.findUniqueOrThrow({ where: { id: sm.id } });
  await prisma.rolePermission.updateMany({ where: { roleId: u.roleId, module: "reports" }, data: { level: "VIEW" } });
  await prisma.role.update({ where: { id: u.roleId }, data: { permissionVersion: { increment: 1 } } });
  await identity().principalStore.invalidateRole(u.roleId);
  return sm;
}

beforeAll(async () => {
  await resetDatabase();
  token = await adminToken();
  A = await wh("A");
  B = await wh("B");
  ids.adminId = (await prisma.user.findFirstOrThrow({ where: { username: "admin" } })).id;
  const pSer = await product(token, { trackSerial: true });
  const p2 = await product(token);
  const p3 = await product(token);

  // G1: every document, files for BL, CI and B/E → posted (CI + B/E are required by default).
  const g1 = await importDraft(A, [{ productId: pSer.id, qty: 2, unitPrice: "200", serials: ["SN-IMP-001", "SN-IMP-002"], countryOfOrigin: "Malaysia" }, { productId: p2.id, qty: 5, unitPrice: "100" }], {
    blNo: "BL-RPT-1",
    blDate: "2026-10-01",
    shippingLine: "Maersk",
    containerNumbers: ["MSKU1234567", "MSKU7654321"],
    coNo: "CO-RPT-1",
    coDate: "2026-09-28",
    countryOfOrigin: "Thailand",
    plNo: "PL-RPT-1",
    packageCount: 12,
    ciNo: "CI-RPT-1",
    ciDate: "2026-09-27",
    ciCurrency: "USD",
    ciValue: CI_VALUE,
    incoterm: "CIF",
    boeNo: "BE-RPT-1",
    boeDate: "2026-10-12",
    customsStation: "Chattogram Custom House",
  });
  await upload(g1.id, "BL", "bl-scan.pdf");
  await upload(g1.id, "CI", "invoice-5521.pdf");
  await upload(g1.id, "BOE", "bill-of-entry.pdf");
  const g1Posted = await act(postRoute, g1.id);
  Object.assign(ids, { g1: g1.id, g1No: g1Posted.number!, g1Cost: g1Posted.costTotal.toFixed(2) });

  // G2: only the CI file → submitted, waiting for verification, documents incomplete.
  const g2 = await importDraft(A, [{ productId: p3.id, qty: 3, unitPrice: "50" }], {
    blNo: "BL-RPT-2",
    ciNo: "CI-RPT-2",
    boeNo: "BE-RPT-2",
    countryOfOrigin: "China",
    customsStation: "Benapole Land Port",
  });
  await upload(g2.id, "CI", "ci-2.pdf");
  Object.assign(ids, { g2: g2.id, g2No: (await act(submitRoute, g2.id)).number! });

  // G3: warehouse B, posted.
  const g3 = await importDraft(B, [{ productId: p2.id, qty: 1, unitPrice: "100" }], { blNo: "BL-RPT-3", ciNo: "CI-RPT-3", boeNo: "BE-RPT-3", customsStation: "Chattogram Custom House" });
  await upload(g3.id, "CI", "ci-3.pdf");
  await upload(g3.id, "BOE", "be-3.pdf");
  Object.assign(ids, { g3: g3.id, g3No: (await act(postRoute, g3.id)).number! });

  ids.local = (await grn(token, A, [{ productId: p3.id, qty: 4, unitPrice: 10 }])).id;
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("15 · import shipments", () => {
  it("one row per posted / pending GRN (Imported) with its documents, files and completeness", async () => {
    const r = await rowsOf("import-shipments");
    expect(r.report).toMatchObject({ number: 15, group: "Purchases", title: "Import shipments" });
    expect(r.data.map((x) => x.grnNo).sort()).toEqual([ids.g1No, ids.g2No, ids.g3No].sort());
    const g1 = r.data.find((x) => x.grnNo === ids.g1No);
    expect(g1).toMatchObject({
      supplier: "Daikin Airconditioning (Thailand)",
      blNo: "BL-RPT-1",
      containers: "MSKU1234567, MSKU7654321",
      ciNo: "CI-RPT-1",
      ciCurrency: "USD",
      ciValue: CI_VALUE,
      boeNo: "BE-RPT-1",
      boeDate: "2026-10-12",
      customsStation: "Chattogram Custom House",
      landedCostTotal: ids.g1Cost,
      files: 3,
      documents: "COMPLETE",
      status: "POSTED",
    });
    expect(g1.origins).toContain("Malaysia");
    expect(g1._links.grnNo).toBe(`/stock/${ids.g1}`);
    const g2 = r.data.find((x) => x.grnNo === ids.g2No);
    expect(g2).toMatchObject({ files: 1, documents: "INCOMPLETE", status: "PENDING", origins: "China", ciValue: null });
    expect(r.totals).toMatchObject({ grns: 3, incomplete: 1 });
    expect(keysOf(r)).toEqual(["grnNo", "date", "supplier", "blNo", "containers", "ciNo", "ciCurrency", "ciValue", "boeNo", "boeDate", "customsStation", "origins", "landedCostTotal", "files", "documents", "status"]);
  });

  it("filters: documents incomplete only, customs station, country of origin, supplier", async () => {
    const inc = await rowsOf("import-shipments", { incompleteOnly: "true" });
    expect(inc.data.map((x) => x.grnNo)).toEqual([ids.g2No]);
    expect(inc.totals).toMatchObject({ grns: 1, incomplete: 1 });
    expect((await rowsOf("import-shipments", { customsStation: "benapole" })).data.map((x) => x.grnNo)).toEqual([ids.g2No]);
    expect((await rowsOf("import-shipments", { country: "malays" })).data.map((x) => x.grnNo)).toEqual([ids.g1No]);
    expect((await rowsOf("import-shipments", { country: "china" })).data.map((x) => x.grnNo)).toEqual([ids.g2No]);
    expect((await rowsOf("import-shipments", { supplierId: await supplier() })).data).toHaveLength(0);
  });

  it("follows InventorySettings.importDocsRequiredToPost", async () => {
    await prisma.inventorySettings.update({ where: { id: 1 }, data: { importDocsRequiredToPost: ["CI"] } });
    try {
      expect((await rowsOf("import-shipments", { incompleteOnly: "true" })).data).toHaveLength(0);
    } finally {
      await prisma.inventorySettings.update({ where: { id: 1 }, data: { importDocsRequiredToPost: ["CI", "BOE"] } });
    }
  });

  it("rows are limited to the user's warehouses; another warehouse is 403", async () => {
    const u = await customUser(token, { reports: "VIEW" }, { seeCost: true }, ["A"]);
    expect((await rowsOf("import-shipments", {}, u.token)).data.map((x) => x.grnNo).sort()).toEqual([ids.g1No, ids.g2No].sort());
    expect((await run("import-shipments", { warehouseId: B }, u.token)).status).toBe(403);
  });

  it("Store Manager (no seeCost): no CI value or landed cost in the JSON or the Excel file", async () => {
    const sm = await storeManagerWithReports();
    const r = await rowsOf("import-shipments", {}, sm.token);
    expect(keysOf(r)).not.toContain("ciValue");
    expect(keysOf(r)).not.toContain("landedCostTotal");
    expect(keysOf(r)).toContain("ciNo");
    for (const row of r.data) {
      expect(row).not.toHaveProperty("ciValue");
      expect(row).not.toHaveProperty("landedCostTotal");
    }
    expect(r.totals).not.toHaveProperty("landedCostTotal");
    expect(JSON.stringify(r)).not.toContain(CI_VALUE);

    const ws = await sheet((await reportFile(sm.id, "import-shipments", "xlsx")).bytes);
    const head = headerRow(ws);
    expect(head).toContain("CI no.");
    expect(head).toContain("B/E no.");
    expect(head).not.toContain("CI value");
    expect(head).not.toContain("Landed cost total");
    expect(JSON.stringify(ws.getSheetValues())).not.toMatch(/2345\.67|2,345\.67/);
  });

  it("Excel and PDF through the export engine (Admin sees the cost columns)", async () => {
    const ws = await sheet((await reportFile(ids.adminId, "import-shipments", "xlsx")).bytes);
    const head = headerRow(ws);
    expect(head).toEqual(expect.arrayContaining(["GRN no.", "BL no.", "Container(s)", "CI value", "B/E date", "Origin(s)", "Landed cost total", "Files attached", "Documents"]));
    const ciCol = head.indexOf("CI value") + 1;
    const values = [7, 8, 9].map((n) => ws.getRow(n).getCell(ciCol).value);
    expect(values).toContain(2345.67);
    expect(JSON.stringify(ws.getSheetValues())).toContain("Incomplete");

    const { html } = await reportFile(ids.adminId, "import-shipments", "pdf", { incompleteOnly: "true" });
    expect(html).toContain("<h1>Import shipments</h1>");
    expect(html).toContain(ids.g2No);
    expect(html).not.toContain(ids.g1No);
    expect(html).toContain("Documents incomplete only");
  });
});

describe("BL / B/E numbers in other reports", () => {
  it("stock movement: BL and B/E on imported rows only", async () => {
    const r = await rowsOf("stock-movement");
    expect(keysOf(r)).toEqual(expect.arrayContaining(["blNo", "boeNo"]));
    const imported = r.data.filter((x) => x.type === "GRN_IMPORT");
    expect(imported.length).toBeGreaterThan(0);
    expect(imported.filter((x) => x.entryNo === ids.g1No).every((x) => x.blNo === "BL-RPT-1" && x.boeNo === "BE-RPT-1")).toBe(true);
    const local = r.data.filter((x) => x.type === "GRN_LOCAL");
    expect(local).toHaveLength(1);
    expect(local[0]).toMatchObject({ blNo: null, boeNo: null });
  });

  it("purchases by supplier: the BL and B/E numbers of the supplier's posted imported GRNs", async () => {
    const r = await rowsOf("purchases-by-supplier");
    const daikin = r.data.find((x) => x.supplier === "Daikin Airconditioning (Thailand)");
    expect(daikin).toMatchObject({ grnCount: 2, blNos: "BL-RPT-1, BL-RPT-3", boeNos: "BE-RPT-1, BE-RPT-3" }); // G2 is still pending
    const lg = r.data.find((x) => x.supplier === "LG Electronics Bangladesh");
    expect(lg).toMatchObject({ blNos: null, boeNos: null });
    const onlyA = await rowsOf("purchases-by-supplier", { warehouseId: A });
    expect(onlyA.data.find((x) => x.supplier === "Daikin Airconditioning (Thailand)")).toMatchObject({ blNos: "BL-RPT-1", boeNos: "BE-RPT-1" });
  });

  it("serial lookup: the B/E no. and origin of the GRN the unit came in on", async () => {
    const r = await rowsOf("serial-lookup", { q: "SN-IMP" });
    expect(r.data.map((x) => x.serial)).toEqual(["SN-IMP-001", "SN-IMP-002"]);
    expect(r.data[0]).toMatchObject({ boeNo: "BE-RPT-1", countryOfOrigin: "Malaysia" });
    expect(r.data[0]._links.boeNo).toBe(`/stock/${ids.g1}`);
  });
});

describe("GRN PDF (template)", () => {
  const meta = { companyName: "StockBook", printedBy: "Test Admin", printedAt: "05 Nov 2026, 10:00" };
  async function html(entryId: string, showCost: boolean) {
    const e = (await inventory().uow.store.entry(entryId))!;
    const files = (await inventory().uow.store.attachments("StockEntry", entryId)).filter((a) => a.docType).map((a) => ({ docType: a.docType!, fileName: a.fileName }));
    return renderDocumentHtml(e, "GRN", { ...meta, showCost, importFiles: files });
  }

  it("imported GRN: Shipment documents block with numbers, dates and file names; origin per line", async () => {
    const h = await html(ids.g1, true);
    expect(h).toContain("Shipment documents");
    for (const v of ["BL-RPT-1", "CO-RPT-1", "PL-RPT-1", "CI-RPT-1", "2026-10-12", "2026-10-01", "bl-scan.pdf", "invoice-5521.pdf", "bill-of-entry.pdf", "MSKU1234567"]) expect(h).toContain(v);
    expect(h.split("BE-RPT-1").length - 1).toBe(1); // the B/E is printed once (not also in the references)
    expect(h).toContain("<th>Origin</th>");
    expect(h).toContain("<td>Malaysia</td>");
    expect(h).toContain("2,345.67");
  });

  it("without seeCost the CI value is not printed", async () => {
    const h = await html(ids.g1, false);
    expect(h).toContain("Shipment documents");
    expect(h).toContain("CI-RPT-1");
    expect(h).not.toContain("2,345.67");
    expect(h).not.toContain(CI_VALUE);
  });

  it("other entry types are unchanged (no shipment block, no origin column)", async () => {
    const h = await html(ids.local, true);
    expect(h).not.toContain("Shipment documents");
    expect(h).not.toContain("<th>Origin</th>");
  });
});
