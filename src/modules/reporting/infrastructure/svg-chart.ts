import { CHART_AXIS, CHART_GRID, niceScale, seriesColor, shortNumber } from "@/shared/charts/palette";
import type { ChartData } from "../domain/types";

/** Static SVG for PDFs (the screen uses the interactive React charts in src/components/charts). */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (v: string | number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const W = 720;
const H = 240;

function legend(names: string[], y: number): string {
  let x = 0;
  return names
    .map((n, i) => {
      const out = `<rect x="${x}" y="${y}" width="10" height="10" fill="${seriesColor(i)}"/><text x="${x + 14}" y="${y + 9}" font-size="9" fill="${CHART_AXIS}">${esc(clip(n, 28))}</text>`;
      x += 24 + Math.min(n.length, 28) * 5.5;
      return out;
    })
    .join("");
}

function verticalChart(c: ChartData): string {
  const series = c.series ?? [c.title];
  const stacked = c.type === "stacked";
  const left = 56;
  const top = 10;
  const bottom = 40 + (series.length > 1 ? 18 : 0);
  const plotW = W - left - 10;
  const plotH = H - top - bottom;
  const max = Math.max(0, ...c.points.map((p) => (stacked ? p.values.reduce<number>((a, v) => a + Math.max(0, num(v)), 0) : Math.max(...p.values.map(num)))));
  const scale = niceScale(max);
  const y = (v: number) => top + plotH - (v / scale.max) * plotH;
  const parts: string[] = [];
  for (let t = 0; t <= scale.max + 1e-9; t += scale.step) {
    parts.push(`<line x1="${left}" x2="${W - 10}" y1="${y(t)}" y2="${y(t)}" stroke="${CHART_GRID}"/>`);
    parts.push(`<text x="${left - 6}" y="${y(t) + 3}" font-size="9" text-anchor="end" fill="${CHART_AXIS}">${shortNumber(t)}</text>`);
  }
  const n = Math.max(1, c.points.length);
  const band = plotW / n;
  const every = Math.ceil(n / 15);
  c.points.forEach((p, i) => {
    const cx = left + band * i + band / 2;
    if (i % every === 0) parts.push(`<text x="${cx}" y="${top + plotH + 14}" font-size="8.5" text-anchor="middle" fill="${CHART_AXIS}">${esc(clip(p.label, 14))}</text>`);
  });
  if (c.type === "line") {
    series.forEach((_, s) => {
      const pts = c.points.map((p, i) => `${left + band * i + band / 2},${y(Math.max(0, num(p.values[s] ?? 0)))}`).join(" ");
      parts.push(`<polyline points="${pts}" fill="none" stroke="${seriesColor(s)}" stroke-width="2"/>`);
    });
  } else {
    const barW = Math.max(2, band * 0.7);
    c.points.forEach((p, i) => {
      const x0 = left + band * i + (band - barW) / 2;
      if (stacked) {
        let acc = 0;
        series.forEach((_, s) => {
          const v = Math.max(0, num(p.values[s] ?? 0));
          parts.push(`<rect x="${x0}" y="${y(acc + v)}" width="${barW}" height="${y(acc) - y(acc + v)}" fill="${seriesColor(s)}"/>`);
          acc += v;
        });
      } else {
        const w = barW / series.length;
        series.forEach((_, s) => {
          const v = Math.max(0, num(p.values[s] ?? 0));
          parts.push(`<rect x="${x0 + w * s}" y="${y(v)}" width="${w}" height="${top + plotH - y(v)}" fill="${seriesColor(s)}"/>`);
        });
      }
    });
  }
  parts.push(`<line x1="${left}" x2="${W - 10}" y1="${top + plotH}" y2="${top + plotH}" stroke="${CHART_AXIS}"/>`);
  if (series.length > 1) parts.push(`<g transform="translate(${left},${H - 14})">${legend(series, 0)}</g>`);
  return parts.join("");
}

function hbarChart(c: ChartData): string {
  const points = c.points.slice(0, 12);
  const left = 170;
  const rowH = Math.min(22, (H - 30) / Math.max(1, points.length));
  const plotW = W - left - 60;
  const scale = niceScale(Math.max(0, ...points.map((p) => num(p.values[0] ?? 0))));
  const parts: string[] = [];
  for (let t = 0; t <= scale.max + 1e-9; t += scale.step) {
    const x = left + (t / scale.max) * plotW;
    parts.push(`<line x1="${x}" x2="${x}" y1="0" y2="${rowH * points.length}" stroke="${CHART_GRID}"/>`);
    parts.push(`<text x="${x}" y="${rowH * points.length + 12}" font-size="9" text-anchor="middle" fill="${CHART_AXIS}">${shortNumber(t)}</text>`);
  }
  points.forEach((p, i) => {
    const v = Math.max(0, num(p.values[0] ?? 0));
    const w = (v / scale.max) * plotW;
    parts.push(`<text x="${left - 6}" y="${i * rowH + rowH / 2 + 3}" font-size="9" text-anchor="end" fill="${CHART_AXIS}">${esc(clip(p.label, 30))}</text>`);
    parts.push(`<rect x="${left}" y="${i * rowH + rowH * 0.15}" width="${w}" height="${rowH * 0.7}" fill="${seriesColor(0)}"/>`);
    parts.push(`<text x="${left + w + 4}" y="${i * rowH + rowH / 2 + 3}" font-size="8.5" fill="${CHART_AXIS}">${shortNumber(v)}</text>`);
  });
  return parts.join("");
}

function donutChart(c: ChartData): string {
  const values = c.points.map((p) => Math.max(0, num(p.values[0] ?? 0)));
  const sum = values.reduce((a, v) => a + v, 0);
  const cx = 110;
  const cy = H / 2;
  const r = 90;
  const ir = 55;
  const parts: string[] = [];
  let a0 = -Math.PI / 2;
  values.forEach((v, i) => {
    if (!(v > 0)) return;
    const frac = v / sum;
    if (frac >= 0.9999) {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${(r + ir) / 2}" fill="none" stroke="${seriesColor(i)}" stroke-width="${r - ir}"/>`);
      return;
    }
    const a1 = a0 + frac * 2 * Math.PI;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad: number, a: number) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
    parts.push(`<path d="M${p(r, a0)} A${r},${r} 0 ${large} 1 ${p(r, a1)} L${p(ir, a1)} A${ir},${ir} 0 ${large} 0 ${p(ir, a0)} Z" fill="${seriesColor(i)}"/>`);
    a0 = a1;
  });
  parts.push(`<text x="${cx}" y="${cy + 4}" font-size="12" font-weight="600" text-anchor="middle" fill="#161616">${shortNumber(sum)}</text>`);
  c.points.forEach((pt, i) => {
    const yy = 20 + i * 18;
    const pct = sum > 0 ? ((values[i]! / sum) * 100).toFixed(1) : "0.0";
    parts.push(`<rect x="250" y="${yy - 9}" width="10" height="10" fill="${seriesColor(i)}"/><text x="266" y="${yy}" font-size="10" fill="#161616">${esc(clip(pt.label, 40))} — ${shortNumber(values[i]!)} (${pct}%)</text>`);
  });
  return parts.join("");
}

/** The chart as an inline SVG string ("" when there is nothing to draw). */
export function chartSvg(c: ChartData | null): string {
  if (!c) return "";
  const empty = c.points.length === 0 || c.points.every((p) => p.values.every((v) => num(v) === 0));
  const body = empty
    ? `<text x="${W / 2}" y="${H / 2}" font-size="11" text-anchor="middle" fill="${CHART_AXIS}">No data for these filters</text>`
    : c.type === "hbar"
      ? hbarChart(c)
      : c.type === "donut"
        ? donutChart(c)
        : verticalChart(c);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(c.title)}" font-family="IBM Plex Sans, Segoe UI, Arial, sans-serif">${body}</svg>`;
}
