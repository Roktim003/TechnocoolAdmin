import Decimal from "decimal.js";

/**
 * Exact decimal arithmetic for quantities and money. Values cross layer boundaries as
 * strings; JS numbers are never used for stock or money.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;

export const d = (v: string | number | Dec | null | undefined): Dec => new D(v === null || v === undefined || v === "" ? 0 : v);
export const ZERO = d(0);

/** Money: 2 decimals. */
export const money = (v: Dec): Dec => v.toDecimalPlaces(2, D.ROUND_HALF_UP);
/** Unit costs / average cost: 4 decimals. */
export const cost4 = (v: Dec): Dec => v.toDecimalPlaces(4, D.ROUND_HALF_UP);
/** Quantities: 3 decimals. */
export const qty3 = (v: Dec): Dec => v.toDecimalPlaces(3, D.ROUND_HALF_UP);

export const m2 = (v: Dec) => money(v).toFixed(2);
export const c4 = (v: Dec) => cost4(v).toFixed(4);
export const q3 = (v: Dec) => qty3(v).toFixed(3);

export function sum(values: Dec[]): Dec {
  return values.reduce((a, b) => a.plus(b), ZERO);
}
