import { d, type Dec } from "@/modules/inventory/domain/decimal";
import { ALERT_THRESHOLDS, COST_CATEGORIES, OVERHEAD_WARN_PERCENT_OF_DIRECT, OVERHEAD_WARN_SINGLE_AMOUNT, type CostCategory } from "./types";

export interface MaterialLine {
  issuedQty: string;
  returnedQty: string;
  issuedCost: string;
  returnedCost: string;
}

/** Non-voided cost totals per category (BDT, 2 dp). */
export type CostTotals = Record<CostCategory, string>;

/**
 * Project totals (BDT, 2 dp). Percentages have 2 dp; null without a (non-zero) contract value.
 *
 * - directCost = net material + labour + transport + other (`totalCost` is the same figure, kept
 *   for existing clients)
 * - overheadCost = store charge + holding + established; fullCost = directCost + overheadCost
 * - margin / marginPercent / costUsedPercent are based on fullCost; directMargin /
 *   directMarginPercent / directCostUsedPercent on directCost.
 *
 * Viewers without overhead access get the direct figures under the plain names (see
 * `summaryFor` in the projects mappers).
 */
export interface ProjectSummary {
  issuedCost: string;
  returnedCost: string;
  netMaterialCost: string;
  labourCost: string;
  transportCost: string;
  otherCost: string;
  totalCost: string;
  directCost: string;
  storeChargeCost: string;
  holdingCost: string;
  establishmentCost: string;
  overheadCost: string;
  fullCost: string;
  contractValue: string | null;
  margin: string | null;
  marginPercent: string | null;
  costUsedPercent: string | null;
  directMargin: string | null;
  directMarginPercent: string | null;
  directCostUsedPercent: string | null;
}

const money = (v: Dec) => v.toDecimalPlaces(2).toFixed(2);
const pct = (v: Dec) => v.toDecimalPlaces(2).toFixed(2);

export const netQty = (l: Pick<MaterialLine, "issuedQty" | "returnedQty">) => d(l.issuedQty).minus(d(l.returnedQty)).toFixed(3);
export const netCost = (l: Pick<MaterialLine, "issuedCost" | "returnedCost">) => money(d(l.issuedCost).minus(d(l.returnedCost)));

/** margin = contract − cost; marginPercent = margin ÷ contract × 100; costUsedPercent = cost ÷ contract × 100. */
function marginOf(cost: Dec, cv: Dec | null) {
  const hasCv = cv !== null && cv.gt(0);
  const margin = cv === null ? null : cv.minus(cost);
  return {
    margin: margin === null ? null : money(margin),
    marginPercent: hasCv && margin ? pct(margin.div(cv!).times(100)) : null,
    costUsedPercent: hasCv ? pct(cost.div(cv!).times(100)) : null,
  };
}

export function summarize(material: MaterialLine[], costs: CostTotals, contractValue: string | null): ProjectSummary {
  const issued = material.reduce((s, l) => s.plus(d(l.issuedCost)), d(0));
  const returned = material.reduce((s, l) => s.plus(d(l.returnedCost)), d(0));
  const netMaterial = issued.minus(returned);
  const direct = netMaterial.plus(d(costs.LABOUR)).plus(d(costs.TRANSPORT)).plus(d(costs.OTHER));
  const overhead = d(costs.STORE_CHARGE).plus(d(costs.HOLDING)).plus(d(costs.ESTABLISHMENT));
  const full = direct.plus(overhead);
  const cv = contractValue === null ? null : d(contractValue);
  const onFull = marginOf(full, cv);
  const onDirect = marginOf(direct, cv);
  return {
    issuedCost: money(issued),
    returnedCost: money(returned),
    netMaterialCost: money(netMaterial),
    labourCost: money(d(costs.LABOUR)),
    transportCost: money(d(costs.TRANSPORT)),
    otherCost: money(d(costs.OTHER)),
    totalCost: money(direct),
    directCost: money(direct),
    storeChargeCost: money(d(costs.STORE_CHARGE)),
    holdingCost: money(d(costs.HOLDING)),
    establishmentCost: money(d(costs.ESTABLISHMENT)),
    overheadCost: money(overhead),
    fullCost: money(full),
    contractValue: cv === null ? null : money(cv),
    margin: onFull.margin,
    marginPercent: onFull.marginPercent,
    costUsedPercent: onFull.costUsedPercent,
    directMargin: onDirect.margin,
    directMarginPercent: onDirect.marginPercent,
    directCostUsedPercent: onDirect.costUsedPercent,
  };
}

/** The highest alert threshold reached (0 when below 90 % or without a contract value). */
export function alertLevel(costUsedPercent: string | null): 0 | 90 | 100 {
  if (costUsedPercent === null) return 0;
  const p = d(costUsedPercent);
  let level: 0 | 90 | 100 = 0;
  for (const t of ALERT_THRESHOLDS) if (p.gte(t)) level = t;
  return level;
}

export const zeroCosts = (): CostTotals => Object.fromEntries(COST_CATEGORIES.map((c) => [c, "0.00"])) as CostTotals;

/** Non-blocking overhead warnings for a project after an overhead change. */
export function overheadWarnings(amount: string | null, s: Pick<ProjectSummary, "directCost" | "overheadCost">): { code: string; message: string }[] {
  const out: { code: string; message: string }[] = [];
  if (amount !== null && d(amount).gt(d(OVERHEAD_WARN_SINGLE_AMOUNT))) out.push({ code: "OVERHEAD_LARGE_AMOUNT", message: "This overhead entry is above BDT 10,00,000. Check the amount." });
  const direct = d(s.directCost);
  if (d(s.overheadCost).gt(0) && (direct.isZero() || d(s.overheadCost).div(direct).times(100).gt(OVERHEAD_WARN_PERCENT_OF_DIRECT))) {
    out.push({ code: "OVERHEAD_ABOVE_30_PERCENT", message: `The project's overheads are above ${OVERHEAD_WARN_PERCENT_OF_DIRECT}% of its direct cost.` });
  }
  return out;
}
