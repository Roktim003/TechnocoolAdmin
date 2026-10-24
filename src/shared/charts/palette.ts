/** Carbon data-visualisation palette (categorical, in this order) and chart chrome colours. */
export const CHART_PALETTE = ["#6929c4", "#1192e8", "#005d5d", "#9f1853", "#fa4d56", "#570408", "#198038", "#002d9c"] as const;
export const CHART_AXIS = "#525252";
export const CHART_GRID = "#e0e0e0";

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
