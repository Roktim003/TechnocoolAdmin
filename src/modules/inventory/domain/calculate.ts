import { applyIn, applyOut, toCostState, type CostState } from "./cost";
import { cost4, d, money, sum, ZERO, type Dec } from "./decimal";
import type { AdjustDirection, ChargeMode, ChargeType, Condition, EntryType, ProductCostState } from "./types";

export interface CalcLineInput {
  productId: string;
  qty: string;
  /** Foreign cost (imports), BDT cost (local/opening), selling price (sales). Ignored for AUTO types. */
  unitPrice: string;
  condition: Condition;
  /** Returns from site: unit cost of the linked issue line, if any. */
  originalUnitCost?: string | null;
  /** Stock adjustments: GAIN or LOSS. */
  direction?: AdjustDirection | null;
}

export interface CalcChargeInput {
  type: ChargeType;
  mode: ChargeMode;
  value: string;
  includeInCost: boolean;
}

export interface CalcInput {
  type: EntryType;
  lines: CalcLineInput[];
  charges: CalcChargeInput[];
  exchangeRate: string;
  discountAmount: string;
  vatPercent: string;
  /** Current company-wide cost per product (missing = never stocked). */
  costs: Map<string, ProductCostState>;
}

export interface CalcLine {
  unitCostBdt: string;
  landedUnitCost: string | null;
  amount: string;
  costAmount: string;
  /** Imports: BDT goods value and this line's share of included charges. */
  goodsBdt: string | null;
  chargeShare: string | null;
  /** Average cost before this entry (used for the below-cost check). */
  avgCostBefore: string;
  belowCost: boolean;
}

export interface CalcResult {
  lines: CalcLine[];
  charges: { amountBdt: string }[];
  totals: {
    goodsTotal: string;
    chargesIncluded: string;
    chargesExcluded: string;
    subtotal: string;
    discountAmount: string;
    netAmount: string;
    vatPercent: string;
    vatAmount: string;
    grandTotal: string;
    costTotal: string;
    profit: string | null;
  };
  /** Product cost positions after posting (OUT/IN types); unchanged for transfers. */
  costsAfter: Map<string, CostState>;
}

/** Splits `total` across `weights` proportionally; the last share takes the rounding remainder. */
export function allocate(total: Dec, weights: Dec[]): Dec[] {
  const weightSum = sum(weights);
  const basis = weightSum.isZero() ? weights.map(() => d(1)) : weights;
  const basisSum = weightSum.isZero() ? d(weights.length) : weightSum;
  const shares = basis.map((w) => money(total.times(w).div(basisSum)));
  if (shares.length) shares[shares.length - 1] = total.minus(sum(shares.slice(0, -1)));
  return shares;
}

/**
 * Computes line costs and entry totals. This single function is used by the calculate
 * endpoint (preview) and by the posting engine (with costs read under lock), so both agree.
 */
export function computeEntry(input: CalcInput): CalcResult {
  const { type } = input;
  const working = new Map<string, CostState>();
  const state = (productId: string) => working.get(productId) ?? toCostState(input.costs.get(productId));

  const qtys = input.lines.map((l) => d(l.qty));
  const prices = input.lines.map((l) => d(l.unitPrice));

  // Imports: goods value in BDT, then charges.
  const rate = d(input.exchangeRate);
  const goods = type === "GRN_IMPORT" ? input.lines.map((_, i) => money(qtys[i]!.times(prices[i]!).times(rate))) : [];
  const goodsTotal = sum(goods);
  const chargeAmounts = type === "GRN_IMPORT" ? input.charges.map((c) => (c.mode === "PERCENT_OF_GOODS" ? money(goodsTotal.times(d(c.value)).div(100)) : money(d(c.value)))) : input.charges.map(() => ZERO);
  const included = sum(chargeAmounts.filter((_, i) => input.charges[i]!.includeInCost));
  const excluded = sum(chargeAmounts.filter((_, i) => !input.charges[i]!.includeInCost));
  const shares = type === "GRN_IMPORT" ? allocate(included, goods) : [];

  const lines: CalcLine[] = input.lines.map((l, i) => {
    const qty = qtys[i]!;
    const price = prices[i]!;
    const before = state(l.productId);
    let unitCost = ZERO;
    let costAmount = ZERO;
    let landed: Dec | null = null;

    switch (type) {
      case "GRN_IMPORT": {
        costAmount = goods[i]!.plus(shares[i]!);
        landed = cost4(costAmount.div(qty));
        unitCost = landed;
        working.set(l.productId, applyIn(before, qty, costAmount));
        break;
      }
      case "GRN_LOCAL":
      case "OPENING": {
        unitCost = cost4(price);
        costAmount = money(qty.times(price));
        working.set(l.productId, applyIn(before, qty, costAmount));
        break;
      }
      case "RETURN_FROM_SITE": {
        unitCost = cost4(l.originalUnitCost ? d(l.originalUnitCost) : before.avgCost);
        costAmount = money(qty.times(unitCost));
        working.set(l.productId, applyIn(before, qty, costAmount));
        break;
      }
      case "ISSUE_TO_PROJECT":
      case "SALE":
      case "RETURN_TO_SUPPLIER":
      case "DAMAGE_WRITE_OFF": {
        const out = applyOut(before, qty);
        costAmount = out.value;
        unitCost = before.avgCost;
        working.set(l.productId, out.state);
        break;
      }
      case "STOCK_ADJUSTMENT": {
        // Gains are valued at the current average cost; losses leave at it (exact on the last units).
        unitCost = before.avgCost;
        if (l.direction === "GAIN") {
          costAmount = money(qty.times(unitCost));
          working.set(l.productId, applyIn(before, qty, costAmount));
        } else {
          const out = applyOut(before, qty);
          costAmount = out.value;
          working.set(l.productId, out.state);
        }
        break;
      }
      case "TRANSFER": {
        // Company stock is unchanged: value simply moves between warehouses.
        unitCost = before.avgCost;
        costAmount = money(qty.times(unitCost));
        break;
      }
      case "REVERSAL":
        throw new Error("Reversals are computed from the original movements.");
    }

    const amount = type === "SALE" ? money(qty.times(price)) : type === "GRN_IMPORT" ? goods[i]! : costAmount;
    return {
      unitCostBdt: cost4(unitCost).toFixed(4),
      landedUnitCost: landed ? landed.toFixed(4) : null,
      amount: money(amount).toFixed(2),
      costAmount: money(costAmount).toFixed(2),
      goodsBdt: type === "GRN_IMPORT" ? goods[i]!.toFixed(2) : null,
      chargeShare: type === "GRN_IMPORT" ? money(shares[i]!).toFixed(2) : null,
      avgCostBefore: before.avgCost.toFixed(4),
      belowCost: type === "SALE" && price.lt(before.avgCost),
    };
  });

  const subtotal = type === "GRN_IMPORT" ? goodsTotal : sum(lines.map((l) => d(l.amount)));
  const discount = type === "SALE" ? money(d(input.discountAmount)) : ZERO;
  const net = subtotal.minus(discount);
  const vatPercent = type === "SALE" ? d(input.vatPercent) : ZERO;
  const vat = type === "SALE" ? money(net.times(vatPercent).div(100)) : ZERO;
  const grand = type === "SALE" ? net.plus(vat) : type === "GRN_IMPORT" ? goodsTotal.plus(included).plus(excluded) : subtotal;
  const costTotal = sum(lines.map((l) => d(l.costAmount)));

  return {
    lines,
    charges: chargeAmounts.map((a) => ({ amountBdt: a.toFixed(2) })),
    totals: {
      goodsTotal: goodsTotal.toFixed(2),
      chargesIncluded: included.toFixed(2),
      chargesExcluded: excluded.toFixed(2),
      subtotal: money(subtotal).toFixed(2),
      discountAmount: discount.toFixed(2),
      netAmount: money(net).toFixed(2),
      vatPercent: vatPercent.toFixed(2),
      vatAmount: vat.toFixed(2),
      grandTotal: money(grand).toFixed(2),
      costTotal: money(costTotal).toFixed(2),
      profit: type === "SALE" ? money(net.minus(costTotal)).toFixed(2) : null,
    },
    costsAfter: working,
  };
}
