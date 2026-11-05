/**
 * Overheads vocabulary (framework-free). Three overhead costs are entered manually as amounts:
 * no automatic rates, no automatic allocation, and they never change stock unit cost,
 * average cost or stock value.
 */

export const OVERHEAD_SCOPES = ["WAREHOUSE", "COMPANY"] as const;
export type OverheadScope = (typeof OVERHEAD_SCOPES)[number];

export const WAREHOUSE_COST_CATEGORIES = ["STORE_CHARGE", "HOLDING", "ESTABLISHMENT"] as const;
export type WarehouseCostCategory = (typeof WAREHOUSE_COST_CATEGORIES)[number];

export const OVERHEAD_LABEL: Record<WarehouseCostCategory, string> = {
  STORE_CHARGE: "Store charge",
  HOLDING: "Holding cost",
  ESTABLISHMENT: "Established cost (overhead)",
};

/** Which categories each scope takes: warehouse lines are store charge or holding; the company line is the established cost. */
export const SCOPE_CATEGORIES: Record<OverheadScope, readonly WarehouseCostCategory[]> = {
  WAREHOUSE: ["STORE_CHARGE", "HOLDING"],
  COMPANY: ["ESTABLISHMENT"],
};

/** Warning (never blocking): a single overhead entry above BDT 10,00,000. */
export const LARGE_OVERHEAD_AMOUNT = "1000000.00";
