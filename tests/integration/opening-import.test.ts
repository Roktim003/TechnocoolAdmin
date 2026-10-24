import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Worker } from "bullmq";
import * as lockRoute from "@/app/api/v1/warehouses/[id]/lock-opening/route";
import * as unlockRoute from "@/app/api/v1/warehouses/[id]/unlock-opening/route";
import * as warehousesRoute from "@/app/api/v1/opening-stock/warehouses/route";
import * as templateRoute from "@/app/api/v1/opening-stock/template/route";
import { processOpeningImportJob } from "@/modules/inventory/interface/jobs";
import { fiscalYear } from "@/modules/inventory/domain/numbering";
import { getQueue, queuePrefix, QUEUES } from "@/shared/queue/queue";
import { bullConnection } from "@/shared/redis/redis";
import { logger } from "@/shared/logger/logger";
import { call } from "../helpers/http";
import { resetDatabase } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";
import { balance, cost, createEntry, grn, key, prisma, product, userToken, wh } from "../helpers/inventory";
import { commitImport, createCount, openingWorkbook, startCount, uploadOpening, waitForImport } from "../helpers/control";

let token: string;
let worker: Worker;
const FY = fiscalYear(new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date())}T00:00:00Z`));

beforeAll(() => {
  worker = new Worker(QUEUES.openingImport, (job) => processOpeningImportJob(job, logger), { connection: bullConnection(), prefix: queuePrefix() });
});
afterAll(async () => {
  await worker.close();
  await getQueue(QUEUES.openingImport).close();
});
beforeEach(async () => {
  await resetDatabase();
  token = await adminToken();
});

async function validated(rows: Parameters<typeof openingWorkbook>[1]) {
  const up = await uploadOpening(token, await openingWorkbook(token, rows));
  expect(up.status).toBe(202);
  return waitForImport(token, up.body.data.id);
}

const lockA = async (t = token) => {
  const id = await wh("A");
  return call(lockRoute.POST, "POST", "/x", { token: t, params: { id }, headers: { "Idempotency-Key": key() } });
};

describe("opening stock import", () => {
  it("template lists warehouses and active products; FULL only", async () => {
    const p = await product(token);
    const res = await call(templateRoute.GET, "GET", "/opening-stock/template", { token });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.bytes as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Opening stock", "Lists", "Help"]);
    expect(wb.worksheets[0]!.actualRowCount).toBe(1); // headers only: no example row to import by mistake
    const lists = wb.getWorksheet("Lists")!;
    const col = (n: number) => lists.getColumn(n).values.filter(Boolean).map(String);
    expect(col(1)).toEqual(expect.arrayContaining(["A", "B"]));
    expect(col(4)).toContain(p.code);
    const store = await userToken(token, "Store Manager");
    expect((await call(templateRoute.GET, "GET", "/opening-stock/template", { token: store.token })).status).toBe(403);
  });

  it("validation finds every error type and posts nothing", async () => {
    const p = await product(token);
    const tracked = await product(token, { trackSerial: true });
    const old = await product(token);
    await prisma.product.update({ where: { id: old.id }, data: { status: "DISCONTINUED" } });
    await grn(token, await wh("A"), [{ productId: tracked.id, qty: 1, unitPrice: "1", serials: ["EXIST-1"] }]);
    const r = await validated([
      { warehouse: "Z", product: p.code, qty: 1 }, // 2 unknown warehouse
      { warehouse: "A", product: "NOPE", qty: 1 }, // 3 unknown product
      { warehouse: "A", product: old.code, qty: 1 }, // 4 discontinued
      { warehouse: "A", product: p.code, qty: 0 }, // 5 qty 0
      { warehouse: "A", product: p.code, qty: 1, cost: -5, condition: "BROKEN" }, // 6 negative cost + bad condition
      { warehouse: "A", product: tracked.code, qty: 2, serials: "S-1" }, // 7 serial count
      { warehouse: "B", product: tracked.code, qty: 1, serials: "S-9" }, // 8 ok
      { warehouse: "B", product: tracked.code, qty: 1, serials: "s-9", condition: "DAMAGED" }, // 9 duplicate serial in file
      { warehouse: "B", product: tracked.code, qty: 1, serials: "EXIST-1", condition: "DAMAGED" }, // 10 serial already in DB... merged into 9 → also dup cost? (same cost)
      { warehouse: "B", product: p.code, qty: 1, cost: 10 }, // 11
      { warehouse: "B", product: p.code, qty: 2, cost: 12 }, // 12 duplicate with different cost
      { warehouse: "A", product: p.code, qty: "1.5", cost: 3, serials: "X" }, // 13 serials on untracked
      { warehouse: "A", product: p.code, qty: 1, cost: null }, // 14 cost missing
    ]);
    expect(r.status).toBe("INVALID");
    const msg = (row: number) => r.errors.filter((e: any) => e.row === row).map((e: any) => e.message).join(" | ");
    expect(msg(2)).toMatch(/Unknown warehouse 'Z'/);
    expect(msg(3)).toMatch(/Unknown product 'NOPE'/);
    expect(msg(4)).toMatch(/discontinued/);
    expect(msg(5)).toMatch(/greater than 0/);
    expect(msg(6)).toMatch(/Condition must be/);
    expect(msg(6)).toMatch(/Unit cost must be 0 or more/);
    expect(msg(7)).toMatch(/exactly 2/);
    expect(r.errors.some((e: any) => /Serial S-9 .* also in row 8/.test(e.message))).toBe(true);
    expect(r.errors.some((e: any) => /Serial EXIST-1 .* already exists/.test(e.message))).toBe(true);
    expect(msg(12)).toMatch(/different unit cost/);
    expect(msg(13)).toMatch(/does not track serial numbers/);
    expect(msg(14)).toMatch(/Unit cost is required/);
    expect(r.errors.every((e: any) => e.field && e.row)).toBe(true);
    expect(await prisma.stockEntry.count({ where: { type: "OPENING" } })).toBe(0);
    expect((await commitImport(token, r.id)).body.error.code).toBe("BUSINESS_RULE");
  });

  it("commit posts one OPENING entry per warehouse with balances, costs and serials; second commit does nothing", async () => {
    const p = await product(token);
    const t = await product(token, { trackSerial: true });
    const r = await validated([
      { warehouse: "A", product: p.code, qty: 10, cost: "100" },
      { warehouse: "A", product: p.code, qty: 5, cost: "100", note: "shelf 2" }, // merged (warning)
      { warehouse: "B", product: p.code, qty: "2.5", cost: "200" },
      { warehouse: "B", product: t.code, qty: 2, cost: "50000", serials: "SN-1, sn-2" },
      { warehouse: "A", product: p.code, qty: 1, cost: "100", condition: "DAMAGED" },
    ]);
    expect(r.status).toBe("VALID");
    expect(r.warnings).toHaveLength(1);
    expect(r.summary).toEqual([
      { warehouseId: await wh("A"), warehouseCode: "A", lines: 2, totalQty: "16.000", totalValue: "1600.00" },
      { warehouseId: await wh("B"), warehouseCode: "B", lines: 2, totalQty: "4.500", totalValue: "100500.00" },
    ]);

    const k = key("commit");
    const c = await commitImport(token, r.id, k);
    expect(c.status).toBe(200);
    expect(c.body.data.status).toBe("COMMITTED");
    expect(c.body.data.entries.map((e: any) => e.number)).toEqual([`OPN-${FY}-0001`, `OPN-${FY}-0002`]);
    expect(await balance(p.id, "A")).toMatchObject({ onHand: "15.000" });
    expect(await balance(p.id, "A", "DAMAGED")).toMatchObject({ onHand: "1.000" });
    expect(await balance(p.id, "B")).toMatchObject({ onHand: "2.500" });
    expect(await cost(p.id)).toEqual({ totalQty: "18.500", totalValue: "2100.00", avgCost: "113.5135" });
    expect((await prisma.serialNumber.findMany({ where: { productId: t.id }, orderBy: { serial: "asc" } })).map((s) => [s.serial, s.status])).toEqual([
      ["SN-1", "IN_STOCK"],
      ["SN-2", "IN_STOCK"],
    ]);
    expect(await prisma.auditLog.count({ where: { action: "opening_import.commit", entityId: r.id } })).toBe(1);

    // A second commit (new key) changes nothing.
    const again = await commitImport(token, r.id);
    expect(again.status).toBe(200);
    expect(again.body.data.alreadyCommitted).toBe(true);
    expect(await prisma.stockEntry.count({ where: { type: "OPENING" } })).toBe(2);
    expect(await balance(p.id, "A")).toMatchObject({ onHand: "15.000" });
  });

  it("is all-or-nothing when something fails during commit", async () => {
    const p = await product(token);
    const t = await product(token, { trackSerial: true });
    const r = await validated([
      { warehouse: "A", product: p.code, qty: 3, cost: "10" },
      { warehouse: "B", product: t.code, qty: 1, cost: "10", serials: "LATE-1" },
    ]);
    expect(r.status).toBe("VALID");
    // Meanwhile the serial appears through a GRN: the commit must refuse and write nothing.
    await grn(token, await wh("A"), [{ productId: t.id, qty: 1, unitPrice: "1", serials: ["LATE-1"] }]);
    const c = await commitImport(token, r.id);
    expect(c.status).toBe(400);
    expect(JSON.stringify(c.body.error.details)).toMatch(/LATE-1/);
    expect(await prisma.stockEntry.count({ where: { type: "OPENING" } })).toBe(0);
    expect(await balance(p.id, "A")).toMatchObject({ onHand: "0.000" });

    // A failure inside the posting engine for the second warehouse rolls back the first one too:
    // warehouse B's product is frozen by a stock count after validation.
    const q = await product(token);
    const r2 = await validated([
      { warehouse: "A", product: q.code, qty: 4, cost: "10" },
      { warehouse: "B", product: q.code, qty: 1, cost: "10" },
    ]);
    const count = await createCount(token, { warehouseId: await wh("B"), scope: "SELECTED_PRODUCTS", scopeIds: [q.id] });
    expect((await startCount(count.id, token)).status).toBe(200);
    const c2 = await commitImport(token, r2.id);
    expect(c2.status).toBe(422);
    expect(c2.body.error.details[0].code).toBe("COUNT_IN_PROGRESS");
    expect(await balance(q.id, "A")).toMatchObject({ onHand: "0.000" });
    expect(await prisma.stockEntry.count({ where: { type: "OPENING" } })).toBe(0);
    expect((await waitForImport(token, r2.id)).status).toBe("VALID");
  });

  it("a locked warehouse refuses imports and OPENING entries; unlock needs Admin + reason and is audited", async () => {
    const p = await product(token);
    expect((await lockA()).body.data).toMatchObject({ code: "A", openingLocked: true });
    const list = await call(warehousesRoute.GET, "GET", "/x", { token });
    expect(list.body.data.find((w: any) => w.code === "A").openingLocked).toBe(true);

    const r = await validated([{ warehouse: "A", product: p.code, qty: 1, cost: "1" }]);
    expect(r.status).toBe("INVALID");
    expect(r.errors[0].message).toMatch(/locked/);
    const direct = await createEntry(token, { type: "OPENING", warehouseId: await wh("A"), lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] });
    expect(direct.status).toBe(422);
    expect(direct.body.error.details[0].code).toBe("OPENING_LOCKED");
    // Warehouse B is still open.
    expect((await createEntry(token, { type: "OPENING", warehouseId: await wh("B"), lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] })).status).toBe(201);

    const id = await wh("A");
    const mgr = await userToken(token, "Manager");
    expect((await call(unlockRoute.POST, "POST", "/x", { token: mgr.token, params: { id }, body: { reason: "Late stock found" } })).status).toBe(403);
    expect((await call(unlockRoute.POST, "POST", "/x", { token, params: { id }, body: { reason: "" } })).status).toBe(400);
    const un = await call(unlockRoute.POST, "POST", "/x", { token, params: { id }, body: { reason: "Late stock found" } });
    expect(un.body.data.openingLocked).toBe(false);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "warehouse.unlock_opening", entityId: id } });
    expect(audit.after).toMatchObject({ reason: "Late stock found" });
    expect(await prisma.auditLog.count({ where: { action: "warehouse.lock_opening", entityId: id } })).toBe(1);
    expect((await createEntry(token, { type: "OPENING", warehouseId: id, lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] })).status).toBe(201);
  });

  it("requires FULL to upload and an Idempotency-Key to commit", async () => {
    const p = await product(token);
    const store = await userToken(token, "Store Manager");
    const bytes = await openingWorkbook(token, [{ warehouse: "A", product: p.code, qty: 1, cost: 1 }]);
    expect((await uploadOpening(store.token, bytes)).status).toBe(403);
    const r = await validated([{ warehouse: "A", product: p.code, qty: 1, cost: 1 }]);
    const { call: c } = await import("../helpers/http");
    const commitRoute = await import("@/app/api/v1/opening-stock/imports/[id]/commit/route");
    const noKey = await c(commitRoute.POST, "POST", "/x", { token, params: { id: r.id } });
    expect(noKey.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect((await uploadOpening(token, new TextEncoder().encode("not excel"))).status).toBe(400);
  });
});
