import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Worker } from "bullmq";
import * as suppliersRoute from "@/app/api/v1/suppliers/route";
import * as supplierRoute from "@/app/api/v1/suppliers/[id]/route";
import * as supplierDeactivateRoute from "@/app/api/v1/suppliers/[id]/deactivate/route";
import * as customersRoute from "@/app/api/v1/customers/route";
import * as projectsRoute from "@/app/api/v1/projects/route";
import * as attachmentsRoute from "@/app/api/v1/stock-entries/[id]/attachments/route";
import * as attachmentRoute from "@/app/api/v1/stock-entries/[id]/attachments/[attachmentId]/route";
import * as documentsRoute from "@/app/api/v1/stock-entries/[id]/documents/route";
import * as documentRoute from "@/app/api/v1/documents/[jobId]/route";
import { processDocumentJob } from "@/modules/inventory/interface/documents";
import { browserPath } from "@/modules/inventory/infrastructure/pdf";
import { getQueue, queuePrefix, QUEUES } from "@/shared/queue/queue";
import { bullConnection } from "@/shared/redis/redis";
import { logger } from "@/shared/logger/logger";
import { TEST_ENV } from "../setup/test-env";
import { seed } from "../../prisma/seed";
import { call } from "../helpers/http";
import { resetDatabase } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";
import { form, image } from "../helpers/catalog";
import { createEntry, grn, key, prisma, product, supplier, userToken, wh } from "../helpers/inventory";

let token: string;
let A: string;
let worker: Worker;

beforeAll(() => {
  worker = new Worker(QUEUES.documents, (job) => processDocumentJob(job, logger), { connection: bullConnection(), prefix: queuePrefix() });
});

afterAll(async () => {
  await worker.close();
  await getQueue(QUEUES.documents).close();
});

beforeEach(async () => {
  await resetDatabase();
  token = await adminToken();
  A = await wh("A");
});

describe("masters", () => {
  it("suppliers: create, unique name, update, deactivate; Store Manager can read but not write", async () => {
    const res = await call(suppliersRoute.POST, "POST", "/suppliers", { token, body: { name: "Gree Bangladesh", type: "local", phone: "01700" } });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: "Gree Bangladesh", type: "LOCAL", currency: "BDT", isActive: true });
    const id = res.body.data.id;
    expect((await call(suppliersRoute.POST, "POST", "/suppliers", { token, body: { name: "gree bangladesh" } })).status).toBe(409);

    const upd = await call(supplierRoute.PATCH, "PATCH", `/suppliers/${id}`, { token, params: { id }, body: { type: "FOREIGN", currency: "usd" } });
    expect(upd.body.data).toMatchObject({ type: "FOREIGN", currency: "USD" });
    const off = await call(supplierDeactivateRoute.POST, "POST", `/suppliers/${id}/deactivate`, { token, params: { id } });
    expect(off.body.data.isActive).toBe(false);
    const active = await call(suppliersRoute.GET, "GET", "/suppliers", { token, query: { active: "true", pageSize: 100 } });
    expect(active.body.data.map((s: any) => s.id)).not.toContain(id);

    // An inactive supplier can't be used on a new GRN.
    const p = await product(token);
    const g = await createEntry(token, { type: "GRN_LOCAL", warehouseId: A, supplierId: id, lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] });
    expect(g.body.error.details[0].code).toBe("INACTIVE_SUPPLIER");

    const store = await userToken(token, "Store Manager", ["A"]);
    expect((await call(suppliersRoute.GET, "GET", "/suppliers", { token: store.token })).status).toBe(200);
    expect((await call(suppliersRoute.POST, "POST", "/suppliers", { token: store.token, body: { name: "X" } })).status).toBe(403);
    expect((await call(customersRoute.POST, "POST", "/customers", { token: store.token, body: { name: "X" } })).status).toBe(403);
  });

  it("projects get sequential PRJ codes after the seeded ones", async () => {
    const a = await call(projectsRoute.POST, "POST", "/projects", { token, body: { name: "Banani office", clientName: "Banani Holdings", status: "running" } });
    const b = await call(projectsRoute.POST, "POST", "/projects", { token, body: { name: "Uttara mall", clientName: "Uttara Developers" } });
    expect(a.body.data).toMatchObject({ code: "PRJ-003", status: "RUNNING" });
    expect(b.body.data).toMatchObject({ code: "PRJ-004", status: "PLANNING" });
    const list = await call(projectsRoute.GET, "GET", "/projects", { token });
    expect(list.body.data.map((p: any) => p.code).slice(0, 2)).toEqual(["PRJ-004", "PRJ-003"]);
  });

  it("seed is idempotent and creates sample masters only when empty", async () => {
    const counts = async () => ({ s: await prisma.supplier.count(), c: await prisma.customer.count(), p: await prisma.project.count(), settings: await prisma.inventorySettings.count() });
    expect(await counts()).toEqual({ s: 4, c: 2, p: 2, settings: 1 });
    await seed(prisma, { adminUsername: TEST_ENV.ADMIN_USERNAME!, adminPassword: TEST_ENV.ADMIN_PASSWORD!, adminName: "Admin", bcryptRounds: 4, log: () => {} });
    expect(await counts()).toEqual({ s: 4, c: 2, p: 2, settings: 1 });
    const settings = await prisma.inventorySettings.findUniqueOrThrow({ where: { id: 1 } });
    expect(settings.defaultSalesVatPercent.toFixed(2)).toBe("15.00");
  });
});

describe("attachments", () => {
  it("accepts PDF/images by content, lists, serves and removes them", async () => {
    const p = await product(token);
    const e = await grn(token, A, [{ productId: p.id, qty: 1, unitPrice: "1" }]);
    const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
    const up = await call(attachmentsRoute.POST, "POST", `/stock-entries/${e.id}/attachments`, {
      token,
      params: { id: e.id },
      body: form([{ name: "invoice.pdf", bytes: pdf }, { name: "photo.png", bytes: await image("png", 50) }], { label: "Supplier invoice" }),
    });
    expect(up.status).toBe(201);
    expect(up.body.data.map((a: any) => a.mimeType).sort()).toEqual(["application/pdf", "image/png"]);

    const fake = await call(attachmentsRoute.POST, "POST", `/stock-entries/${e.id}/attachments`, { token, params: { id: e.id }, body: form([{ name: "x.pdf", bytes: new TextEncoder().encode("not a pdf") }]) });
    expect(fake.status).toBe(400);

    const list = await call(attachmentsRoute.GET, "GET", `/stock-entries/${e.id}/attachments`, { token, params: { id: e.id } });
    expect(list.body.data).toHaveLength(2);
    const att = list.body.data.find((a: any) => a.mimeType === "application/pdf");
    const file = await call(attachmentRoute.GET, "GET", "/x", { token, params: { id: e.id, attachmentId: att.id } });
    expect(file.status).toBe(200);
    expect(new TextDecoder().decode(file.bytes.slice(0, 5))).toBe("%PDF-");

    expect((await call(attachmentRoute.DELETE, "DELETE", "/x", { token, params: { id: e.id, attachmentId: att.id } })).status).toBe(204);
    expect((await call(attachmentsRoute.GET, "GET", "/x", { token, params: { id: e.id } })).body.data).toHaveLength(1);
  });
});

describe("documents", () => {
  it.skipIf(!browserPath())("renders a PDF in the worker and serves it to the requester only", async () => {
    const p = await product(token);
    const e = await grn(token, A, [{ productId: p.id, qty: 2, unitPrice: "150" }]);
    const res = await call(documentsRoute.POST, "POST", `/stock-entries/${e.id}/documents`, { token, params: { id: e.id }, body: {}, headers: { "Idempotency-Key": key() } });
    expect(res.status).toBe(202);
    expect(res.body.data.kind).toBe("GRN");
    const jobId = res.body.data.jobId;

    let status = "";
    for (let i = 0; i < 60 && status !== "completed" && status !== "failed"; i++) {
      await new Promise((r) => setTimeout(r, 500));
      status = (await call(documentRoute.GET, "GET", `/documents/${jobId}`, { token, params: { jobId } })).body.data.status;
    }
    expect(status).toBe("completed");
    const pdf = await call(documentRoute.GET, "GET", `/documents/${jobId}`, { token, params: { jobId }, query: { download: "1" } });
    expect(pdf.headers.get("content-type")).toContain("application/pdf");
    expect(new TextDecoder().decode(pdf.bytes.slice(0, 5))).toBe("%PDF-");

    const other = await userToken(token, "Store Manager", ["A"]);
    expect((await call(documentRoute.GET, "GET", `/documents/${jobId}`, { token: other.token, params: { jobId } })).status).toBe(404);
  }, 60_000);

  it("refuses drafts and kinds that don't fit the entry", async () => {
    const p = await product(token);
    const draft = (await createEntry(token, { action: "draft", type: "GRN_LOCAL", warehouseId: A, supplierId: await supplier(), lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] })).body.data;
    expect((await call(documentsRoute.POST, "POST", "/x", { token, params: { id: draft.id }, body: {} })).body.error.details[0].code).toBe("DRAFT_NOT_PRINTABLE");
    const e = await grn(token, A, [{ productId: p.id, qty: 1, unitPrice: "1" }]);
    expect((await call(documentsRoute.POST, "POST", "/x", { token, params: { id: e.id }, body: { kind: "SALES_INVOICE" } })).body.error.details[0].code).toBe("DOCUMENT_KIND");
  });
});

describe("OpenAPI", () => {
  it("documents every inventory endpoint", async () => {
    const openapiRoute = await import("@/app/api/v1/openapi.json/route");
    const doc = await (await openapiRoute.GET()).json();
    const expected: [string, string][] = [
      ["/stock-entries", "get"], ["/stock-entries", "post"], ["/stock-entries/calculate", "post"], ["/stock-entries/{id}", "get"], ["/stock-entries/{id}", "patch"],
      ...["submit", "post", "approve", "reject", "cancel", "reverse", "receive", "documents"].map((a) => [`/stock-entries/{id}/${a}`, "post"] as [string, string]),
      ["/stock-entries/{id}/attachments", "post"], ["/stock-entries/{id}/attachments/{attachmentId}", "delete"], ["/documents/{jobId}", "get"],
      ["/stock/balances", "get"], ["/stock/products/{productId}", "get"], ["/stock/availability", "get"], ["/stock/movements", "get"], ["/serials", "get"], ["/serials/{id}", "get"],
      ...["suppliers", "customers"].flatMap((m) => [[`/${m}`, "post"], [`/${m}/{id}`, "patch"], [`/${m}/{id}/deactivate`, "post"]] as [string, string][]),
      ["/inventory-settings", "patch"],
    ];
    for (const [p, m] of expected) expect(doc.paths[p]?.[m], `${m} ${p}`).toBeDefined();
    const create = doc.paths["/stock-entries"].post;
    expect(create.parameters.find((x: any) => x.name === "idempotency-key").required).toBe(true);
    expect(doc.components.schemas.StockEntry.properties.lines).toBeDefined();
  });
});

describe("OpenAPI (Module 3)", () => {
  it("documents counts, opening stock, low stock, alerts and notifications", async () => {
    const openapiRoute = await import("@/app/api/v1/openapi.json/route");
    const doc = await (await openapiRoute.GET()).json();
    const expected: [string, string][] = [
      ["/stock-counts", "post"], ["/stock-counts/{id}", "patch"], ["/stock-counts/{id}/lines/{lineId}", "put"],
      ...["start", "submit", "approve", "request-recount", "cancel"].map((a) => [`/stock-counts/{id}/${a}`, "post"] as [string, string]),
      ["/stock-counts/{id}/variance", "get"], ["/stock-counts/{id}/sheet", "get"],
      ["/opening-stock/template", "get"], ["/opening-stock/imports", "post"], ["/opening-stock/imports/{id}", "get"], ["/opening-stock/imports/{id}/commit", "post"],
      ["/warehouses/{id}/lock-opening", "post"], ["/warehouses/{id}/unlock-opening", "post"],
      ["/stock/low-stock", "get"], ["/stock/low-stock/export", "get"], ["/alert-settings", "patch"],
      ["/notifications", "get"], ["/notifications/unread-count", "get"], ["/notifications/{id}/read", "post"], ["/notifications/read-all", "post"], ["/notification-preferences", "patch"],
    ];
    for (const [p, m] of expected) expect(doc.paths[p]?.[m], `${m} ${p}`).toBeDefined();
    expect(doc.paths["/stock-counts/{id}/approve"].post.parameters.find((x: any) => x.name === "idempotency-key").required).toBe(true);
  });
});
