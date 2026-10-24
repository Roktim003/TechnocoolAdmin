import { describe, expect, it } from "vitest";
import { d, m2, sum } from "@/modules/inventory/domain/decimal";
import { applyExactOut, applyIn, applyOut, fromCostState, toCostState } from "@/modules/inventory/domain/cost";
import { allocate, computeEntry, type CalcInput } from "@/modules/inventory/domain/calculate";
import { fiscalYear, formatDocNumber, formatProjectCode, todayInDhaka } from "@/modules/inventory/domain/numbering";
import { assertSerialCount, normalizeSerial } from "@/modules/inventory/domain/rules";

describe("decimal", () => {
  it("is exact where floats are not", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(d("0.1").plus("0.2").toFixed(2)).toBe("0.30");
    expect(m2(d("2.675"))).toBe("2.68"); // half-up, unlike float rounding
    expect(sum([d("33.33"), d("33.33"), d("33.34")]).toFixed(2)).toBe("100.00");
  });
});

describe("weighted average cost", () => {
  it("averages receipts and keeps the last average at zero stock", () => {
    let s = applyIn(toCostState(null), d(10), d(1000));
    s = applyIn(s, d(30), d(6000));
    expect(fromCostState(s)).toEqual({ totalQty: "40.000", totalValue: "7000.00", avgCost: "175.0000" });
    const out = applyOut(s, d(40));
    expect(out.value.toFixed(2)).toBe("7000.00");
    expect(fromCostState(out.state)).toEqual({ totalQty: "0.000", totalValue: "0.00", avgCost: "175.0000" });
  });

  it("takes the exact remaining value on the last units", () => {
    let s = applyIn(toCostState(null), d(3), d(1000));
    const a = applyOut(s, d(1));
    const b = applyOut(a.state, d(1));
    const c = applyOut(b.state, d(1));
    expect(a.value.plus(b.value).plus(c.value).toFixed(2)).toBe("1000.00");
    s = c.state;
    expect(s.totalValue.toFixed(2)).toBe("0.00");
  });

  it("an exact reversal of a receipt restores the previous position", () => {
    const before = applyIn(toCostState(null), d(10), d(1000));
    const after = applyIn(before, d(3), d("399.99"));
    const back = applyExactOut(after, d(3), d("399.99")).state;
    expect(fromCostState(back)).toEqual(fromCostState(before));
  });
});

describe("allocate", () => {
  it("splits by weight and gives the remainder to the last line", () => {
    expect(allocate(d(100), [d(1), d(1), d(1)]).map((x) => x.toFixed(2))).toEqual(["33.33", "33.33", "33.34"]);
    expect(allocate(d(10), [d(300), d(100)]).map((x) => x.toFixed(2))).toEqual(["7.50", "2.50"]);
    expect(allocate(d(1), [d(0), d(0)]).map((x) => x.toFixed(2))).toEqual(["0.50", "0.50"]);
  });
});

describe("computeEntry", () => {
  const base = (over: Partial<CalcInput>): CalcInput => ({ type: "GRN_LOCAL", lines: [], charges: [], exchangeRate: "1", discountAmount: "0", vatPercent: "0", costs: new Map(), ...over });

  it("import: converts currency and lands included charges", () => {
    const r = computeEntry(
      base({
        type: "GRN_IMPORT",
        exchangeRate: "120",
        lines: [{ productId: "p", qty: "10", unitPrice: "100", condition: "GOOD" }],
        charges: [
          { type: "CUSTOMS_DUTY", mode: "PERCENT_OF_GOODS", value: "10", includeInCost: true },
          { type: "AIT", mode: "AMOUNT_BDT", value: "500", includeInCost: false },
        ],
      }),
    );
    expect(r.lines[0]).toMatchObject({ goodsBdt: "120000.00", chargeShare: "12000.00", costAmount: "132000.00", landedUnitCost: "13200.0000" });
    expect(r.totals).toMatchObject({ chargesIncluded: "12000.00", chargesExcluded: "500.00", costTotal: "132000.00" });
  });

  it("sale: discount, VAT, profit and below-cost flag", () => {
    const costs = new Map([["p", { totalQty: "10.000", totalValue: "10000.00", avgCost: "1000.0000" }]]);
    const r = computeEntry(base({ type: "SALE", costs, discountAmount: "100", vatPercent: "15", lines: [{ productId: "p", qty: "2", unitPrice: "1200", condition: "GOOD" }] }));
    expect(r.totals).toMatchObject({ subtotal: "2400.00", netAmount: "2300.00", vatAmount: "345.00", grandTotal: "2645.00", costTotal: "2000.00", profit: "300.00" });
    expect(r.lines[0]!.belowCost).toBe(false);
    const low = computeEntry(base({ type: "SALE", costs, lines: [{ productId: "p", qty: "1", unitPrice: "999.99", condition: "GOOD" }] }));
    expect(low.lines[0]!.belowCost).toBe(true);
  });

  it("two lines of the same product draw down the working cost in order", () => {
    const costs = new Map([["p", { totalQty: "3.000", totalValue: "300.01", avgCost: "100.0033" }]]);
    const r = computeEntry(base({ type: "ISSUE_TO_PROJECT", costs, lines: [{ productId: "p", qty: "2", unitPrice: "0", condition: "GOOD" }, { productId: "p", qty: "1", unitPrice: "0", condition: "GOOD" }] }));
    expect(r.totals.costTotal).toBe("300.01");
    expect(r.costsAfter.get("p")!.totalValue.toFixed(2)).toBe("0.00");
  });
});

describe("numbering", () => {
  it("fiscal year runs July–June", () => {
    expect(fiscalYear(new Date("2026-07-01T00:00:00Z"))).toBe("2627");
    expect(fiscalYear(new Date("2027-06-30T00:00:00Z"))).toBe("2627");
    expect(fiscalYear(new Date("2026-06-30T00:00:00Z"))).toBe("2526");
    expect(fiscalYear(new Date("2099-12-31T00:00:00Z"))).toBe("9900");
    expect(fiscalYear(new Date("2026-03-01T00:00:00Z"), 1)).toBe("2026");
  });

  it("formats document and project numbers", () => {
    expect(formatDocNumber("GRN-I", "2627", 1)).toBe("GRN-I-2627-0001");
    expect(formatDocNumber("SAL", "2627", 12345)).toBe("SAL-2627-12345");
    expect(formatProjectCode(7)).toBe("PRJ-007");
  });

  it("today is taken in Dhaka time", () => {
    expect(todayInDhaka(new Date("2026-10-24T19:30:00Z"))).toBe("2026-10-25");
  });
});

describe("serial rules", () => {
  it("normalises and counts serials", () => {
    expect(normalizeSerial("  ab-12 ")).toBe("AB-12");
    expect(() => assertSerialCount("X", "2", ["A"])).toThrow(/exactly 2/);
    expect(() => assertSerialCount("X", "1.5", ["A"])).toThrow(/whole number/);
    expect(() => assertSerialCount("X", "2.000", ["A", "B"])).not.toThrow();
  });
});

describe("stock adjustment (count)", () => {
  const costs = new Map([["p", { totalQty: "3.000", totalValue: "300.01", avgCost: "100.0033" }]]);
  const base = { charges: [], exchangeRate: "1", discountAmount: "0", vatPercent: "0", costs };

  it("values gains at the average cost and removes losses at it (exactly on the last units)", () => {
    const gain = computeEntry({ ...base, type: "STOCK_ADJUSTMENT", lines: [{ productId: "p", qty: "2", unitPrice: "0", condition: "GOOD", direction: "GAIN" }] });
    expect(gain.lines[0]).toMatchObject({ unitCostBdt: "100.0033", costAmount: "200.01" });
    expect(gain.costsAfter.get("p")!.totalQty.toFixed(3)).toBe("5.000");
    const loss = computeEntry({ ...base, type: "STOCK_ADJUSTMENT", lines: [{ productId: "p", qty: "3", unitPrice: "0", condition: "GOOD", direction: "LOSS" }] });
    expect(loss.lines[0]!.costAmount).toBe("300.01");
    expect(loss.costsAfter.get("p")!.totalValue.toFixed(2)).toBe("0.00");
  });
});

describe("email template", () => {
  it("escapes content and includes a text version with the link", async () => {
    const { renderEmail } = await import("@/modules/notifications/application/email-template");
    const { html, text } = renderEmail({ title: "A <b>test</b>", paragraphs: ["Body & more"], link: "https://x.example/stock/1", table: { head: ["Code", "Qty"], rows: [["X-1", "3"]], alignRight: [1] } });
    expect(html).toContain("A &lt;b&gt;test&lt;/b&gt;");
    expect(html).toContain("Body &amp; more");
    expect(html).toContain('href="https://x.example/stock/1"');
    expect(html).toContain("#0f62fe");
    expect(text).toContain("Open in StockBook: https://x.example/stock/1");
    expect(text).toContain("X-1 | 3");
  });
});
