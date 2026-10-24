"use client";

import { useId, useState, type MouseEvent, type ReactNode } from "react";
import { niceScale, seriesColor, shortNumber } from "@/shared/charts/palette";
import styles from "./Chart.module.css";

/**
 * In-house SVG charts (bar, hbar, line, stacked, donut) in the Carbon palette: a title, a hover
 * tooltip, a "view as table" toggle and an empty state. Values arrive as decimal strings.
 */
export type ChartKind = "bar" | "hbar" | "line" | "stacked" | "donut";

export interface ChartInput {
  type: ChartKind;
  title: string;
  valueType: "money" | "number";
  series?: string[];
  points: { label: string; values: (string | number)[] }[];
}

const W = 640;
const H = 260;
const num = (v: string | number | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const money = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Axis label: "2026-10-24" → "24 Oct"; anything else clipped. */
const axisLabel = (s: string, n: number) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]}` : clip(s, n));

interface Tip {
  x: number;
  y: number;
  title: string;
  rows: { name: string; value: string; color: string }[];
}

export function Chart({ chart, footer }: { chart: ChartInput; footer?: ReactNode }) {
  const id = useId();
  const [asTable, setAsTable] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);
  const series = chart.series?.length ? chart.series : [chart.title];
  const fmt = (v: string | number) => (chart.valueType === "money" ? `৳ ${money.format(num(v))}` : qty.format(num(v)));
  const empty = chart.points.length === 0 || chart.points.every((p) => p.values.every((v) => num(v) === 0));

  const show = (e: MouseEvent, title: string, idx: number[] | null, pointIndex: number) => {
    const box = (e.currentTarget as Element).closest("figure")!.getBoundingClientRect();
    const p = chart.points[pointIndex]!;
    const rows = (idx ?? series.map((_, i) => i)).map((i) => ({ name: series[i] ?? chart.title, value: fmt(p.values[i] ?? 0), color: seriesColor(i) }));
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, title, rows });
  };

  return (
    <figure className={styles.chart} aria-labelledby={`${id}-t`} onMouseLeave={() => setTip(null)}>
      <figcaption className={styles.head}>
        <h3 id={`${id}-t`} className={styles.title}>
          {chart.title}
        </h3>
        {!empty ? (
          <button type="button" className={styles.toggle} onClick={() => setAsTable((t) => !t)} aria-pressed={asTable}>
            {asTable ? "View as chart" : "View as table"}
          </button>
        ) : null}
      </figcaption>

      {empty ? (
        <div className={styles.empty}>No data for this period.</div>
      ) : asTable ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Label</th>
                {series.map((s) => (
                  <th key={s} scope="col" className={styles.num}>
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chart.points.map((p) => (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  {series.map((s, i) => (
                    <td key={s} className={styles.num}>
                      {fmt(p.values[i] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {series.length > 1 || chart.type === "donut" ? <Legend names={chart.type === "donut" ? chart.points.map((p) => p.label) : series} /> : null}
          <svg viewBox={`0 0 ${W} ${chart.type === "hbar" ? Math.min(H, 24 * Math.min(12, chart.points.length) + 24) : H}`} className={styles.svg} role="img" aria-label={`${chart.title} (use “View as table” for the values)`}>
            {chart.type === "hbar" ? <HBars chart={chart} onHover={show} /> : chart.type === "donut" ? <Donut chart={chart} onHover={show} fmt={fmt} /> : <Vertical chart={chart} series={series} onHover={show} />}
          </svg>
          {tip ? (
            <div className={styles.tooltip} style={{ left: Math.min(tip.x + 12, 9999), top: tip.y + 12 }} role="presentation">
              <p className={styles.tipTitle}>{tip.title}</p>
              {tip.rows.map((r) => (
                <p key={r.name} className={styles.tipRow}>
                  <span className={styles.swatch} style={{ background: r.color }} />
                  <span>{r.name}</span>
                  <strong>{r.value}</strong>
                </p>
              ))}
            </div>
          ) : null}
        </>
      )}
      {footer}
    </figure>
  );
}

function Legend({ names }: { names: string[] }) {
  return (
    <ul className={styles.legend}>
      {names.map((n, i) => (
        <li key={`${n}-${i}`}>
          <span className={styles.swatch} style={{ background: seriesColor(i) }} />
          {n}
        </li>
      ))}
    </ul>
  );
}

type Hover = (e: MouseEvent, title: string, idx: number[] | null, pointIndex: number) => void;

/** A column with a 4px rounded data-end and a square baseline. */
function column(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return "";
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

function Vertical({ chart, series, onHover }: { chart: ChartInput; series: string[]; onHover: Hover }) {
  const stacked = chart.type === "stacked";
  const left = 52;
  const top = 8;
  const bottom = 28;
  const plotW = W - left - 8;
  const plotH = H - top - bottom;
  const totals = chart.points.map((p) => (stacked ? p.values.reduce<number>((a, v) => a + Math.max(0, num(v)), 0) : Math.max(0, ...p.values.map(num))));
  const scale = niceScale(Math.max(0, ...totals));
  const y = (v: number) => top + plotH - (v / scale.max) * plotH;
  const n = Math.max(1, chart.points.length);
  const band = plotW / n;
  const every = Math.ceil(n / 8);
  const ticks: number[] = [];
  for (let t = 0; t <= scale.max + 1e-9; t += scale.step) ticks.push(t);

  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={W - 8} y1={y(t)} y2={y(t)} className={styles.grid} />
          <text x={left - 6} y={y(t) + 4} textAnchor="end" className={styles.axisText}>
            {shortNumber(t)}
          </text>
        </g>
      ))}
      {chart.points.map((p, i) =>
        i % every === 0 ? (
          <text key={`l${i}`} x={left + band * i + band / 2} y={H - 10} textAnchor="middle" className={styles.axisText}>
            {axisLabel(p.label, 12)}
          </text>
        ) : null,
      )}
      {chart.type === "line"
        ? series.map((_, s) => (
            <polyline
              key={s}
              fill="none"
              stroke={seriesColor(s)}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={chart.points.map((p, i) => `${left + band * i + band / 2},${y(Math.max(0, num(p.values[s])))}`).join(" ")}
            />
          ))
        : chart.points.map((p, i) => {
            const barW = Math.min(24, band * 0.7);
            const x0 = left + band * i + (band - barW) / 2;
            if (stacked) {
              let acc = 0;
              return (
                <g key={i}>
                  {series.map((_, s) => {
                    const v = Math.max(0, num(p.values[s]));
                    const y1 = y(acc + v);
                    const h = y(acc) - y1 - (acc > 0 ? 2 : 0); // 2px surface gap between segments
                    acc += v;
                    return h > 0 ? <path key={s} d={s === series.length - 1 || series.slice(s + 1).every((_, k) => !num(p.values[s + 1 + k])) ? column(x0, y1, barW, h) : `M${x0},${y1} h${barW} v${h} h${-barW} Z`} fill={seriesColor(s)} /> : null;
                  })}
                </g>
              );
            }
            const w = barW / series.length;
            return (
              <g key={i}>
                {series.map((_, s) => {
                  const v = Math.max(0, num(p.values[s]));
                  return <path key={s} d={column(x0 + w * s + (s ? 1 : 0), y(v), w - (series.length > 1 ? 2 : 0), top + plotH - y(v))} fill={seriesColor(s)} />;
                })}
              </g>
            );
          })}
      {chart.type === "line"
        ? chart.points.map((p, i) =>
            series.map((_, s) => <circle key={`${i}-${s}`} cx={left + band * i + band / 2} cy={y(Math.max(0, num(p.values[s])))} r={chart.points.length > 31 ? 0 : 3} fill={seriesColor(s)} stroke="var(--color-surface)" strokeWidth={2} />),
          )
        : null}
      <line x1={left} x2={W - 8} y1={top + plotH} y2={top + plotH} className={styles.axis} />
      {/* Hover targets: the whole band, larger than the marks. */}
      {chart.points.map((p, i) => (
        <rect key={`h${i}`} x={left + band * i} y={top} width={band} height={plotH} fill="transparent" onMouseMove={(e) => onHover(e, p.label, null, i)} />
      ))}
    </g>
  );
}

function HBars({ chart, onHover }: { chart: ChartInput; onHover: Hover }) {
  const points = chart.points.slice(0, 12);
  const left = 180;
  const rowH = Math.min(24, (H - 24) / Math.max(1, points.length));
  const plotW = W - left - 64;
  const scale = niceScale(Math.max(0, ...points.map((p) => num(p.values[0]))));
  const ticks: number[] = [];
  for (let t = 0; t <= scale.max + 1e-9; t += scale.step) ticks.push(t);
  const bottom = rowH * points.length;
  return (
    <g>
      {ticks.map((t) => {
        const x = left + (t / scale.max) * plotW;
        return (
          <g key={t}>
            <line x1={x} x2={x} y1={0} y2={bottom} className={styles.grid} />
            <text x={x} y={bottom + 14} textAnchor="middle" className={styles.axisText}>
              {shortNumber(t)}
            </text>
          </g>
        );
      })}
      {points.map((p, i) => {
        const v = Math.max(0, num(p.values[0]));
        const w = (v / scale.max) * plotW;
        const h = Math.min(16, rowH - 4);
        const yy = i * rowH + (rowH - h) / 2;
        return (
          <g key={i} onMouseMove={(e) => onHover(e, p.label, [0], i)}>
            <rect x={0} y={i * rowH} width={W} height={rowH} fill="transparent" />
            <text x={left - 8} y={yy + h / 2 + 4} textAnchor="end" className={styles.labelText}>
              {clip(p.label, 28)}
            </text>
            {w > 0 ? <path d={`M${left},${yy} H${left + w - Math.min(4, w)} Q${left + w},${yy} ${left + w},${yy + Math.min(4, h / 2)} V${yy + h - Math.min(4, h / 2)} Q${left + w},${yy + h} ${left + w - Math.min(4, w)},${yy + h} H${left} Z`} fill={seriesColor(0)} /> : null}
            <text x={left + w + 6} y={yy + h / 2 + 4} className={styles.axisText}>
              {shortNumber(v)}
            </text>
          </g>
        );
      })}
      <line x1={left} x2={left} y1={0} y2={bottom} className={styles.axis} />
    </g>
  );
}

function Donut({ chart, onHover, fmt }: { chart: ChartInput; onHover: Hover; fmt: (v: string | number) => string }) {
  const values = chart.points.map((p) => Math.max(0, num(p.values[0])));
  const sum = values.reduce((a, v) => a + v, 0);
  const cx = W / 2;
  const cy = H / 2;
  const r = 110;
  const ir = 70;
  let a0 = -Math.PI / 2;
  const pt = (rad: number, a: number) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
  return (
    <g>
      {values.map((v, i) => {
        if (!(v > 0)) return null;
        const frac = v / sum;
        const a1 = a0 + frac * 2 * Math.PI;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const d =
          frac >= 0.9999
            ? `M${cx},${cy - r} A${r},${r} 0 1 1 ${cx - 0.01},${cy - r} L${cx - 0.01},${cy - ir} A${ir},${ir} 0 1 0 ${cx},${cy - ir} Z`
            : `M${pt(r, a0)} A${r},${r} 0 ${large} 1 ${pt(r, a1)} L${pt(ir, a1)} A${ir},${ir} 0 ${large} 0 ${pt(ir, a0)} Z`;
        a0 = a1;
        // 2px surface gap between segments
        return <path key={i} d={d} fill={seriesColor(i)} stroke="var(--color-surface)" strokeWidth={2} onMouseMove={(e) => onHover(e, `${chart.points[i]!.label} · ${((frac) * 100).toFixed(1)}%`, [0], i)} />;
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" className={styles.centerValue}>
        {shortNumber(sum)}
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" className={styles.axisText}>
        total
      </text>
      <title>{`Total ${fmt(sum)}`}</title>
    </g>
  );
}
