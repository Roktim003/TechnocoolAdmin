import { cost4, d, money, ZERO, type Dec } from "./decimal";
import type { ProductCostState } from "./types";

/** Working copy of a product's company-wide cost position. */
export interface CostState {
  totalQty: Dec;
  totalValue: Dec;
  avgCost: Dec;
}

export const toCostState = (s: ProductCostState | undefined | null): CostState =>
  s ? { totalQty: d(s.totalQty), totalValue: d(s.totalValue), avgCost: d(s.avgCost) } : { totalQty: ZERO, totalValue: ZERO, avgCost: ZERO };

export const fromCostState = (s: CostState): ProductCostState => ({ totalQty: s.totalQty.toFixed(3), totalValue: s.totalValue.toFixed(2), avgCost: s.avgCost.toFixed(4) });

/**
 * Weighted average after a receipt. Division by zero is impossible here (qty > 0), and when
 * stock reaches zero the last average is kept so later returns still have a cost.
 */
export function applyIn(s: CostState, qty: Dec, value: Dec): CostState {
  const totalQty = s.totalQty.plus(qty);
  const totalValue = s.totalValue.plus(value);
  if (totalQty.lte(0)) return { totalQty: ZERO, totalValue: ZERO, avgCost: s.avgCost };
  return { totalQty, totalValue, avgCost: cost4(totalValue.div(totalQty)) };
}

/**
 * Removes `qty` at the current average. Taking the last units takes exactly the remaining
 * value, so no rounding residue is ever left on zero stock.
 */
export function applyOut(s: CostState, qty: Dec): { state: CostState; value: Dec } {
  if (qty.gte(s.totalQty)) {
    return { state: { totalQty: s.totalQty.minus(qty), totalValue: ZERO, avgCost: s.avgCost }, value: s.totalValue };
  }
  const value = money(qty.times(s.avgCost));
  const totalQty = s.totalQty.minus(qty);
  const totalValue = s.totalValue.minus(value);
  return { state: { totalQty, totalValue, avgCost: cost4(totalValue.div(totalQty)) }, value };
}

/** Removes an exact (qty, value) pair, used by reversals of receipts. */
export function applyExactOut(s: CostState, qty: Dec, value: Dec): { state: CostState; value: Dec } {
  const totalQty = s.totalQty.minus(qty);
  if (totalQty.lte(0)) return { state: { totalQty, totalValue: ZERO, avgCost: s.avgCost }, value: s.totalValue };
  const totalValue = s.totalValue.minus(value);
  return { state: { totalQty, totalValue, avgCost: cost4(totalValue.div(totalQty)) }, value };
}
