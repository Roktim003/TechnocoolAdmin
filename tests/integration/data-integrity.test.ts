import { beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { runIntegrityChecks } from "@/modules/system/infrastructure/integrity-queries";
import { system } from "@/modules/system/interface/container";
import { resetDatabase, prisma } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";
import { createEntry, grn, post, product, project, receive, reverse, userToken, wh } from "../helpers/inventory";
import { approvedPo, grnFor } from "../helpers/purchasing";

/*
 * Database-level immutability (triggers) and the nightly integrity check.
 */

let token: string;
let A: string;
let B: string;
let posted: { id: string; lines: { id: string }[] };
let pendingIssue: { id: string; lines: { id: string }[] };

beforeAll(async () => {
  await resetDatabase();
  token = await adminToken();
  A = await wh("A");
  B = await wh("B");

  // A small but complete ledger: GRNs (one against a PO, one reversed), serials, a pending
  // issue (reservation), a transfer in transit and one received.
  const p = await product(token);
  const s = await product(token, { trackSerial: true });
  posted = await grn(token, A, [{ productId: p.id, qty: 20, unitPrice: "150" }]);
  await grn(token, A, [{ productId: s.id, qty: 3, unitPrice: "900", serials: ["SN-I-1", "SN-I-2", "SN-I-3"] }]);
  const po = await approvedPo(token, [{ productId: p.id, qty: 10, unitPrice: 160 }]);
  const g1 = await grnFor(token, po.id, [{ productId: p.id, qty: 4 }], { warehouseId: A });
  expect(g1.status).toBe(201);
  const g2 = await grnFor(token, po.id, [{ productId: p.id, qty: 2 }], { warehouseId: A });
  expect((await reverse(g2.body.data.id, token)).status).toBe(200);

  const store = (await userToken(token, "Store Manager", ["A"])).token;
  const issue = await createEntry(store, { action: "submit", type: "ISSUE_TO_PROJECT", warehouseId: A, projectId: await project(), lines: [{ productId: p.id, qty: 3 }] });
  expect(issue.status).toBe(201);
  pendingIssue = issue.body.data;

  await post(token, { type: "TRANSFER", warehouseId: A, toWarehouseId: B, lines: [{ productId: p.id, qty: 2 }] });
  const t2 = await post(token, { type: "TRANSFER", warehouseId: A, toWarehouseId: B, lines: [{ productId: s.id, qty: 1, serials: ["SN-I-1"] }] });
  expect((await receive(t2.id, token, { lines: [{ lineId: t2.lines[0].id, receivedQty: 1 }] })).status).toBe(200);
});

async function refused(sql: string) {
  try {
    await prisma.$executeRawUnsafe(sql);
    return null;
  } catch (err) {
    return err as Prisma.PrismaClientKnownRequestError;
  }
}

describe("database-level immutability", () => {
  it("refuses a direct UPDATE or DELETE of a stock movement", async () => {
    const m = await prisma.stockMovement.findFirstOrThrow();
    const upd = await refused(`UPDATE "StockMovement" SET "qtyChange" = 999 WHERE id = '${m.id}'`);
    expect(String(upd?.message)).toMatch(/StockMovement is append-only: UPDATE is not allowed/);
    const del = await refused(`DELETE FROM "StockMovement" WHERE id = '${m.id}'`);
    expect(String(del?.message)).toMatch(/StockMovement is append-only: DELETE is not allowed/);
    const sm = await prisma.serialMovement.findFirstOrThrow();
    expect(String((await refused(`UPDATE "SerialMovement" SET "toStatus" = 'SOLD' WHERE id = '${sm.id}'`))?.message)).toMatch(/append-only/);
    expect((await prisma.stockMovement.findUniqueOrThrow({ where: { id: m.id } })).qtyChange.toFixed(3)).toBe(m.qtyChange.toFixed(3));
  });

  it("refuses changes to audit log rows (also through Prisma)", async () => {
    const a = await prisma.auditLog.findFirstOrThrow();
    expect(String((await refused(`UPDATE "AuditLog" SET action = 'tampered' WHERE id = '${a.id}'`))?.message)).toMatch(/AuditLog rows are immutable/);
    await expect(prisma.auditLog.delete({ where: { id: a.id } })).rejects.toThrow(/immutable/);
    expect((await prisma.auditLog.findUniqueOrThrow({ where: { id: a.id } })).action).toBe(a.action);
  });

  it("refuses changes to the lines of a posted entry, but not of a pending one", async () => {
    const line = posted.lines[0]!.id;
    expect(String((await refused(`UPDATE "StockEntryLine" SET qty = 1 WHERE id = '${line}'`))?.message)).toMatch(/lines of a POSTED entry are immutable/);
    expect(String((await refused(`DELETE FROM "StockEntryLine" WHERE id = '${line}'`))?.message)).toMatch(/immutable \(DELETE refused\)/);
    // Pending entries can still be edited by the app (before approval).
    await prisma.$executeRawUnsafe(`UPDATE "StockEntryLine" SET note = 'checked' WHERE id = '${pendingIssue.lines[0]!.id}'`);
  });

  it("protects reversed entries' lines too", async () => {
    const reversed = await prisma.stockEntry.findFirstOrThrow({ where: { status: "REVERSED" }, include: { lines: true } });
    expect(String((await refused(`UPDATE "StockEntryLine" SET "unitCostBdt" = 1 WHERE id = '${reversed.lines[0]!.id}'`))?.message)).toMatch(/REVERSED entry are immutable/);
  });
});

describe("nightly integrity check", () => {
  it("passes on a consistent ledger (GRNs, PO receipts, a reversal, serials, a reservation, transfers)", async () => {
    const results = await runIntegrityChecks(prisma);
    expect(results.map((r) => r.key)).toEqual([
      "balance_vs_ledger",
      "product_cost_vs_ledger",
      "no_negative_balances",
      "reserved_vs_pending",
      "serial_status",
      "po_received_vs_grn",
      "unique_document_numbers",
    ]);
    expect(results.filter((r) => !r.passed)).toEqual([]);
  });

  it("detects a deliberately broken balance, reports it, notifies Admins and fixes nothing", async () => {
    const b = await prisma.stockBalance.findFirstOrThrow({ where: { warehouseId: A, qtyOnHand: { gt: 0 } }, include: { product: true } });
    await prisma.$executeRawUnsafe(`UPDATE "StockBalance" SET "qtyOnHand" = "qtyOnHand" + 5 WHERE id = '${b.id}'`);
    const before = await prisma.notification.count({ where: { type: "INTEGRITY_CHECK_FAILED" } });

    const run = await system().integrity.run("MANUAL");
    expect(run.passed).toBe(false);
    const broken = run.checks.find((c) => c.key === "balance_vs_ledger")!;
    expect(broken).toMatchObject({ passed: false, problems: 1 });
    expect(broken.details[0]).toMatchObject({ product: b.product.code, warehouse: "A", condition: "GOOD", balanceQty: b.qtyOnHand.plus(5).toFixed(3), ledgerQty: b.qtyOnHand.toFixed(3) });
    // The other checks still pass (no cascading noise).
    expect(run.checks.filter((c) => !c.passed).map((c) => c.key)).toEqual(["balance_vs_ledger"]);

    const saved = await prisma.integrityCheckRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(saved).toMatchObject({ status: "SUCCEEDED", passed: false, trigger: "MANUAL" });
    expect(await prisma.notification.count({ where: { type: "INTEGRITY_CHECK_FAILED" } })).toBeGreaterThan(before);
    // Report only: the wrong balance is still there.
    expect((await prisma.stockBalance.findUniqueOrThrow({ where: { id: b.id } })).qtyOnHand.toFixed(3)).toBe(b.qtyOnHand.plus(5).toFixed(3));

    await prisma.$executeRawUnsafe(`UPDATE "StockBalance" SET "qtyOnHand" = "qtyOnHand" - 5 WHERE id = '${b.id}'`);
  });

  it("detects reserved quantities, product cost, serial and PO drift", async () => {
    const bal = await prisma.stockBalance.findFirstOrThrow({ where: { qtyReserved: { gt: 0 } } });
    const pc = await prisma.productCost.findFirstOrThrow({ where: { totalQty: { gt: 0 } } });
    const serial = await prisma.serialNumber.findFirstOrThrow({ where: { status: "IN_STOCK" } });
    const pol = await prisma.purchaseOrderLine.findFirstOrThrow({ where: { receivedQty: { gt: 0 } } });
    await prisma.$executeRawUnsafe(`UPDATE "StockBalance" SET "qtyReserved" = "qtyReserved" + 1 WHERE id = '${bal.id}'`);
    await prisma.$executeRawUnsafe(`UPDATE "ProductCost" SET "totalValue" = "totalValue" + 10 WHERE "productId" = '${pc.productId}'`);
    await prisma.$executeRawUnsafe(`UPDATE "SerialNumber" SET status = 'SOLD' WHERE id = '${serial.id}'`);
    await prisma.$executeRawUnsafe(`UPDATE "PurchaseOrderLine" SET "receivedQty" = "receivedQty" + 1 WHERE id = '${pol.id}'`);

    const failed = (await runIntegrityChecks(prisma)).filter((c) => !c.passed).map((c) => c.key);
    expect(failed).toEqual(expect.arrayContaining(["reserved_vs_pending", "product_cost_vs_ledger", "serial_status", "po_received_vs_grn"]));
  });
});
