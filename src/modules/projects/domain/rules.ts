import { d, type Dec } from "@/modules/inventory/domain/decimal";
import { ALERT_THRESHOLDS } from "./types";

export interface MaterialLine {
  issuedQty: string;
  returnedQty: string;
  issuedCost: string;
  returnedCost: string;
}

export interface CostTotals {
  LABOUR: string;
  TRANSPORT: string;
  OTHER: string;
}

/** Project totals (BDT, 2 dp). Percentages have 2 dp; null without a (non-zero) contract value. */
export interface ProjectSummary {
  issuedCost: string;
  returnedCost: string;
  netMaterialCost: string;
  labourCost: string;
  transportCost: string;
  otherCost: string;
  totalCost: string;
  contractValue: string | null;
  margin: string | null;
  marginPercent: string | null;
  costUsedPercent: string | null;
}

const money = (v: Dec) => v.toDecimalPlaces(2).toFixed(2);
const pct = (v: Dec) => v.toDecimalPlaces(2).toFixed(2);

export const netQty = (l: Pick<MaterialLine, "issuedQty" | "returnedQty">) => d(l.issuedQty).minus(d(l.returnedQty)).toFixed(3);
export const netCost = (l: Pick<MaterialLine, "issuedCost" | "returnedCost">) => money(d(l.issuedCost).minus(d(l.returnedCost)));

/**
 * totalCost = net material + labour + transport + other;
 * margin = contract − total; marginPercent = margin ÷ contract × 100; costUsedPercent = total ÷ contract × 100.
 */
export function summarize(material: MaterialLine[], costs: CostTotals, contractValue: string | null): ProjectSummary {
  const issued = material.reduce((s, l) => s.plus(d(l.issuedCost)), d(0));
  const returned = material.reduce((s, l) => s.plus(d(l.returnedCost)), d(0));
  const netMaterial = issued.minus(returned);
  const total = netMaterial.plus(d(costs.LABOUR)).plus(d(costs.TRANSPORT)).plus(d(costs.OTHER));
  const cv = contractValue === null ? null : d(contractValue);
  const hasCv = cv !== null && cv.gt(0);
  const margin = cv === null ? null : cv.minus(total);
  return {
    issuedCost: money(issued),
    returnedCost: money(returned),
    netMaterialCost: money(netMaterial),
    labourCost: money(d(costs.LABOUR)),
    transportCost: money(d(costs.TRANSPORT)),
    otherCost: money(d(costs.OTHER)),
    totalCost: money(total),
    contractValue: cv === null ? null : money(cv),
    margin: margin === null ? null : money(margin),
    marginPercent: hasCv && margin ? pct(margin.div(cv!).times(100)) : null,
    costUsedPercent: hasCv ? pct(total.div(cv!).times(100)) : null,
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

export const zeroCosts = (): CostTotals => ({ LABOUR: "0.00", TRANSPORT: "0.00", OTHER: "0.00" });
