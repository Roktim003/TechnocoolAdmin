import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import * as entriesRoute from "@/app/api/v1/stock-entries/route";
import * as entryRoute from "@/app/api/v1/stock-entries/[id]/route";
import * as calculateRoute from "@/app/api/v1/stock-entries/calculate/route";
import * as shipmentRoute from "@/app/api/v1/stock-entries/[id]/import-shipment/route";
import * as attachmentsRoute from "@/app/api/v1/stock-entries/[id]/attachments/route";
import * as attachmentRoute from "@/app/api/v1/stock-entries/[id]/attachments/[attachmentId]/route";
import * as downloadRoute from "@/app/api/v1/stock-entries/[id]/attachments/[attachmentId]/download/route";
import * as postRoute from "@/app/api/v1/stock-entries/[id]/post/route";
import * as submitRoute from "@/app/api/v1/stock-entries/[id]/submit/route";
import * as settingsRoute from "@/app/api/v1/inventory-settings/route";
import { storage } from "@/shared/storage/storage";
import { call } from "../helpers/http";
import { resetDatabase } from "../helpers/db";
import { ADMIN, adminToken, loginWeb } from "../helpers/fixtures";
import { action, approve, balance, cost, createEntry, prisma, product, supplier, userToken, wh } from "../helpers/inventory";

let token: string;
let A: string;
let B: string;

beforeEach(async () => {
  await resetDatabase();
  token = await adminToken();
  A = await wh("A");
  B = await wh("B");
});

/* ── files ── */

const PDF = (text = "doc") => new TextEncoder().encode(`%PDF-1.4\n% ${text}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);
const png = async () => new Uint8Array(await sharp({ create: { width: 64, height: 48, channels: 3, background: "#3366aa" } }).png().toBuffer());

type Upload = { name: string; bytes: Uint8Array; type?: string };
function form(files: Upload[], docType?: string, extra: Record<string, string> = {}) {
  const fd = new FormData();
  for (const f of files) fd.append("file", new File([f.bytes as BlobPart], f.name, { type: f.type ?? "application/pdf" }));
  if (docType) fd.append("docType", docType);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return fd;
}
const upload = (entryId: string, tok: string, files: Upload[], docType?: string) =>
  call(attachmentsRoute.POST, "POST", `/stock-entries/${entryId}/attachments`, { token: tok, params: { id: entryId }, body: form(files, docType) });
const uploadPdf = (entryId: string, tok: string, docType: string, name = `${docType}.pdf`) => upload(entryId, tok, [{ name, bytes: PDF(docType) }], docType);

const getEntry = async (entryId: string, tok = token) => {
  const r = await call(entryRoute.GET, "GET", `/stock-entries/${entryId}`, { token: tok, params: { id: entryId } });
  if (r.status !== 200) throw new Error(`get ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data;
};
const patchShipment = (entryId: string, tok: string, body: Record<string, unknown>) =>
  call(shipmentRoute.PATCH, "PATCH", `/stock-entries/${entryId}/import-shipment`, { token: tok, params: { id: entryId }, body });
const postDraft = (entryId: string, tok = token) => action(postRoute, entryId, tok);
const removeFile = (entryId: string, attachmentId: string, tok: string, body?: unknown) =>
  call(attachmentRoute.DELETE, "DELETE", `/stock-entries/${entryId}/attachments/${attachmentId}`, { token: tok, params: { id: entryId, attachmentId }, body });
const setRequired = (docs: string[]) => call(settingsRoute.PATCH, "PATCH", "/inventory-settings", { token, body: { importDocsRequiredToPost: docs } });

const FULL_DOCS = {
  blNo: "MAEU-123456789",
  blDate: "2026-10-01",
  shippingLine: "Maersk",
  vesselVoyage: "MAERSK SEMARANG / 042E",
  portOfLoading: "Laem Chabang",
  portOfDischarge: "Chattogram",
  containerNumbers: ["msku 1234567", "MSKU7654321"],
  coNo: "CO-TH-5521",
  coDate: "2026-09-28",
  countryOfOrigin: "Thailand",
  coIssuingAuthority: "Thai Chamber of Commerce",
  plNo: "PL-5521",
  plDate: "2026-09-28",
  packageCount: 12,
  grossWeightKg: "1250.5",
  netWeightKg: "1180",
  ciNo: "CI-5521",
  ciDate: "2026-09-27",
  ciCurrency: "USD",
  ciValue: "2000.00",
  incoterm: "CIF",
  boeNo: "C-112233",
  boeDate: "2026-10-12",
  customsStation: "Chattogram Custom House",
};

async function importBody(overrides: Record<string, unknown> = {}) {
  const p = (overrides.product as { id: string }) ?? (await product(token));
  const { product: _p, ...rest } = overrides;
  return {
    type: "GRN_IMPORT",
    warehouseId: A,
    supplierId: await supplier("Daikin Airconditioning (Thailand)"),
    currency: "USD",
    exchangeRate: "120",
    lcNo: "LC-77",
    lines: [{ productId: p.id, qty: 10, unitPrice: "200" }],
    charges: [{ type: "CUSTOMS_DUTY", mode: "PERCENT_OF_GOODS", value: "10", includeInCost: true }],
    ...rest,
  };
}

async function draft(tok: string, overrides: Record<string, unknown> = {}) {
  const res = await createEntry(tok, { action: "draft", ...(await importBody(overrides)) } as never);
  if (res.status !== 201) throw new Error(`draft failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

const codes = (r: { body: any }) => (r.body.error?.details ?? []).map((d: any) => d.code);

/* ───────────────────────────── documents & posting ───────────────────────────── */

describe("import documents and posting", () => {
  it("saves all five documents and their files, tagged by document type, then posts", async () => {
    const e = await draft(token, { importShipment: FULL_DOCS });
    for (const t of ["BL", "CO", "PL", "CI", "BOE"]) expect((await uploadPdf(e.id, token, t)).status).toBe(201);
    const photo = await upload(e.id, token, [{ name: "bl-photo.png", bytes: await png(), type: "image/png" }], "BL");
    expect(photo.status).toBe(201);
    expect(photo.body.data[0]).toMatchObject({ docType: "BL", mimeType: "image/png", fileName: "bl-photo.png" });
    expect(photo.body.data[0].thumbnailUrl).toContain("variant=thumb");

    const got = await getEntry(e.id);
    expect(got.importShipment).toMatchObject({ ...FULL_DOCS, containerNumbers: ["MSKU1234567", "MSKU7654321"], grossWeightKg: "1250.500", netWeightKg: "1180.000" });
    expect(got.references.billOfEntryNo).toBe("C-112233");
    expect(got.references.lcNo).toBe("LC-77");
    expect(got.importAttachments.BL).toHaveLength(2);
    for (const t of ["CO", "PL", "CI", "BOE"]) expect(got.importAttachments[t]).toHaveLength(1);
    expect(got.documentsChecklist.every((c: any) => c.complete)).toBe(true);
    expect(got.documentsChecklist.filter((c: any) => c.required).map((c: any) => c.docType)).toEqual(["CI", "BOE"]);
    expect(got.importDocFileCount).toBe(6);
    expect(got.actions.editImportDocs).toBe(true);

    const rows = await prisma.attachment.findMany({ where: { entityId: e.id } });
    for (const r of rows) expect(r.fileKey.startsWith(`imports/${e.id}/${r.docType}/`)).toBe(true);
    expect(rows.find((r) => r.mimeType === "image/png")!.thumbnailKey).toMatch(/-thumb\.webp$/);
    expect(await storage().get(rows[0]!.fileKey)).not.toBeNull();

    const posted = await postDraft(e.id);
    expect(posted.status).toBe(200);
    expect(posted.body.data.status).toBe("POSTED");
  });

  it("blocks posting until CI and BOE each have a number and a file", async () => {
    const e = await draft(token, { importShipment: { ciNo: "CI-1" } });
    let r = await postDraft(e.id);
    expect(r.status).toBe(422);
    expect(codes(r)).toEqual(["IMPORT_DOCS_MISSING", "IMPORT_DOCS_MISSING"]);
    expect(r.body.error.details.map((d: any) => d.meta.docType)).toEqual(["CI", "BOE"]);
    expect(r.body.error.details[0].message).toContain("file");

    await uploadPdf(e.id, token, "CI");
    await patchShipment(e.id, token, { ciNo: "CI-1", boeNo: "C-9" });
    r = await postDraft(e.id);
    expect(r.status).toBe(422);
    expect(r.body.error.details.map((d: any) => d.meta.docType)).toEqual(["BOE"]);

    await uploadPdf(e.id, token, "BOE");
    r = await postDraft(e.id);
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe("POSTED");
  });

  it("also blocks a direct post on create and an approval", async () => {
    const direct = await createEntry(token, { action: "post", ...(await importBody({ importShipment: { ciNo: "X", boeNo: "Y" } })) } as never);
    expect(direct.status).toBe(422);
    expect(codes(direct)).toContain("IMPORT_DOCS_MISSING");
    expect(await prisma.stockEntry.count()).toBe(0); // the whole create rolled back

    const store = await userToken(token, "Store Manager");
    const accounts = await userToken(token, "Accounts");
    const e = (await createEntry(store.token, { action: "submit", ...(await importBody()) } as never)).body.data;
    expect(e.status).toBe("PENDING");
    expect(codes(await approve(e.id, accounts.token))).toContain("IMPORT_DOCS_MISSING");
  });

  it("the setting decides which documents are required", async () => {
    expect((await setRequired(["BL", "PL"])).body.data.importDocsRequiredToPost).toEqual(["BL", "PL"]);
    const e = await draft(token, { importShipment: { blNo: "BL-1", plNo: "PL-1" } });
    const r = await postDraft(e.id);
    expect(r.body.error.details.map((d: any) => d.meta.docType)).toEqual(["BL", "PL"]);
    await uploadPdf(e.id, token, "BL");
    await uploadPdf(e.id, token, "PL");
    expect((await postDraft(e.id)).status).toBe(200);

    await setRequired([]);
    expect((await createEntry(token, { action: "post", ...(await importBody()) } as never)).status).toBe(201);
    expect((await setRequired(["OTHER"])).status).toBe(400);
  });

  it("allows saving a draft and submitting with missing documents", async () => {
    const store = await userToken(token, "Store Manager");
    const d = await draft(store.token);
    expect(d.status).toBe("DRAFT");
    expect(d.documentsChecklist.every((c: any) => !c.complete)).toBe(true);
    const s = await action(submitRoute, d.id, store.token);
    expect(s.status).toBe(200);
    expect(s.body.data.status).toBe("PENDING");
  });

  it("other entry types reject import documents and document uploads", async () => {
    const p = await product(token);
    const local = await createEntry(token, { type: "GRN_LOCAL", warehouseId: A, supplierId: await supplier(), lines: [{ productId: p.id, qty: 1, unitPrice: "100" }], importShipment: { blNo: "X" } });
    expect(local.status).toBe(400);
    expect(codes(local)).toContain("IMPORT_DOCS_NOT_ALLOWED");

    const ok = await createEntry(token, { type: "GRN_LOCAL", warehouseId: A, supplierId: await supplier(), lines: [{ productId: p.id, qty: 1, unitPrice: "100" }] });
    expect(ok.status).toBe(201);
    expect(ok.body.data.importShipment).toBeUndefined();
    const up = await uploadPdf(ok.body.data.id, token, "CI");
    expect(up.status).toBe(400);
    expect(codes(up)).toContain("IMPORT_DOCS_NOT_ALLOWED");
    expect((await patchShipment(ok.body.data.id, token, { blNo: "X" })).status).toBe(400);
    // Ordinary attachments still work as before.
    expect((await upload(ok.body.data.id, token, [{ name: "challan.pdf", bytes: PDF() }])).status).toBe(201);
  });

  it("keeps accepting the legacy billOfEntryNo field", async () => {
    const e = await draft(token, { billOfEntryNo: "BE-LEGACY" });
    expect(e.importShipment.boeNo).toBe("BE-LEGACY");
    expect(e.references.billOfEntryNo).toBe("BE-LEGACY");
  });
});

/* ───────────────────────────── uploads ───────────────────────────── */

describe("import document uploads", () => {
  it("checks the real content: wrong types (including a renamed .exe) are rejected", async () => {
    const e = await draft(token);
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00]);
    const r1 = await upload(e.id, token, [{ name: "invoice.pdf", bytes: exe }], "CI");
    expect(r1.status).toBe(400);
    expect(codes(r1)).toContain("INVALID_FILE_TYPE");
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect(codes(await upload(e.id, token, [{ name: "ci.png", bytes: html, type: "image/png" }], "CI"))).toContain("INVALID_FILE_TYPE");
    const webp = new Uint8Array(await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).webp().toBuffer());
    expect(codes(await upload(e.id, token, [{ name: "ci.webp", bytes: webp, type: "image/webp" }], "CI"))).toContain("INVALID_FILE_TYPE");
    // PNG magic bytes but not a real image.
    const fakePng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    expect(codes(await upload(e.id, token, [{ name: "x.png", bytes: fakePng, type: "image/png" }], "CI"))).toContain("INVALID_FILE_TYPE");
    expect(codes(await upload(e.id, token, [{ name: "x.pdf", bytes: PDF() }], "INVOICE"))).toContain("INVALID_DOC_TYPE");
    expect(await prisma.attachment.count()).toBe(0);
  });

  it("rejects files over 10 MB and more than 10 files per document", async () => {
    const e = await draft(token);
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(PDF());
    const r = await upload(e.id, token, [{ name: "big.pdf", bytes: big }], "BL");
    expect(r.status).toBe(400);
    expect(codes(r)).toContain("FILE_TOO_LARGE");

    const ten = Array.from({ length: 10 }, (_, i) => ({ name: `pl-${i}.pdf`, bytes: PDF(String(i)) }));
    expect((await upload(e.id, token, ten, "PL")).status).toBe(201);
    const eleventh = await uploadPdf(e.id, token, "PL");
    expect(eleventh.status).toBe(422);
    expect(codes(eleventh)).toContain("ATTACHMENT_LIMIT");
    // The limit is per document type.
    expect((await uploadPdf(e.id, token, "CO")).status).toBe(201);
  });

  it("sanitises file names and blocks path traversal", async () => {
    const e = await draft(token);
    const r = await upload(
      e.id,
      token,
      [
        { name: "../../../etc/passwd.pdf", bytes: PDF() },
        { name: "..\\..\\windows\\évil <script>.pdf", bytes: PDF() },
        { name: "....", bytes: PDF() },
      ],
      "CI",
    );
    expect(r.status).toBe(201);
    expect(r.body.data.map((a: any) => a.fileName)).toEqual(["passwd.pdf", "evil-script.pdf", "file.pdf"]);
    for (const a of await prisma.attachment.findMany({ where: { entityId: e.id } })) {
      expect(a.fileKey).not.toContain("..");
      expect(a.fileKey).toMatch(new RegExp(`^imports/${e.id}/CI/[0-9a-f-]{36}-[\\w.\\-]+$`));
    }
  });

  it("downloads only through the authenticated route, with warehouse scope", async () => {
    const e = await draft(token);
    const bytes = PDF("bill of entry");
    const up = (await upload(e.id, token, [{ name: "boe.pdf", bytes }], "BOE")).body.data[0];
    expect(up.downloadUrl).toBe(`/api/v1/stock-entries/${e.id}/attachments/${up.id}/download`);

    const dl = (tok: string | undefined, query: Record<string, string> = {}) =>
      call(downloadRoute.GET, "GET", up.downloadUrl.replace("/api/v1", ""), { token: tok, params: { id: e.id, attachmentId: up.id }, query });
    const r = await dl(token);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="boe.pdf"');
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(r.bytes).equals(Buffer.from(bytes))).toBe(true);
    expect((await dl(token, { inline: "1" })).headers.get("content-disposition")).toMatch(/^inline/);

    expect((await dl(undefined)).status).toBe(401);
    const outsider = await userToken(token, "Store Manager", ["B"]);
    expect((await dl(outsider.token)).status).toBe(403);
    const list = await call(attachmentsRoute.GET, "GET", `/stock-entries/${e.id}/attachments`, { token: outsider.token, params: { id: e.id } });
    expect(list.status).toBe(403);

    const img = (await upload(e.id, token, [{ name: "boe.png", bytes: await png(), type: "image/png" }], "BOE")).body.data[0];
    const thumb = await call(downloadRoute.GET, "GET", "/x", { token, params: { id: e.id, attachmentId: img.id }, query: { variant: "thumb" } });
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get("content-type")).toBe("image/webp");
    const filtered = await call(attachmentsRoute.GET, "GET", `/stock-entries/${e.id}/attachments`, { token, params: { id: e.id }, query: { docType: "BOE" } });
    expect(filtered.body.data).toHaveLength(2);
  });

  it("accepts uploads with the mobile bearer token and with the web cookie", async () => {
    const e = await draft(token);
    // Bearer (mobile app, e.g. a phone photo of the B/E).
    const phone = await upload(e.id, token, [{ name: "IMG_2041.JPG", bytes: new Uint8Array(await sharp({ create: { width: 30, height: 20, channels: 3, background: "#ddd" } }).jpeg().toBuffer()), type: "image/jpeg" }], "BOE");
    expect(phone.status).toBe(201);
    expect(phone.body.data[0]).toMatchObject({ mimeType: "image/jpeg", fileName: "IMG_2041.JPG" });
    // Web: cookie + same origin.
    const web = await loginWeb(ADMIN.username, ADMIN.password);
    const r = await call(attachmentsRoute.POST, "POST", `/stock-entries/${e.id}/attachments`, { cookies: { sb_at: web.sb_at }, params: { id: e.id }, body: form([{ name: "ci.pdf", bytes: PDF() }], "CI") });
    expect(r.status).toBe(201);
  });
});

/* ───────────────────────────── permissions ───────────────────────────── */

describe("import document permissions", () => {
  it("a Store Manager uploads and views files but never sees the CI value", async () => {
    const store = await userToken(token, "Store Manager");
    const e = await draft(store.token, { importShipment: { ...FULL_DOCS, ciValue: "999.00" } });
    expect(e.importShipment.ciNo).toBe("CI-5521");
    expect(e.importShipment).not.toHaveProperty("ciValue");
    // The Store Manager couldn't set it either.
    expect((await prisma.importShipment.findUniqueOrThrow({ where: { entryId: e.id } })).ciValue).toBeNull();

    expect((await uploadPdf(e.id, store.token, "BL")).status).toBe(201);
    const files = await call(attachmentsRoute.GET, "GET", `/stock-entries/${e.id}/attachments`, { token: store.token, params: { id: e.id } });
    expect(files.status).toBe(200);
    expect(files.body.data).toHaveLength(1);

    // Admin sets the value; the Store Manager still can't see it anywhere, and their edits keep it.
    await patchShipment(e.id, token, { ...FULL_DOCS, ciValue: "2000.00" });
    expect((await getEntry(e.id)).importShipment.ciValue).toBe("2000.00");
    expect((await getEntry(e.id, store.token)).importShipment).not.toHaveProperty("ciValue");
    const list = await call(entriesRoute.GET, "GET", "/stock-entries", { token: store.token, query: { type: "GRN_IMPORT" } });
    expect(JSON.stringify(list.body)).not.toContain("ciValue");
    const calc = await call(calculateRoute.POST, "POST", "/stock-entries/calculate", { token: store.token, body: { ...(await importBody()), importShipment: FULL_DOCS, entryId: e.id } });
    expect(calc.status).toBe(200);
    expect(JSON.stringify(calc.body)).not.toContain("ciValue");
    expect((await patchShipment(e.id, store.token, { ...FULL_DOCS, ciNo: "CI-EDIT", ciValue: "1.00" })).status).toBe(200);
    expect((await prisma.importShipment.findUniqueOrThrow({ where: { entryId: e.id } })).ciValue?.toFixed(2)).toBe("2000.00");
  });

  it("a verifier adds documents and files to a pending entry, then approves it", async () => {
    const store = await userToken(token, "Store Manager");
    const accounts = await userToken(token, "Accounts");
    const other = await userToken(token, "Store Manager");
    const e = (await createEntry(store.token, { action: "submit", ...(await importBody({ importShipment: { blNo: "BL-1", plNo: "PL-1" } })) } as never)).body.data;
    await uploadPdf(e.id, store.token, "BL");
    await uploadPdf(e.id, store.token, "PL");

    // Another Store Manager (not the creator, not a verifier) can't.
    expect((await uploadPdf(e.id, other.token, "CI")).status).toBe(403);
    expect((await patchShipment(e.id, other.token, { ciNo: "X" })).status).toBe(403);

    expect((await getEntry(e.id, accounts.token)).actions.editImportDocs).toBe(true);
    expect((await patchShipment(e.id, accounts.token, { blNo: "BL-1", plNo: "PL-1", ciNo: "CI-1", boeNo: "C-1", boeDate: "2026-10-12" })).status).toBe(200);
    expect((await uploadPdf(e.id, accounts.token, "CI")).status).toBe(201);
    expect((await uploadPdf(e.id, accounts.token, "BOE")).status).toBe(201);
    const ok = await approve(e.id, accounts.token);
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe("POSTED");
  });

  it("after posting only inventory FULL can edit, upload or delete (with a reason), audit-logged, stock and cost unchanged", async () => {
    const store = await userToken(token, "Store Manager");
    const accounts = await userToken(token, "Accounts");
    const p = await product(token);
    const e = (await createEntry(store.token, { action: "submit", ...(await importBody({ product: p, importShipment: { ciNo: "CI-1", boeNo: "C-1" } })) } as never)).body.data;
    const mine = (await uploadPdf(e.id, store.token, "CI")).body.data[0];
    await uploadPdf(e.id, store.token, "BOE");
    expect((await approve(e.id, accounts.token)).body.data.status).toBe("POSTED");
    const stockBefore = await balance(p.id, "A");
    const costBefore = await cost(p.id);
    const movementsBefore = await prisma.stockMovement.count();

    // Creator and verifier: no longer.
    expect((await uploadPdf(e.id, store.token, "BL")).status).toBe(403);
    expect((await patchShipment(e.id, store.token, { ciNo: "CI-2", boeNo: "C-1" })).status).toBe(403);
    expect((await removeFile(e.id, mine.id, store.token)).status).toBe(403);
    expect((await patchShipment(e.id, accounts.token, { ciNo: "CI-2", boeNo: "C-1" })).status).toBe(403);

    // FULL: edit (before/after audited), upload, delete with a reason.
    const edit = await patchShipment(e.id, token, { ciNo: "CI-2", boeNo: "C-1", blNo: "BL-LATE" });
    expect(edit.status).toBe(200);
    expect(edit.body.data.importShipment).toMatchObject({ ciNo: "CI-2", blNo: "BL-LATE" });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "stock_entry.import_docs_update", entityId: e.id } });
    expect(audit.before).toMatchObject({ status: "POSTED", documents: { ciNo: "CI-1" } });
    expect(audit.after).toMatchObject({ documents: { ciNo: "CI-2", blNo: "BL-LATE" } });

    expect((await uploadPdf(e.id, token, "BL")).status).toBe(201);
    const mineKey = (await prisma.attachment.findUniqueOrThrow({ where: { id: mine.id } })).fileKey;
    const noReason = await removeFile(e.id, mine.id, token);
    expect(noReason.status).toBe(400);
    expect(codes(noReason)).toContain("REASON_REQUIRED");
    expect((await removeFile(e.id, mine.id, token, { reason: "Wrong invoice scanned" })).status).toBe(204);
    const del = await prisma.auditLog.findFirstOrThrow({ where: { action: "stock_entry.attachment_remove", entityId: e.id } });
    expect(del.before).toMatchObject({ fileName: "CI.pdf", docType: "CI" });
    expect(del.after).toMatchObject({ reason: "Wrong invoice scanned" });
    const add = await prisma.auditLog.findMany({ where: { action: "stock_entry.attachment_add", entityId: e.id } });
    expect(add.map((a) => (a.after as any).docType)).toEqual(expect.arrayContaining(["CI", "BOE", "BL"]));
    expect(await storage().get(mineKey)).toBeNull();

    expect(await balance(p.id, "A")).toEqual(stockBefore);
    expect(await cost(p.id)).toEqual(costBefore);
    expect(await prisma.stockMovement.count()).toBe(movementsBefore);
    expect((await getEntry(e.id)).status).toBe("POSTED");
  });

  it("the uploader can remove their own file before posting, without a reason", async () => {
    const store = await userToken(token, "Store Manager");
    const e = await draft(store.token);
    const f = (await uploadPdf(e.id, store.token, "PL")).body.data[0];
    const other = (await uploadPdf(e.id, token, "PL")).body.data[0];
    expect((await removeFile(e.id, other.id, store.token)).status).toBe(403);
    expect((await removeFile(e.id, f.id, store.token)).status).toBe(204);
    expect(await prisma.attachment.count({ where: { entityId: e.id } })).toBe(1);
  });
});

/* ───────────────────────────── warnings, search, origin, migration ───────────────────────────── */

describe("warnings, search and origin", () => {
  const calc = async (body: Record<string, unknown>) => {
    const r = await call(calculateRoute.POST, "POST", "/stock-entries/calculate", { token, body });
    if (r.status !== 200) throw new Error(`calc ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.data;
  };
  const warn = (c: any) => c.warnings.map((w: any) => w.code);

  it("shows each warning for its case, never blocking", async () => {
    const base = await importBody(); // goods value 10 × 200 = 2000 USD
    let c = await calc({ ...base, importShipment: { ciCurrency: "USD", ciValue: "2010.00", grossWeightKg: "100", netWeightKg: "90", blDate: "2026-10-01", boeDate: "2026-10-05" } });
    expect(warn(c)).not.toEqual(expect.arrayContaining(["CI_CURRENCY_MISMATCH", "CI_VALUE_MISMATCH", "PL_NET_ABOVE_GROSS", "BOE_BEFORE_BL"]));
    expect(warn(c)).toContain("IMPORT_DOCS_MISSING");
    expect(c.documentsChecklist).toHaveLength(5);

    c = await calc({ ...base, importShipment: { ciCurrency: "EUR" } });
    expect(warn(c)).toContain("CI_CURRENCY_MISMATCH");
    c = await calc({ ...base, importShipment: { ciCurrency: "USD", ciValue: "2100.00" } });
    expect(warn(c)).toContain("CI_VALUE_MISMATCH");
    c = await calc({ ...base, importShipment: { grossWeightKg: "100", netWeightKg: "101" } });
    expect(warn(c)).toContain("PL_NET_ABOVE_GROSS");
    c = await calc({ ...base, importShipment: { blDate: "2026-10-05", boeDate: "2026-10-01" } });
    expect(warn(c)).toContain("BOE_BEFORE_BL");

    // A draft with every warning still saves and submits.
    const e = await draft(token, { importShipment: { ciCurrency: "EUR", grossWeightKg: "1", netWeightKg: "2", blDate: "2026-10-05", boeDate: "2026-10-01" } });
    expect(e.status).toBe("DRAFT");
    expect((await getEntry(e.id)).importWarnings.map((w: any) => w.code)).toEqual(expect.arrayContaining(["CI_CURRENCY_MISMATCH", "PL_NET_ABOVE_GROSS", "BOE_BEFORE_BL"]));
  });

  it("warns about BL, CI or B/E numbers already used on another GRN (Imported), with a link", async () => {
    const first = await draft(token, { importShipment: { blNo: "BL-SHARED", ciNo: "CI-SHARED", boeNo: "BE-SHARED" } });
    const c = await calc({ ...(await importBody()), importShipment: { blNo: "bl-shared", ciNo: "CI-SHARED", boeNo: "BE-SHARED" } });
    const dups = c.warnings.filter((w: any) => w.code.startsWith("DUPLICATE_"));
    expect(dups.map((w: any) => w.code)).toEqual(["DUPLICATE_BL", "DUPLICATE_CI", "DUPLICATE_BOE"]);
    expect(dups[0].link).toEqual({ entryId: first.id, number: first.draftRef, href: `/stock/${first.id}` });
    // Not a duplicate of itself.
    const self = await calc({ ...(await importBody()), entryId: first.id, importShipment: { blNo: "BL-SHARED" } });
    expect(self.warnings.map((w: any) => w.code)).not.toContain("DUPLICATE_BL");
  });

  it("searches and filters entries by BL, CI, B/E and container numbers and origin", async () => {
    const one = await draft(token, { importShipment: FULL_DOCS });
    const two = await draft(token, { importShipment: { blNo: "OOLU-999", ciNo: "INV-22", boeNo: "C-777", containerNumbers: ["OOLU1111111"], countryOfOrigin: "Malaysia" } });
    const ids = async (query: Record<string, string>) => (await call(entriesRoute.GET, "GET", "/stock-entries", { token, query })).body.data.map((e: any) => e.id);
    expect(await ids({ q: "MAEU-1234" })).toEqual([one.id]);
    expect(await ids({ q: "inv-22" })).toEqual([two.id]);
    expect(await ids({ q: "C-777" })).toEqual([two.id]);
    expect(await ids({ q: "msku7654321" })).toEqual([one.id]);
    expect(await ids({ blNo: "OOLU" })).toEqual([two.id]);
    expect(await ids({ ciNo: "CI-55" })).toEqual([one.id]);
    expect(await ids({ boeNo: "C-112233" })).toEqual([one.id]);
    expect(await ids({ containerNo: "oolu1111111" })).toEqual([two.id]);
    expect(await ids({ countryOfOrigin: "thailand" })).toEqual([one.id]);
    const list = (await call(entriesRoute.GET, "GET", "/stock-entries", { token, query: { type: "GRN_IMPORT", q: "MAEU" } })).body.data[0];
    expect(list).toMatchObject({ importShipment: { blNo: "MAEU-123456789", boeNo: "C-112233" }, importDocFileCount: 0 });
    expect(list.documentsChecklist).toHaveLength(5);
  });

  it("defaults each line's origin from the product, else the Certificate of Origin; editable per line", async () => {
    const withOrigin = await product(token, { countryOfOrigin: "Japan" });
    const without = await product(token);
    const explicit = await product(token, { countryOfOrigin: "Korea" });
    const e = await draft(token, {
      importShipment: { countryOfOrigin: "Thailand" },
      lines: [
        { productId: withOrigin.id, qty: 1, unitPrice: "10" },
        { productId: without.id, qty: 1, unitPrice: "10" },
        { productId: explicit.id, qty: 1, unitPrice: "10", countryOfOrigin: "China" },
      ],
    });
    expect(e.lines.map((l: any) => l.countryOfOrigin)).toEqual(["Japan", "Thailand", "China"]);
    const c = await calc({ ...(await importBody({ product: without })), importShipment: { countryOfOrigin: "Malaysia" } });
    expect(c.lines[0].countryOfOrigin).toBe("Malaysia");
    // Other types don't carry an origin.
    const local = await createEntry(token, { type: "GRN_LOCAL", warehouseId: B, supplierId: await supplier(), lines: [{ productId: withOrigin.id, qty: 1, unitPrice: "1" }] });
    expect(local.body.data.lines[0]).not.toHaveProperty("countryOfOrigin");
  });
});

describe("data migration", () => {
  it("moves existing billOfEntryNo values into ImportShipment, then drops the column", async () => {
    // Recreate the pre-migration column on a copy of the data, then run the migration's own SQL.
    const sql = readFileSync(path.resolve(__dirname, "../../prisma/migrations/20261029000000_import_documents/migration.sql"), "utf8");
    const migrate = sql.slice(sql.indexOf("-- ── migrate"), sql.indexOf("-- ── contract"));
    const contract = sql.slice(sql.indexOf("-- ── contract"));
    expect(migrate).toContain('INSERT INTO "ImportShipment"');
    expect(contract).toContain('DROP COLUMN "billOfEntryNo"');

    const p = await product(token);
    await setRequired([]);
    const imported = (await createEntry(token, { action: "post", ...(await importBody({ product: p })) } as never)).body.data;
    const local = (await createEntry(token, { type: "GRN_LOCAL", warehouseId: A, supplierId: await supplier(), lines: [{ productId: p.id, qty: 1, unitPrice: "1" }] })).body.data;
    const blank = (await createEntry(token, { action: "draft", ...(await importBody({ product: p })) } as never)).body.data;
    await prisma.importShipment.deleteMany({});

    await prisma.$executeRawUnsafe(`ALTER TABLE "StockEntry" ADD COLUMN "billOfEntryNo" TEXT`);
    try {
      await prisma.$executeRawUnsafe(`UPDATE "StockEntry" SET "billOfEntryNo" = 'C-2026-0042' WHERE id = '${imported.id}'`);
      await prisma.$executeRawUnsafe(`UPDATE "StockEntry" SET "billOfEntryNo" = 'BE-LOCAL' WHERE id = '${local.id}'`);
      await prisma.$executeRawUnsafe(`UPDATE "StockEntry" SET "billOfEntryNo" = '   ' WHERE id = '${blank.id}'`);
      await prisma.$executeRawUnsafe(migrate);
      await prisma.$executeRawUnsafe(contract);
    } finally {
      await prisma.$executeRawUnsafe(`ALTER TABLE "StockEntry" DROP COLUMN IF EXISTS "billOfEntryNo"`);
    }
    const rows = await prisma.importShipment.findMany({ orderBy: { boeNo: "asc" } });
    expect(rows.map((r) => [r.entryId, r.boeNo])).toEqual([
      [local.id, "BE-LOCAL"],
      [imported.id, "C-2026-0042"],
    ]);
    expect((await getEntry(imported.id)).references.billOfEntryNo).toBe("C-2026-0042");
    // lcNo stayed on the entry.
    expect((await getEntry(imported.id)).references.lcNo).toBe("LC-77");
  });
});
