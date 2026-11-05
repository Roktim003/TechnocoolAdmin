import { canSeeOverheads, type PermissionMap, type SensitiveFlag, type SensitiveFlags } from "./levels";

/**
 * Field names that carry sensitive money data, grouped by the role flag that unlocks them.
 * Matching is by exact key name at any depth of the response. Later modules (catalog,
 * purchasing, projects) must name their fields from these lists — or extend them here —
 * so the API strips them automatically for roles without the flag.
 */
export const SENSITIVE_FIELDS: Record<SensitiveFlag, readonly string[]> = {
  seeCost: [
    "cost",
    "purchaseCost",
    "unitCost",
    "costPrice",
    "purchasePrice",
    "landedCost",
    "averageCost",
    "totalCost",
    "costValue",
    // inventory
    "unitCostBdt",
    "landedUnitCost",
    "costAmount",
    "costTotal",
    "avgCost",
    "avgCostBefore",
    "avgCostAfter",
    "valueChange",
    "stockValue",
    "transitValue",
    "goodsBdt",
    "chargeShare",
    // stock counts, opening import
    "varianceValue",
    "gainValue",
    "lossValue",
    "netValue",
    "totalValue",
    // purchasing (unit prices / totals are also removed by the PO mappers)
    "totalBdt",
    "unitPriceBdt",
    "totalOrderedBdt",
    // projects (cost rows' amounts are also removed by the project mappers)
    "issuedCost",
    "returnedCost",
    "netCost",
    "netMaterialCost",
    "materialCost",
    "labourCost",
    "transportCost",
    "otherCost",
    "costsTotal",
    // reports (columns are also removed by the report engine)
    "orderedValueBdt",
    "receivedValueBdt",
    "importedValueBdt",
    "localValueBdt",
    "unitPriceForeign",
    "priceChangePercent",
    "pendingValue",
    "valueAge0to30",
    "valueAge31to90",
    "valueAge91to180",
    "valueAge180plus",
    "salesCost",
    "netCostValue",
    // import documents: Commercial Invoice value
    "ciValue",
    "landedCostTotal",
  ],
  seeProfit: ["profit", "grossProfit", "netProfit", "profitAmount", "profitPercent"],
  seeMargin: ["margin", "marginPercent", "marginAmount", "contractValue", "costUsedPercent"],
};

/**
 * Overhead figures (store charge, holding, established cost and what is built on them). They need
 * overheads ≥ VIEW and seeCost. When the caller passes the user's permissions (the API route
 * wrapper always passes the principal) they're stripped for everyone without that access — a
 * safety net behind the mappers, which leave them out already. Never reuse these names for other data.
 */
export const OVERHEAD_FIELDS: readonly string[] = [
  "storeChargeCost",
  "holdingCost",
  "establishmentCost",
  "overheadCost",
  "fullCost",
  "directMargin",
  "directMarginPercent",
  "directCostUsedPercent",
  "overheadsThisMonth",
  "overheadsNotCharged",
  "overheadPercentOfDirect",
];

function hiddenKeys(flags: SensitiveFlags, overheads = true): Set<string> {
  const hidden = new Set<string>();
  for (const flag of Object.keys(SENSITIVE_FIELDS) as SensitiveFlag[]) {
    if (!flags[flag]) for (const key of SENSITIVE_FIELDS[flag]) hidden.add(key);
  }
  if (!overheads) for (const key of OVERHEAD_FIELDS) hidden.add(key);
  return hidden;
}

function strip(value: unknown, hidden: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((v) => strip(v, hidden));
  if (value instanceof Date || value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (!hidden.has(k)) out[k] = strip(v, hidden);
  }
  return out;
}

/**
 * Returns a deep copy of `dto` without the cost / profit / margin fields the user may not see.
 * Applied by the route wrapper to every authenticated response, and callable directly.
 */
export function filterSensitiveFields<T>(dto: T, user: { flags: SensitiveFlags; permissions?: Partial<PermissionMap> }): T {
  const hidden = hiddenKeys(user.flags, !user.permissions || canSeeOverheads({ permissions: user.permissions, flags: user.flags }));
  if (hidden.size === 0) return dto;
  return strip(dto, hidden) as T;
}
