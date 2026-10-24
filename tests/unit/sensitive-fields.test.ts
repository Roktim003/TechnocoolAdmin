import { describe, expect, it } from "vitest";
import { filterSensitiveFields } from "@/shared/rbac/sensitive-fields";

const dto = {
  id: "p1",
  name: "Daikin 2T",
  price: 120_000,
  cost: 90_000,
  unitCost: 45_000,
  profit: 30_000,
  margin: 0.25,
  contractValue: 2_000_000,
  createdAt: new Date("2026-10-24T00:00:00Z"),
  lines: [{ qty: 1, costPrice: 1, grossProfit: 2, marginPercent: 3 }],
  nested: { deeper: { averageCost: 10, netProfit: 4, label: "keep" } },
  note: null,
};

const flags = (seeCost: boolean, seeProfit: boolean, seeMargin: boolean) => ({ flags: { seeCost, seeProfit, seeMargin } });

describe("filterSensitiveFields", () => {
  it("returns the same object untouched when every flag is on", () => {
    expect(filterSensitiveFields(dto, flags(true, true, true))).toBe(dto);
  });

  it("removes cost fields at every depth when seeCost is off", () => {
    const out = filterSensitiveFields(dto, flags(false, true, true)) as any;
    expect(out).not.toHaveProperty("cost");
    expect(out).not.toHaveProperty("unitCost");
    expect(out.lines[0]).toEqual({ qty: 1, grossProfit: 2, marginPercent: 3 });
    expect(out.nested.deeper).toEqual({ netProfit: 4, label: "keep" });
    expect(out.profit).toBe(30_000);
  });

  it("removes profit fields when seeProfit is off", () => {
    const out = filterSensitiveFields(dto, flags(true, false, true)) as any;
    expect(out).not.toHaveProperty("profit");
    expect(out.lines[0]).not.toHaveProperty("grossProfit");
    expect(out.nested.deeper).not.toHaveProperty("netProfit");
    expect(out.cost).toBe(90_000);
  });

  it("removes margin and contract value when seeMargin is off", () => {
    const out = filterSensitiveFields(dto, flags(true, true, false)) as any;
    expect(out).not.toHaveProperty("margin");
    expect(out).not.toHaveProperty("contractValue");
    expect(out.lines[0]).not.toHaveProperty("marginPercent");
  });

  it("removes everything sensitive with no flags and keeps the rest intact", () => {
    const out = filterSensitiveFields(dto, flags(false, false, false)) as any;
    expect(out).toEqual({ id: "p1", name: "Daikin 2T", price: 120_000, createdAt: dto.createdAt, lines: [{ qty: 1 }], nested: { deeper: { label: "keep" } }, note: null });
    expect(out.createdAt).toBeInstanceOf(Date);
  });

  it("does not mutate the input", () => {
    filterSensitiveFields(dto, flags(false, false, false));
    expect(dto.cost).toBe(90_000);
    expect(dto.lines[0]!.costPrice).toBe(1);
  });

  it("handles arrays and primitives at the top level", () => {
    expect(filterSensitiveFields([{ cost: 1, a: 2 }], flags(false, false, false))).toEqual([{ a: 2 }]);
    expect(filterSensitiveFields(5, flags(false, false, false))).toBe(5);
    expect(filterSensitiveFields(null, flags(false, false, false))).toBeNull();
  });
});
