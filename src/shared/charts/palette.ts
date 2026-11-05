/**
 * Categorical chart palette, built from Gr8r Studio hues and re-ordered with the dataviz validator
 * (light surface #ffffff): lightness band, chroma floor, adjacent CVD ΔE ≥ 13 and normal-vision ΔE ≥ 23 all pass.
 * Slot 5 (orange) is under 3:1 on white, so charts always keep a table view and text labels.
 * Assign in this order, never cycled past 8.
 */
export const CHART_PALETTE = ["#4b5bd6", "#8f620a", "#4b97e0", "#b8336e", "#e5893b", "#2f7a4f", "#9d6fe0", "#13917f"] as const;
export const CHART_AXIS = "#6b6760";
export const CHART_GRID = "#f0eeea";

export const seriesColor = (i: number) => CHART_PALETTE[i % CHART_PALETTE.length]!;

/** "Nice" axis maximum and tick step for 0…max. */
export function niceScale(max: number, ticks = 4): { max: number; step: number } {
  if (!(max > 0)) return { max: 1, step: 0.25 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  return { max: step * Math.ceil(max / step), step };
}

/** Short axis numbers: 1.2K, 3.4L (lakh), 1.1Cr (crore) — Bangladeshi units. */
export function shortNumber(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e7) return `${+(v / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${+(v / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${+(v / 1e3).toFixed(1)}K`;
  return `${+v.toFixed(2)}`;
}
