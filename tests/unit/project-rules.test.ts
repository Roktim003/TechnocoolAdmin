import { describe, expect, it } from "vitest";
import { alertLevel, netCost, netQty, summarize, zeroCosts } from "@/modules/projects/domain/rules";
import { transition, TRANSITIONS } from "@/modules/projects/domain/types";

describe("project costing rules", () => {
  const material = [
    { issuedQty: "10.000", returnedQty: "2.500", issuedCost: "1000.00", returnedCost: "250.00" },
    { issuedQty: "1.000", returnedQty: "0.000", issuedCost: "333.33", returnedCost: "0.00" },
  ];

  it("nets quantities and costs per product", () => {
    expect(netQty(material[0]!)).toBe("7.500");
    expect(netCost(material[0]!)).toBe("750.00");
  });

  it("totals, margin and percentages (decimal, 2 dp)", () => {
    expect(summarize(material, { LABOUR: "100.00", TRANSPORT: "50.00", OTHER: "16.67" }, "3000.00")).toEqual({
      issuedCost: "1333.33",
      returnedCost: "250.00",
      netMaterialCost: "1083.33",
      labourCost: "100.00",
      transportCost: "50.00",
      otherCost: "16.67",
      totalCost: "1250.00",
      contractValue: "3000.00",
      margin: "1750.00",
      marginPercent: "58.33",
      costUsedPercent: "41.67",
    });
  });

  it("no contract value: no margin or percentages; a zero contract gives a margin but no percentages", () => {
    expect(summarize([], zeroCosts(), null)).toMatchObject({ totalCost: "0.00", contractValue: null, margin: null, marginPercent: null, costUsedPercent: null });
    expect(summarize([], { ...zeroCosts(), LABOUR: "10.00" }, "0.00")).toMatchObject({ margin: "-10.00", marginPercent: null, costUsedPercent: null });
  });

  it("alert level: highest threshold reached", () => {
    expect(alertLevel(null)).toBe(0);
    expect(alertLevel("89.99")).toBe(0);
    expect(alertLevel("90.00")).toBe(90);
    expect(alertLevel("99.99")).toBe(90);
    expect(alertLevel("100.00")).toBe(100);
    expect(alertLevel("250.00")).toBe(100);
  });

  it("only the listed status transitions exist", () => {
    expect(TRANSITIONS).toHaveLength(7);
    expect(transition("PLANNING", "RUNNING")?.level).toBe("CREATE");
    expect(transition("COMPLETED", "CLOSED")).toMatchObject({ level: "FULL", reason: true });
    expect(transition("CLOSED", "COMPLETED")?.level).toBe("ADMIN");
    expect(transition("PLANNING", "COMPLETED")).toBeUndefined();
    expect(transition("ON_HOLD", "COMPLETED")).toBeUndefined();
  });
});
