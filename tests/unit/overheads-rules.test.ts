import { describe, expect, it } from "vitest";
import { holdingPercent, largeAmountWarning, monthOf, monthsBetween, nextMonth, validateCost } from "@/modules/overheads/domain/rules";
import { overheadWarnings, summarize, zeroCosts } from "@/modules/projects/domain/rules";
import { canSeeOverheads, emptyPermissionMap } from "@/shared/rbac/levels";
import { filterSensitiveFields } from "@/shared/rbac/sensitive-fields";

describe("overheads: months and validation", () => {
  it("parses and steps months", () => {
    expect(monthOf("2026-11")).toBe("2026-11-01");
    expect(monthOf("2026-11-30")).toBe("2026-11-01");
    expect(monthOf("2026-13")).toBeNull();
    expect(nextMonth("2026-12-01")).toBe("2027-01-01");
    expect(monthsBetween("2026-11-01", "2027-02-01")).toEqual(["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"]);
  });

  it("checks scope / category and the month limit", () => {
    const ok = { scope: "WAREHOUSE" as const, category: "HOLDING" as const, warehouseId: "w", month: "2026-12-01" };
    expect(() => validateCost(ok, "2026-11-20")).not.toThrow();
    expect(() => validateCost({ ...ok, month: "2027-01-01" }, "2026-11-20")).toThrow(/one month/);
    expect(() => validateCost({ ...ok, category: "ESTABLISHMENT" }, "2026-11-20")).toThrow();
    expect(() => validateCost({ ...ok, warehouseId: null }, "2026-11-20")).toThrow(/warehouse/i);
    expect(() => validateCost({ scope: "COMPANY", category: "ESTABLISHMENT", warehouseId: null, month: "2026-11-01" }, "2026-11-20")).not.toThrow();
    expect(() => validateCost({ scope: "COMPANY", category: "ESTABLISHMENT", warehouseId: "w", month: "2026-11-01" }, "2026-11-20")).toThrow();
  });

  it("holding % and warnings", () => {
    expect(holdingPercent("500.00", "50000.00")).toBe("1.00");
    expect(holdingPercent("500.00", "0.00")).toBeNull();
    expect(largeAmountWarning("1000000.00")).toEqual([]);
    expect(largeAmountWarning("1000000.01").map((w) => w.code)).toEqual(["OVERHEAD_LARGE_AMOUNT"]);
    expect(overheadWarnings("100.00", { directCost: "1000.00", overheadCost: "300.00" })).toEqual([]);
    expect(overheadWarnings("100.00", { directCost: "1000.00", overheadCost: "300.01" }).map((w) => w.code)).toEqual(["OVERHEAD_ABOVE_30_PERCENT"]);
  });
});

describe("overheads: project figures and visibility", () => {
  it("full cost and both margins", () => {
    const s = summarize([], { ...zeroCosts(), LABOUR: "600.00", STORE_CHARGE: "100.00", HOLDING: "50.00", ESTABLISHMENT: "250.00" }, "2000.00");
    expect(s).toMatchObject({ directCost: "600.00", overheadCost: "400.00", fullCost: "1000.00", margin: "1000.00", marginPercent: "50.00", directMargin: "1400.00", directMarginPercent: "70.00", costUsedPercent: "50.00", directCostUsedPercent: "30.00" });
  });

  it("strips overhead fields unless overheads ≥ VIEW and seeCost", () => {
    const dto = { summary: { totalCost: "1.00", fullCost: "2.00", overheadCost: "1.00" } };
    const flags = { seeCost: true, seeProfit: false, seeMargin: false };
    expect(filterSensitiveFields(dto, { flags, permissions: emptyPermissionMap() })).toEqual({ summary: { totalCost: "1.00" } });
    const permissions = { ...emptyPermissionMap(), overheads: "VIEW" as const };
    expect(filterSensitiveFields(dto, { flags, permissions })).toEqual(dto);
    expect(filterSensitiveFields(dto, { flags: { ...flags, seeCost: false }, permissions }).summary).toEqual({});
    expect(canSeeOverheads({ permissions, flags })).toBe(true);
    expect(canSeeOverheads({ permissions: emptyPermissionMap(), flags })).toBe(false);
  });
});
