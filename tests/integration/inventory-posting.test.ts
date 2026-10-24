import { beforeEach, describe, expect, it } from "vitest";
import * as calculateRoute from "@/app/api/v1/stock-entries/calculate/route";
import * as entryRoute from "@/app/api/v1/stock-entries/[id]/route";
import { fiscalYear } from "@/modules/inventory/domain/numbering";
import { call } from "../helpers/http";
import { resetDatabase } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";
import { balance, cost, createEntry, customer, grn, key, post, prisma, product, project, receive, setProjectStatus, supplier, userToken, wh } from "../helpers/inventory";

let token: string;
let A: string;
let B: string;
const FY = fiscalYear(new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date())}T00:00:00Z`));

beforeEach(async () => {
  await resetDatabase();
  token = await adminToken();
  A = await wh("A");
  B = await wh("B");
});

const movements = (entryId: string) => prisma.stockMovement.findMany({ where: { entryId }, orderBy: { seq: "asc" } });

describe("GRN (local) and opening stock", () => {
  it("posts quantities, a movement, the cost and a sequential number", async () => {
    const p = await product(token);
    const e = await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "1000" }]);
    expect(e).toMatchObject({ status: "POSTED", number: `GRN-L-${FY}-0001`, costTotal: "10000.00", subtotal: "10000.00" });
    expect(e.lines[0]).toMatchObject({ qty: "10.000", unitCostBdt: "1000.0000", costAmount: "10000.00" });
    expect(await balance(p.id, "A")).toEqual({ onHand: "10.000", reserved: "0.000" });
    expect(await cost(p.id)).toEqual({ totalQty: "10.000", totalValue: "10000.00", avgCost: "1000.0000" });
    const [m] = await movements(e.id);
    expect(m).toMatchObject({ warehouseId: A, condition: "GOOD" });
    expect(m!.qtyChange.toFixed(3)).toBe("10.000");
    expect(m!.valueChange.toFixed(2)).toBe("10000.00");
    expect(m!.balanceAfter.toFixed(3)).toBe("10.000");
    expect(m!.avgCostAfter.toFixed(4)).toBe("1000.0000");

    const second = await grn(token, A, [{ productId: p.id, qty: 1, unitPrice: "1000" }]);
    expect(second.number).toBe(`GRN-L-${FY}-0002`);
  });

  it("opening stock posts at the given cost (FULL only)", async () => {
    const p = await product(token);
    const e = await post(token, { type: "OPENING", warehouseId: B, lines: [{ productId: p.id, qty: "2.5", unitPrice: "400" }] });
    expect(e.number).toBe(`OPN-${FY}-0001`);
    expect(await balance(p.id, "B")).toMatchObject({ onHand: "2.500" });
    expect(await cost(p.id)).toEqual({ totalQty: "2.500", totalValue: "1000.00", avgCost: "400.0000" });

    const store = await userToken(token, "Store Manager");
    const res = await createEntry(store.token, { action: "submit", type: "OPENING", warehouseId: A, lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] });
    expect(res.status).toBe(403);
  });
});

describe("weighted average cost", () => {
  it("averages GRNs at different costs and issues at the current average", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "100" }]);
    await grn(token, B, [{ productId: p.id, qty: 30, unitPrice: "200" }]);
    expect((await cost(p.id)).avgCost).toBe("175.0000");

    const issue = await post(token, { type: "ISSUE_TO_PROJECT", warehouseId: A, projectId: await project(), siteAddress: "Gulshan", receivedBy: "Site engineer", lines: [{ productId: p.id, qty: 8 }] });
    expect(issue.number).toBe(`ISS-${FY}-0001`);
    expect(issue.lines[0]).toMatchObject({ unitCostBdt: "175.0000", costAmount: "1400.00" });
    expect(await cost(p.id)).toEqual({ totalQty: "32.000", totalValue: "5600.00", avgCost: "175.0000" });
    expect(await balance(p.id, "A")).toMatchObject({ onHand: "2.000" });

    await grn(token, A, [{ productId: p.id, qty: 8, unitPrice: "250" }]);
    expect(await cost(p.id)).toEqual({ totalQty: "40.000", totalValue: "7600.00", avgCost: "190.0000" });
  });

  it("taking the last units takes exactly the remaining value (no rounding residue)", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 3, unitPrice: "100" }]);
    await grn(token, A, [{ productId: p.id, qty: 3, unitPrice: "100.01" }]); // avg 100.005
    const first = await post(token, { type: "DAMAGE_WRITE_OFF", warehouseId: A, reason: "Dropped", lines: [{ productId: p.id, qty: 5 }] });
    const last = await post(token, { type: "DAMAGE_WRITE_OFF", warehouseId: A, reason: "Dropped", lines: [{ productId: p.id, qty: 1 }] });
    const total = Number(first.costTotal) * 100 + Number(last.costTotal) * 100;
    expect(total).toBe(60003); // 300.00 + 300.03, in paisa
    expect(await cost(p.id)).toMatchObject({ totalQty: "0.000", totalValue: "0.00" });
  });
});

describe("GRN (imported) landed cost", () => {
  it("applies % and amount charges, spreads included charges by goods value, and records excluded ones", async () => {
    const p1 = await product(token);
    const p2 = await product(token);
    const e = await post(token, {
      type: "GRN_IMPORT",
      warehouseId: A,
      supplierId: await supplier("Daikin Airconditioning (Thailand)"),
      currency: "USD",
      exchangeRate: "120",
      lcNo: "LC-1",
      billOfEntryNo: "BE-9",
      lines: [
        { productId: p1.id, qty: 10, unitPrice: "100" },
        { productId: p2.id, qty: 5, unitPrice: "200" },
      ],
      charges: [
        { type: "CUSTOMS_DUTY", mode: "PERCENT_OF_GOODS", value: "10", includeInCost: true },
        { type: "FREIGHT", mode: "AMOUNT_BDT", value: "6000", includeInCost: true },
        { type: "AIT", mode: "PERCENT_OF_GOODS", value: "5", includeInCost: false },
      ],
    });
    expect(e.number).toBe(`GRN-I-${FY}-0001`);
    expect(e.charges.map((c: any) => c.amountBdt)).toEqual(["24000.00", "6000.00", "12000.00"]);
    expect(e.lines[0]).toMatchObject({ amount: "120000.00", costAmount: "135000.00", landedUnitCost: "13500.0000", unitCostBdt: "13500.0000" });
    expect(e.lines[1]).toMatchObject({ amount: "120000.00", costAmount: "135000.00", landedUnitCost: "27000.0000" });
    expect(e).toMatchObject({ subtotal: "240000.00", costTotal: "270000.00", grandTotal: "282000.00" });
    expect((await cost(p1.id)).avgCost).toBe("13500.0000");
  });

  it("spreads by value when lines differ, and the shares add up exactly", async () => {
    const ps = [await product(token), await product(token), await product(token)];
    const e = await post(token, {
      type: "GRN_IMPORT",
      warehouseId: A,
      supplierId: await supplier("Daikin Airconditioning (Thailand)"),
      currency: "USD",
      exchangeRate: "1",
      lines: [
        { productId: ps[0]!.id, qty: 1, unitPrice: "100" },
        { productId: ps[1]!.id, qty: 1, unitPrice: "100" },
        { productId: ps[2]!.id, qty: 1, unitPrice: "100" },
      ],
      charges: [{ type: "CNF", mode: "AMOUNT_BDT", value: "100", includeInCost: true }],
    });
    expect(e.lines.map((l: any) => l.costAmount)).toEqual(["133.33", "133.33", "133.34"]);
    expect(e.costTotal).toBe("400.00");
  });
});

describe("issue, sale, return to supplier, write-off, return from site", () => {
  it("issue to project needs a planning/running project", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 5, unitPrice: "10" }]);
    await setProjectStatus(token, "PRJ-001", "COMPLETED");
    const res = await createEntry(token, { type: "ISSUE_TO_PROJECT", warehouseId: A, projectId: await project(), lines: [{ productId: p.id, qty: 1 }] });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].code).toBe("PROJECT_STATUS");
    // Returns are still allowed for a completed project…
    const ret = await createEntry(token, { type: "RETURN_FROM_SITE", warehouseId: A, projectId: await project(), lines: [{ productId: p.id, qty: 1 }] });
    expect(ret.status).toBe(201);
    // …but not for a closed one.
    await setProjectStatus(token, "PRJ-001", "CLOSED");
    expect((await createEntry(token, { type: "RETURN_FROM_SITE", warehouseId: A, projectId: await project(), lines: [{ productId: p.id, qty: 1 }] })).status).toBe(422);
  });

  it("sale: default price, discount, VAT from settings, profit", async () => {
    const p = await product(token, { sellingPrice: "1500" });
    await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "1000" }]);
    const e = await post(token, { type: "SALE", warehouseId: A, customerId: await customer(), customerPhone: "01711", discountAmount: "500", lines: [{ productId: p.id, qty: 2 }] });
    expect(e.number).toBe(`SAL-${FY}-0001`);
    expect(e.lines[0]).toMatchObject({ unitPrice: "1500.0000", amount: "3000.00", costAmount: "2000.00" });
    expect(e).toMatchObject({ subtotal: "3000.00", discountAmount: "500.00", vatPercent: "15.00", vatAmount: "375.00", grandTotal: "2875.00", costTotal: "2000.00", profit: "500.00" });
    expect(await balance(p.id, "A")).toMatchObject({ onHand: "8.000" });
  });

  it("sale below average cost → 422, unless an Admin confirms (audit-logged)", async () => {
    const p = await product(token, { sellingPrice: "900" });
    await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "1000" }]);
    const body = { type: "SALE", warehouseId: A, customerId: await customer(), lines: [{ productId: p.id, qty: 1 }] };
    const res = await createEntry(token, body);
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].code).toBe("BELOW_COST");

    const ok = await createEntry(token, { ...body, confirmBelowCost: true });
    expect(ok.status).toBe(201);
    expect(ok.body.data.belowCostConfirmed).toBe(true);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "stock_entry.post", entityId: ok.body.data.id } });
    expect(audit.after).toMatchObject({ belowCostConfirmed: true });

    // A Manager (APPROVE, not FULL) can't override.
    const mgr = await userToken(token, "Manager");
    expect((await createEntry(mgr.token, { ...body, action: "submit", confirmBelowCost: true })).status).toBe(422);
  });

  it("return to supplier and write-off take stock out at average cost", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "50" }]);
    const rts = await post(token, { type: "RETURN_TO_SUPPLIER", warehouseId: A, supplierId: await supplier(), reason: "Faulty", lines: [{ productId: p.id, qty: 2 }] });
    expect(rts).toMatchObject({ number: `RTS-${FY}-0001`, costTotal: "100.00" });
    expect((await createEntry(token, { type: "DAMAGE_WRITE_OFF", warehouseId: A, lines: [{ productId: p.id, qty: 1 }] })).status).toBe(400); // reason required
    const dmg = await post(token, { type: "DAMAGE_WRITE_OFF", warehouseId: A, reason: "Water damage", lines: [{ productId: p.id, qty: 3 }] });
    expect(dmg).toMatchObject({ number: `DMG-${FY}-0001`, costTotal: "150.00" });
    expect(await balance(p.id, "A")).toMatchObject({ onHand: "5.000" });
    expect(await cost(p.id)).toEqual({ totalQty: "5.000", totalValue: "250.00", avgCost: "50.0000" });
  });

  it("return from site uses the original issue cost, and DAMAGED returns go to damaged stock", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "100" }]);
    const issue = await post(token, { type: "ISSUE_TO_PROJECT", warehouseId: A, projectId: await project(), lines: [{ productId: p.id, qty: 6 }] });
    await grn(token, A, [{ productId: p.id, qty: 4, unitPrice: "400" }]); // avg now (400 + 1600) / 8 = 250

    const ret = await post(token, {
      type: "RETURN_FROM_SITE",
      warehouseId: A,
      projectId: await project(),
      originalEntryId: issue.id,
      lines: [
        { productId: p.id, qty: 2, condition: "GOOD" },
        { productId: p.id, qty: 1, condition: "DAMAGED" },
      ],
    });
    expect(ret.number).toBe(`RTN-${FY}-0001`);
    expect(ret.lines.map((l: any) => l.unitCostBdt)).toEqual(["100.0000", "100.0000"]);
    expect(ret.lines[0].originalLineId).toBe(issue.lines[0].id);
    expect(await balance(p.id, "A", "GOOD")).toMatchObject({ onHand: "10.000" });
    expect(await balance(p.id, "A", "DAMAGED")).toMatchObject({ onHand: "1.000" });
    expect(await cost(p.id)).toEqual({ totalQty: "11.000", totalValue: "2300.00", avgCost: "209.0909" });

    // Can't return more than was issued.
    const over = await createEntry(token, { type: "RETURN_FROM_SITE", warehouseId: A, projectId: await project(), originalEntryId: issue.id, lines: [{ productId: p.id, qty: 4 }] });
    expect(over.status).toBe(422);
    expect(over.body.error.details[0].code).toBe("RETURN_EXCEEDS");
  });

  it("DAMAGED stock can't be issued or sold, only written off or returned", async () => {
    const p = await product(token);
    await post(token, { type: "RETURN_FROM_SITE", warehouseId: A, projectId: await project(), lines: [{ productId: p.id, qty: 2, condition: "DAMAGED" }] });
    for (const type of ["ISSUE_TO_PROJECT", "SALE", "TRANSFER"]) {
      const res = await createEntry(token, { type, warehouseId: A, projectId: await project(), customerId: await customer(), toWarehouseId: B, lines: [{ productId: p.id, qty: 1, condition: "DAMAGED" }] });
      expect(res.status, type).toBe(422);
      expect(res.body.error.details[0].code).toBe("DAMAGED_NOT_ALLOWED");
    }
    // GOOD stock is zero, so a plain issue fails on availability.
    const good = await createEntry(token, { type: "ISSUE_TO_PROJECT", warehouseId: A, projectId: await project(), lines: [{ productId: p.id, qty: 1 }] });
    expect(good.body.error.details[0].code).toBe("INSUFFICIENT_STOCK");
    const wo = await post(token, { type: "DAMAGE_WRITE_OFF", warehouseId: A, reason: "Scrap", lines: [{ productId: p.id, qty: 1, condition: "DAMAGED" }] });
    expect(wo.status).toBe("POSTED");
    const rts = await post(token, { type: "RETURN_TO_SUPPLIER", warehouseId: A, supplierId: await supplier(), lines: [{ productId: p.id, qty: 1, condition: "DAMAGED" }] });
    expect(rts.status).toBe("POSTED");
    expect(await balance(p.id, "A", "DAMAGED")).toMatchObject({ onHand: "0.000" });
  });
});

describe("transfer", () => {
  it("dispatch → in transit → receive, average cost unchanged", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "100" }]);
    const t = await post(token, { type: "TRANSFER", warehouseId: A, toWarehouseId: B, vehicle: "DHA-11-2233", lines: [{ productId: p.id, qty: 4 }] });
    expect(t).toMatchObject({ status: "DISPATCHED", number: `TRF-${FY}-0001` });
    expect(await balance(p.id, "A")).toMatchObject({ onHand: "6.000" });
    expect(await balance(p.id, "B")).toMatchObject({ onHand: "0.000" });
    expect((await prisma.stockInTransit.findFirstOrThrow({ where: { transferEntryId: t.id } })).qty.toFixed(3)).toBe("4.000");
    expect(await cost(p.id)).toEqual({ totalQty: "10.000", totalValue: "1000.00", avgCost: "100.0000" });

    const r = await receive(t.id, token, { lines: [{ lineId: t.lines[0].id, receivedQty: 4 }] });
    expect(r.status).toBe(200);
    expect(r.body.data.entry.status).toBe("RECEIVED");
    expect(r.body.data.shortageEntry).toBeNull();
    expect(await balance(p.id, "B")).toMatchObject({ onHand: "4.000" });
    expect((await prisma.stockInTransit.findFirstOrThrow({ where: { transferEntryId: t.id } })).qty.toFixed(3)).toBe("0.000");
    expect(await cost(p.id)).toEqual({ totalQty: "10.000", totalValue: "1000.00", avgCost: "100.0000" });
  });

  it("a shortfall goes to damaged stock with a pending write-off", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: "100" }]);
    const t = await post(token, { type: "TRANSFER", warehouseId: A, toWarehouseId: B, lines: [{ productId: p.id, qty: 5 }] });
    const r = await receive(t.id, token, { lines: [{ lineId: t.lines[0].id, receivedQty: 3 }] });
    const wo = r.body.data.shortageEntry;
    expect(wo).toMatchObject({ type: "DAMAGE_WRITE_OFF", status: "PENDING", references: { reason: "Transfer shortage" }, relatedEntry: { id: t.id } });
    expect(wo.number).toBe(`DMG-${FY}-0001`);
    expect(wo.lines[0]).toMatchObject({ qty: "2.000", condition: "DAMAGED" });
    expect(await balance(p.id, "B", "GOOD")).toMatchObject({ onHand: "3.000" });
    expect(await balance(p.id, "B", "DAMAGED")).toEqual({ onHand: "2.000", reserved: "2.000" });
  });

  it("needs a different destination", async () => {
    const p = await product(token);
    await grn(token, A, [{ productId: p.id, qty: 1, unitPrice: "1" }]);
    const res = await createEntry(token, { type: "TRANSFER", warehouseId: A, toWarehouseId: A, lines: [{ productId: p.id, qty: 1 }] });
    expect(res.body.error.details[0].code).toBe("SAME_WAREHOUSE");
  });
});

describe("calculate", () => {
  it("returns the same totals posting saves, without saving anything", async () => {
    const p = await product(token, { sellingPrice: "2500" });
    await grn(token, A, [{ productId: p.id, qty: 4, unitPrice: "1000" }]);
    await grn(token, A, [{ productId: p.id, qty: 2, unitPrice: "1300" }]);
    const body = { type: "SALE", warehouseId: A, customerId: await customer(), discountAmount: "123.45", vatPercent: "7.5", lines: [{ productId: p.id, qty: 3 }] };
    const before = await prisma.stockEntry.count();
    const calc = await call(calculateRoute.POST, "POST", "/stock-entries/calculate", { token, body });
    expect(calc.status).toBe(200);
    expect(await prisma.stockEntry.count()).toBe(before);
    expect(calc.body.data).toMatchObject({ nextNumber: `SAL-${FY}-0001`, postingMode: "POSTED_IMMEDIATELY" });
    expect(calc.body.data.lines[0]).toMatchObject({ available: "6.000", insufficient: false, unitPrice: "2500.00", unitCostBdt: "1100.0000" });

    const posted = await post(token, body);
    expect(calc.body.data.totals).toMatchObject({ subtotal: posted.subtotal, vatAmount: posted.vatAmount, grandTotal: posted.grandTotal, costTotal: posted.costTotal, profit: posted.profit });
    const stored = await call(entryRoute.GET, "GET", `/stock-entries/${posted.id}`, { token, params: { id: posted.id } });
    expect(stored.body.data.grandTotal).toBe(calc.body.data.totals.grandTotal);
  });

  it("warns about availability and serial counts", async () => {
    const p = await product(token, { trackSerial: true });
    const calc = await call(calculateRoute.POST, "POST", "/stock-entries/calculate", { token, body: { type: "ISSUE_TO_PROJECT", warehouseId: A, projectId: await project(), lines: [{ productId: p.id, qty: 2 }] } });
    expect(calc.body.data.warnings.map((w: any) => w.code)).toEqual(expect.arrayContaining(["INSUFFICIENT_STOCK", "SERIAL_COUNT"]));
    expect(calc.body.data.lines[0].insufficient).toBe(true);
  });

  it("matches import landed cost exactly", async () => {
    const p = await product(token);
    const body = {
      type: "GRN_IMPORT",
      warehouseId: A,
      supplierId: await supplier("Dunham-Bush (Malaysia)"),
      currency: "MYR",
      exchangeRate: "26.3",
      lines: [{ productId: p.id, qty: 3, unitPrice: "1999.99" }],
      charges: [
        { type: "CUSTOMS_DUTY", mode: "PERCENT_OF_GOODS", value: "12.5", includeInCost: true },
        { type: "IMPORT_VAT", mode: "PERCENT_OF_GOODS", value: "15", includeInCost: false },
      ],
    };
    const calc = (await call(calculateRoute.POST, "POST", "/stock-entries/calculate", { token, body })).body.data;
    const posted = await post(token, body);
    expect(calc.lines[0].landedUnitCost).toBe(posted.lines[0].landedUnitCost);
    expect(calc.totals.costTotal).toBe(posted.costTotal);
    expect(calc.totals.grandTotal).toBe(posted.grandTotal);
  });
});

describe("validation", () => {
  it("requires the parties each type needs and rejects future dates", async () => {
    const p = await product(token);
    const cases: [Record<string, unknown>, string][] = [
      [{ type: "GRN_LOCAL" }, "supplierId"],
      [{ type: "SALE" }, "customerId"],
      [{ type: "ISSUE_TO_PROJECT" }, "projectId"],
      [{ type: "TRANSFER" }, "toWarehouseId"],
    ];
    for (const [extra, path] of cases) {
      const res = await createEntry(token, { warehouseId: A, lines: [{ productId: p.id, qty: 1, unitPrice: 1 }], ...extra } as never);
      expect(res.status, path).toBe(400);
      expect(res.body.error.details[0].path).toBe(path);
    }
    const future = await createEntry(token, { type: "GRN_LOCAL", warehouseId: A, supplierId: await supplier(), entryDate: "2999-01-01", lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] });
    expect(future.body.error.details[0].code).toBe("FUTURE_DATE");
    expect((await createEntry(token, { type: "GRN_LOCAL", warehouseId: A, supplierId: await supplier(), lines: [{ productId: p.id, qty: 0, unitPrice: 1 }] })).status).toBe(400);
  });

  it("rejects discontinued products in new receipts and issues", async () => {
    const p = await product(token);
    await prisma.product.update({ where: { id: p.id }, data: { status: "DISCONTINUED" } });
    const res = await createEntry(token, { type: "GRN_LOCAL", warehouseId: A, supplierId: await supplier(), lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] });
    expect(res.body.error.details[0].code).toBe("PRODUCT_DISCONTINUED");
  });

  it("requires an Idempotency-Key on stock-changing requests", async () => {
    const p = await product(token);
    const entriesRoute = await import("@/app/api/v1/stock-entries/route");
    const res = await call(entriesRoute.POST, "POST", "/stock-entries", { token, body: { action: "post", type: "GRN_LOCAL", warehouseId: A, supplierId: await supplier(), lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(key()).toMatch(/test$/);
  });
});
