"use client";

import { Fragment, useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { niceScale, seriesColor, shortNumber } from "@/shared/charts/palette";
import styles from "./Chart.module.css";

/**
 * In-house charts in the Gr8r Studio style (bar, hbar, line, stacked, donut).
 * Follows the dataviz rules: thin rounded marks on one baseline, hairline grid, 2px surface gaps,
 * a legend for 2+ series, selective labels, a hover layer (crosshair on lines, per-mark on bars),
 * and a "View as table" twin. Text never wears series colour. Values arrive as decimal strings.
 */
export type ChartKind = "bar" | "hbar" | "line" | "stacked" | "donut";

export interface ChartInput {
  type: ChartKind;
  title: string;
  valueType: "money" | "number";
  series?: string[];
  points: { label: string; values: (string | number)[] }[];
}

const H = 220;
const num = (v: string | number | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const money = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
/** "2026-10-24" → "24 Oct" (axis) / "24 Oct 2026" (tooltip); anything else unchanged. */
const shortDate = (s: string) => (isDate(s) ? `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]}` : s);
const longDate = (s: string) => (isDate(s) ? `${shortDate(s)} ${s.slice(0, 4)}` : s);

interface Fmt {
  full: (v: number) => string;
  compact: (v: number) => string;
}

function makeFmt(valueType: ChartInput["valueType"]): Fmt {
  return valueType === "money"
    ? { full: (v) => `৳ ${money.format(v)}`, compact: (v) => `৳${shortNumber(v)}` }
    : { full: (v) => qty.format(v), compact: (v) => (Math.abs(v) < 1e4 ? qty.format(v) : shortNumber(v)) };
}

/** A lighter tint of a hex colour (t = 0…1 toward white), for gradient highlights. */
function tint(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) + (255 - ((n >> s) & 255)) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/** Gradient for HTML fills (ranked bars, meter): highlight on the leading side. */
const fillGradient = (c: string) => `linear-gradient(90deg, ${tint(c, 0.38)}, ${c})`;
const fillGlow = (c: string) => `0 2px 10px -2px ${c}88`;

/**
 * Shared SVG defs: per-series bar gradient (light top → full colour), area gradient (fades to the baseline),
 * reflection gradient, a coloured glow for lines/dots/hover, and a soft colour "lift" under bars.
 */
function Defs({ uid, count }: { uid: string; count: number }) {
  return (
    <defs>
      {Array.from({ length: count }, (_, i) => {
        const c = seriesColor(i);
        return (
          <Fragment key={i}>
            <linearGradient id={`${uid}-bar${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={tint(c, 0.45)} />
              <stop offset="1" stopColor={c} />
            </linearGradient>
            <linearGradient id={`${uid}-area${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={c} stopOpacity={0.38} />
              <stop offset="0.9" stopColor={c} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`${uid}-refl${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={c} stopOpacity={0.22} />
              <stop offset="1" stopColor={c} stopOpacity={0} />
            </linearGradient>
          </Fragment>
        );
      })}
      <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="b" />
        <feComponentTransfer in="b" result="g">
          <feFuncA type="linear" slope="0.85" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode in="g" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id={`${uid}-lift`} x="-60%" y="-20%" width="220%" height="150%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b" />
        <feOffset in="b" dy="5" result="o" />
        <feComponentTransfer in="o" result="g">
          <feFuncA type="linear" slope="0.45" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode in="g" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

/** Counts up from 0 to the value on mount (ease-out, 0.9 s); instant with reduced motion. */
function CountUp({ value, format }: { value: number; format: (v: number) => string }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setShown(value);
    let raf = 0;
    const t0 = performance.now();
    const whole = Number.isInteger(value);
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 900);
      const x = value * (1 - (1 - k) ** 3);
      setShown(k >= 1 ? value : whole ? Math.round(x) : x);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}

/** Width of the chart body, so SVG text renders 1:1 instead of being scaled by a viewBox. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

interface Tip {
  x: number;
  y: number;
  title: string;
  rows: { name: string; value: string; color: string; shape: "line" | "rect" }[];
}

export function Chart({ chart, footer }: { chart: ChartInput; footer?: ReactNode }) {
  const id = useId();
  const uid = `c${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [asTable, setAsTable] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);
  const [bodyRef, width] = useWidth();
  const series = chart.series?.length ? chart.series : [chart.title];
  const fmt = makeFmt(chart.valueType);
  const empty = chart.points.length === 0 || chart.points.every((p) => p.values.every((v) => num(v) === 0));
  const multi = series.length > 1 && chart.type !== "hbar" && chart.type !== "donut";
  const single = chart.type === "bar" && !multi && chart.points.length === 1;

  const totals = series.map((_, s) => chart.points.reduce((a, p) => a + num(p.values[s]), 0));
  const grand = chart.points.reduce((a, p) => a + num(p.values[0]), 0);
  const last = chart.points[chart.points.length - 1];
  // One-line headline under the title (single-series charts; multi-series put totals in the legend).
  const summary = empty || multi || single ? null : chart.type === "line" ? (last ? `Latest ${fmt.compact(num(last.values[0]))} · ${shortDate(last.label)}` : null) : `${fmt.compact(grand)} total`;

  return (
    <figure className={styles.chart} aria-labelledby={`${id}-t`} onMouseLeave={() => setTip(null)}>
      <figcaption className={styles.head}>
        <div className={styles.headText}>
          <h3 id={`${id}-t`} className={styles.title}>
            {chart.title}
          </h3>
          {summary ? <p className={styles.summary}>{summary}</p> : null}
        </div>
        {!empty ? (
          <button type="button" className={styles.toggle} onClick={() => setAsTable((t) => !t)} aria-pressed={asTable} title={asTable ? "View as chart" : "View as table"}>
            <Icon name={asTable ? "chart" : "table"} size={14} />
            <span>{asTable ? "Chart" : "Table"}</span>
          </button>
        ) : null}
      </figcaption>

      {multi && !empty && !asTable ? (
        <ul className={styles.legend}>
          {series.map((s, i) => (
            <li key={s}>
              <span className={chart.type === "line" ? styles.keyLine : styles.keyRect} style={{ background: seriesColor(i) }} />
              <span className={styles.legendName}>{s}</span>
              <span className={styles.legendValue}>
                <CountUp value={totals[i] ?? 0} format={fmt.compact} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div ref={bodyRef} className={styles.body}>
        {empty ? (
          <div className={styles.empty}>
            <Icon name="chart" size={18} />
            No data for this period.
          </div>
        ) : asTable ? (
          <DataTableView chart={chart} series={series} fmt={fmt} />
        ) : single ? (
          <Figure chart={chart} fmt={fmt} />
        ) : chart.type === "hbar" ? (
          <Ranked chart={chart} fmt={fmt} />
        ) : chart.type === "donut" ? (
          <Donut uid={uid} chart={chart} fmt={fmt} />
        ) : chart.type === "line" ? (
          <Line uid={uid} chart={chart} series={series} width={width} fmt={fmt} onTip={setTip} />
        ) : (
          <Columns uid={uid} chart={chart} series={series} width={width} fmt={fmt} onTip={setTip} />
        )}
        {tip && !asTable ? <Tooltip tip={tip} width={width} /> : null}
      </div>
      {footer}
    </figure>
  );
}

function Tooltip({ tip, width }: { tip: Tip; width: number }) {
  const flip = tip.x > width - 200;
  const style: CSSProperties = flip ? { right: width - tip.x + 12, top: tip.y } : { left: tip.x + 12, top: tip.y };
  return (
    <div className={styles.tooltip} style={style} role="presentation">
      <p className={styles.tipTitle}>{tip.title}</p>
      {tip.rows.map((r) => (
        <p key={r.name} className={styles.tipRow}>
          <span className={r.shape === "line" ? styles.tipKeyLine : styles.tipKeyRect} style={{ background: r.color }} />
          <span className={styles.tipName}>{r.name}</span>
          <strong>{r.value}</strong>
        </p>
      ))}
    </div>
  );
}

function DataTableView({ chart, series, fmt }: { chart: ChartInput; series: string[]; fmt: Fmt }) {
  return (
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
          {chart.points.map((p, r) => (
            <tr key={`${p.label}-${r}`}>
              <td>{longDate(p.label)}</td>
              {series.map((s, i) => (
                <td key={s} className={styles.num}>
                  {fmt.full(num(p.values[i]))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One value only: a bar chart of one bar says less than the number itself. */
function Figure({ chart, fmt }: { chart: ChartInput; fmt: Fmt }) {
  const p = chart.points[0]!;
  return (
    <div className={styles.figure}>
      <span className={styles.figureLabel}>{p.label}</span>
      <span className={styles.figureValue}>
        <CountUp value={num(p.values[0])} format={fmt.full} />
      </span>
      <span className={styles.meter}>
        <span className={styles.meterFill} style={{ background: fillGradient(seriesColor(0)), boxShadow: fillGlow(seriesColor(0)) }} />
      </span>
      <span className={styles.figureNote}>100% of the total · only one group has a value</span>
    </div>
  );
}

/* ── Shared axis maths ── */
function yScale(max: number, top: number, plotH: number) {
  const scale = niceScale(max, 4);
  const ticks: number[] = [];
  for (let t = 0; t <= scale.max + 1e-9; t += scale.step) ticks.push(t);
  return { y: (v: number) => top + plotH - (v / scale.max) * plotH, ticks };
}

function YGrid({ ticks, y, left, right, fmt }: { ticks: number[]; y: (v: number) => number; left: number; right: number; fmt: Fmt }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          {t > 0 ? <line x1={left} x2={right} y1={y(t)} y2={y(t)} className={styles.grid} /> : null}
          <text x={left - 8} y={y(t) + 3.5} textAnchor="end" className={styles.axisText}>
            {t === 0 ? "0" : fmt.compact(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** A column with a 4px rounded data-end and a square baseline. */
function column(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return "";
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

type SetTip = (t: Tip | null) => void;

/* ── Columns: bar, grouped bar, stacked ── */
function Columns({ uid, chart, series, width, fmt, onTip }: { uid: string; chart: ChartInput; series: string[]; width: number; fmt: Fmt; onTip: SetTip }) {
  const [hover, setHover] = useState<number | null>(null);
  const stacked = chart.type === "stacked";
  const left = 48;
  const right = width - 4;
  const top = 22;
  const bottom = 38; // room for the reflection under the baseline, then the labels
  const plotW = right - left;
  const plotH = H - top - bottom;
  const base = top + plotH;
  const n = Math.max(1, chart.points.length);
  const totals = chart.points.map((p) => (stacked ? p.values.reduce<number>((a, v) => a + Math.max(0, num(v)), 0) : Math.max(0, ...p.values.map(num))));
  const { y, ticks } = yScale(Math.max(0, ...totals), top, plotH);
  const band = plotW / n;
  const every = Math.ceil(n / Math.max(1, Math.floor(plotW / 64)));
  const groupW = stacked || series.length === 1 ? Math.min(26, band * 0.56) : Math.min(15 * series.length, band * 0.7);
  const maxIdx = totals.indexOf(Math.max(...totals));

  const move = (e: PointerEvent<SVGRectElement>, i: number) => {
    const p = chart.points[i]!;
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    setHover(i);
    onTip({
      x: left + band * i + band / 2 + groupW / 2,
      y: Math.max(0, e.clientY - rect.top - 20),
      title: longDate(p.label),
      rows: [...series.map((s, k) => ({ name: s, value: fmt.full(num(p.values[k])), color: seriesColor(k), shape: "rect" as const })), ...(stacked && series.length > 1 ? [{ name: "Total", value: fmt.full(totals[i] ?? 0), color: "transparent", shape: "rect" as const }] : [])],
    });
  };

  // Reflection: a short, fading mirror of the bar's base under the baseline.
  const reflection = (key: string, x: number, w: number, h: number, s: number, delay: CSSProperties) =>
    h > 0 ? <rect key={key} x={x} y={base + 2} width={w} height={Math.min(14, h * 0.35)} fill={`url(#${uid}-refl${s})`} className={styles.reflection} style={delay} /> : null;

  return (
    <svg width={width} height={H} className={styles.svg} role="img" aria-label={`${chart.title} (use “Table” for the values)`} onPointerLeave={() => (setHover(null), onTip(null))}>
      <Defs uid={uid} count={series.length} />
      <YGrid ticks={ticks} y={y} left={left} right={right} fmt={fmt} />
      {hover !== null ? <rect x={left + band * hover + 2} y={top - 8} width={band - 4} height={plotH + 8} rx={8} className={styles.bandHover} /> : null}
      {chart.points.map((p, i) => {
        const x0 = left + band * i + (band - groupW) / 2;
        const dim = hover !== null && hover !== i;
        const delay = { animationDelay: `${Math.min(i * 50, 450)}ms` } as CSSProperties;
        const filter = `url(#${uid}-${hover === i ? "glow" : "lift"})`;
        if (stacked) {
          let acc = 0;
          const nonZero = series.map((_, s) => num(p.values[s]) > 0);
          const topSeg = nonZero.lastIndexOf(true);
          const firstSeg = nonZero.indexOf(true);
          return (
            <g key={i} className={dim ? styles.dim : undefined}>
              {firstSeg >= 0 ? reflection(`r${i}`, x0, groupW, base - y(totals[i] ?? 0), firstSeg, delay) : null}
              <g filter={filter}>
                {series.map((_, s) => {
                  const v = Math.max(0, num(p.values[s]));
                  const y1 = y(acc + v);
                  const h = y(acc) - y1 - (acc > 0 ? 2 : 0); // 2px surface gap between segments
                  acc += v;
                  return h > 0 ? <path key={s} className={styles.bar} style={delay} d={s === topSeg ? column(x0, y1, groupW, h) : `M${x0},${y1} h${groupW} v${h} h${-groupW} Z`} fill={`url(#${uid}-bar${s})`} /> : null;
                })}
              </g>
            </g>
          );
        }
        const w = groupW / series.length;
        const bx = (s: number) => x0 + w * s + (s ? 1 : 0);
        const bw = w - (series.length > 1 ? 2 : 0);
        return (
          <g key={i} className={dim ? styles.dim : undefined}>
            {series.map((_, s) => reflection(`r${s}`, bx(s), bw, base - y(Math.max(0, num(p.values[s]))), s, delay))}
            <g filter={filter}>
              {series.map((_, s) => {
                const v = Math.max(0, num(p.values[s]));
                return <path key={s} className={styles.bar} style={delay} d={column(bx(s), y(v), bw, base - y(v))} fill={`url(#${uid}-bar${s})`} />;
              })}
            </g>
          </g>
        );
      })}
      {/* Selective direct label: the tallest column only (single series); the rest live in the tooltip and table. */}
      {series.length === 1 && n > 1 && hover === null ? (
        <text x={left + band * maxIdx + band / 2} y={y(totals[maxIdx] ?? 0) - 9} textAnchor="middle" className={styles.capText}>
          <CountUp value={totals[maxIdx] ?? 0} format={fmt.compact} />
        </text>
      ) : null}
      <line x1={left} x2={right} y1={base} y2={base} className={styles.axis} />
      {chart.points.map((p, i) =>
        i % every === 0 ? (
          <text key={`l${i}`} x={left + band * i + band / 2} y={H - 4} textAnchor="middle" className={hover === i ? styles.axisTextOn : styles.axisText}>
            {shortDate(p.label).length > 14 ? `${shortDate(p.label).slice(0, 13)}…` : shortDate(p.label)}
          </text>
        ) : null,
      )}
      {/* Hit targets: the whole band, larger than the marks. */}
      {chart.points.map((p, i) => (
        <rect key={`h${i}`} x={left + band * i} y={top - 8} width={band} height={plotH + 8} fill="transparent" onPointerMove={(e) => move(e, i)} />
      ))}
    </svg>
  );
}

/** Monotone cubic (Fritsch–Carlson) path through the points: smooth without overshooting the data. */
function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return pts.length ? `M${pts[0]![0]},${pts[0]![1]}` : "";
  const n = pts.length;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1]![0] - pts[i]![0]);
    m.push((pts[i + 1]![1] - pts[i]![1]) / (dx[i] || 1));
  }
  const t: number[] = [m[0]!];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1]! * m[i]! <= 0 ? 0 : (3 * (dx[i - 1]! + dx[i]!)) / ((2 * dx[i]! + dx[i - 1]!) / m[i - 1]! + (dx[i]! + 2 * dx[i - 1]!) / m[i]!));
  t.push(m[n - 2]!);
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const h = dx[i]! / 3;
    d += ` C${x0 + h},${y0 + t[i]! * h} ${x1 - h},${y1 - t[i + 1]! * h} ${x1},${y1}`;
  }
  return d;
}

/* ── Line / area with a crosshair ── */
function Line({ uid, chart, series, width, fmt, onTip }: { uid: string; chart: ChartInput; series: string[]; width: number; fmt: Fmt; onTip: SetTip }) {
  const [hover, setHover] = useState<number | null>(null);
  const one = series.length === 1;
  const left = 48;
  const right = width - (one ? 52 : 10);
  const top = 14;
  const bottom = 24;
  const plotW = right - left;
  const plotH = H - top - bottom;
  const n = chart.points.length;
  const max = Math.max(0, ...chart.points.flatMap((p) => p.values.map(num)));
  const { y, ticks } = yScale(max, top, plotH);
  const x = (i: number) => (n <= 1 ? left + plotW / 2 : left + (i * plotW) / (n - 1));
  const every = Math.ceil(n / Math.max(1, Math.floor(plotW / 72)));
  const base = top + plotH;

  const move = (e: PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - left) / plotW) * (n - 1))));
    const p = chart.points[i]!;
    setHover(i);
    onTip({
      x: x(i),
      y: Math.max(0, Math.min(...series.map((_, s) => y(Math.max(0, num(p.values[s]))))) - 24),
      title: longDate(p.label),
      rows: series.map((s, k) => ({ name: s, value: fmt.full(num(p.values[k])), color: seriesColor(k), shape: "line" as const })),
    });
  };

  const lastI = n - 1;
  return (
    <svg width={width} height={H} className={styles.svg} role="img" aria-label={`${chart.title} (use “Table” for the values)`} onPointerLeave={() => (setHover(null), onTip(null))}>
      <Defs uid={uid} count={series.length} />
      <YGrid ticks={ticks} y={y} left={left} right={right} fmt={fmt} />
      <line x1={left} x2={right} y1={base} y2={base} className={styles.axis} />
      {series.map((_, s) => {
        const pts = chart.points.map((p, i) => [x(i), y(Math.max(0, num(p.values[s])))] as [number, number]);
        const d = smoothPath(pts);
        return (
          <g key={s}>
            {pts.length > 1 ? <path d={`${d} L${pts[pts.length - 1]![0]},${base} L${pts[0]![0]},${base} Z`} fill={`url(#${uid}-area${s})`} className={styles.area} /> : null}
            <path d={d} pathLength={1} fill="none" stroke={seriesColor(s)} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" filter={`url(#${uid}-glow)`} className={styles.line} />
          </g>
        );
      })}
      {/* End dot on every series, with a soft "live" pulse; a value label only for a single series (converging labels would collide). */}
      {lastI >= 0 && hover === null
        ? series.map((_, s) => {
            const cy = y(Math.max(0, num(chart.points[lastI]!.values[s])));
            return (
              <g key={`e${s}`}>
                <circle cx={x(lastI)} cy={cy} r={4} fill={seriesColor(s)} className={styles.pulse} />
                <circle cx={x(lastI)} cy={cy} r={4} fill={seriesColor(s)} filter={`url(#${uid}-glow)`} className={`${styles.dot} ${styles.endDot}`} />
              </g>
            );
          })
        : null}
      {one && lastI >= 0 && hover === null ? (
        <text x={x(lastI) + 9} y={y(Math.max(0, num(chart.points[lastI]!.values[0]))) + 4} className={styles.capText}>
          <CountUp value={num(chart.points[lastI]!.values[0])} format={fmt.compact} />
        </text>
      ) : null}
      {chart.points.map((p, i) =>
        i % every === 0 || (i === lastI && (lastI % every) / every > 0.6) ? (
          <text key={`l${i}`} x={x(i)} y={H - 6} textAnchor={i === 0 && n > 1 ? "start" : i === lastI && n > 1 ? "end" : "middle"} className={hover === i ? styles.axisTextOn : styles.axisText}>
            {shortDate(p.label)}
          </text>
        ) : null,
      )}
      {hover !== null ? (
        <g>
          <line x1={x(hover)} x2={x(hover)} y1={top - 4} y2={base} className={styles.crosshair} />
          {series.map((_, s) => (
            <circle key={s} cx={x(hover)} cy={y(Math.max(0, num(chart.points[hover]!.values[s])))} r={5} fill={seriesColor(s)} filter={`url(#${uid}-glow)`} className={styles.dot} />
          ))}
        </g>
      ) : null}
      <rect x={left - 8} y={top - 8} width={plotW + 16} height={plotH + 8} fill="transparent" onPointerMove={move} />
    </svg>
  );
}

/* ── Ranked list (hbar): full-width labels, thin rounded bars on a track, value at the tip ── */
function Ranked({ chart, fmt }: { chart: ChartInput; fmt: Fmt }) {
  const points = chart.points.slice(0, 12);
  const max = Math.max(0, ...points.map((p) => num(p.values[0])));
  return (
    <ol className={styles.rank} aria-label={chart.title}>
      {points.map((p, i) => {
        const v = Math.max(0, num(p.values[0]));
        const pct = max > 0 ? (v / max) * 100 : 0;
        return (
          <li key={`${p.label}-${i}`} className={styles.rankRow} title={`${p.label}: ${fmt.full(v)}`}>
            <span className={styles.rankNo}>{i + 1}</span>
            <span className={styles.rankMain}>
              <span className={styles.rankHead}>
                <span className={styles.rankLabel}>{p.label}</span>
                <span className={styles.rankValue}>
                  <CountUp value={v} format={fmt.compact} />
                </span>
              </span>
              <span className={styles.track}>
                <span className={styles.trackFill} style={{ width: `${Math.max(pct, v > 0 ? 1.5 : 0)}%`, background: fillGradient(seriesColor(0)), boxShadow: fillGlow(seriesColor(0)), animationDelay: `${i * 40}ms` }} />
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ── Donut: thin ring with 2px gaps; the centre shows the total, or the hovered part ── */
function Donut({ uid, chart, fmt }: { uid: string; chart: ChartInput; fmt: Fmt }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = chart.points.map((p) => Math.max(0, num(p.values[0])));
  const sum = values.reduce((a, v) => a + v, 0);
  const S = 176;
  const c = S / 2;
  const r = 82;
  const ir = 62;
  let a0 = -Math.PI / 2;
  const pt = (rad: number, a: number) => `${c + rad * Math.cos(a)},${c + rad * Math.sin(a)}`;
  const focus = hover !== null ? { label: chart.points[hover]!.label, value: values[hover]! } : null;
  return (
    <div className={styles.donutWrap} onPointerLeave={() => setHover(null)}>
      <svg width={S} height={S} className={styles.donut} role="img" aria-label={`${chart.title}: total ${fmt.full(sum)}`}>
        <Defs uid={uid} count={0} />
        <g filter={`url(#${uid}-lift)`}>
        {values.map((v, i) => {
          if (!(v > 0)) return null;
          const frac = v / sum;
          const a1 = a0 + frac * 2 * Math.PI;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const d =
            frac >= 0.9999
              ? `M${c},${c - r} A${r},${r} 0 1 1 ${c - 0.01},${c - r} L${c - 0.01},${c - ir} A${ir},${ir} 0 1 0 ${c},${c - ir} Z`
              : `M${pt(r, a0)} A${r},${r} 0 ${large} 1 ${pt(r, a1)} L${pt(ir, a1)} A${ir},${ir} 0 ${large} 0 ${pt(ir, a0)} Z`;
          a0 = a1;
          return <path key={i} d={d} fill={seriesColor(i)} className={[styles.seg, hover !== null && hover !== i ? styles.dim : ""].join(" ")} filter={hover === i ? `url(#${uid}-glow)` : undefined} onPointerEnter={() => setHover(i)} />;
        })}
        </g>
        <text x={c} y={c - 2} textAnchor="middle" className={styles.centerValue}>
          <CountUp value={focus ? focus.value : sum} format={fmt.compact} />
        </text>
        <text x={c} y={c + 16} textAnchor="middle" className={styles.centerLabel}>
          {focus ? (focus.label.length > 16 ? `${focus.label.slice(0, 15)}…` : focus.label) : "Total"}
        </text>
      </svg>
      <ul className={styles.donutLegend}>
        {chart.points.map((p, i) => (
          <li key={`${p.label}-${i}`} className={hover !== null && hover !== i ? styles.dim : undefined} onPointerEnter={() => setHover(i)}>
            <span className={styles.keyRect} style={{ background: seriesColor(i) }} />
            <span className={styles.legendName}>{p.label}</span>
            <span className={styles.legendValue}>
              <CountUp value={values[i]!} format={fmt.compact} />
            </span>
            <span className={styles.legendPct}>{sum > 0 ? `${((values[i]! / sum) * 100).toFixed(values[i]! / sum < 0.1 ? 1 : 0)}%` : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
