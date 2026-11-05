import type { CSSProperties } from "react";
import styles from "./Skeleton.module.css";

/** A single shimmering block. Width/height accept any CSS length. */
export function Skeleton({ w = "100%", h = 12, r, className, style }: { w?: number | string; h?: number | string; r?: number | string; className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={[styles.sk, className].filter(Boolean).join(" ")} style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

/** Screen-reader announcement that pairs with any skeleton. */
function Busy({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" className={styles.srOnly}>
      {label}…
    </span>
  );
}

// Fixed, varied widths so skeleton rows look like real data rather than identical bars.
const WIDTHS = ["72%", "54%", "86%", "63%", "47%", "78%", "58%", "69%"];
const w = (i: number) => WIDTHS[i % WIDTHS.length]!;

/** Skeleton rows for a table body: one shimmering bar per column. */
export function SkeletonTableRows({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden="true">
          {Array.from({ length: columns }, (_, c) => (
            <td key={c} className={styles.cell}>
              <Skeleton w={w(r + c)} h={10} style={{ maxWidth: 180 }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Skeleton lines for a small panel or list ("Loading…" replacement). */
export function SkeletonLines({ lines = 4, label }: { lines?: number; label?: string }) {
  return (
    <div className={styles.lines}>
      <Busy label={label} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} w={w(i)} h={10} />
      ))}
    </div>
  );
}

/** Skeleton for a bordered list/table panel with a header row. */
export function SkeletonTable({ rows = 8, columns = 5, toolbar = true }: { rows?: number; columns?: number; toolbar?: boolean }) {
  return (
    <div className={styles.panel}>
      {toolbar ? (
        <div className={styles.toolbar}>
          <Skeleton w={260} h={30} r={6} />
          <Skeleton w={150} h={30} r={6} />
          <Skeleton w={150} h={30} r={6} />
        </div>
      ) : null}
      <div className={styles.thead}>
        {Array.from({ length: columns }, (_, c) => (
          <Skeleton key={c} w={c === 0 ? 90 : 64} h={8} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={styles.row}>
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} w={c === 1 ? `${18 + ((r * 7) % 12)}%` : `${8 + ((r + c) % 4) * 2}%`} h={10} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Header({ actions = true, tabs = 0 }: { actions?: boolean; tabs?: number }) {
  return (
    <>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <Skeleton w={200} h={22} r={6} />
          <Skeleton w={380} h={11} style={{ maxWidth: "60vw" }} />
        </div>
        {actions ? <Skeleton w={130} h={30} r={6} /> : null}
      </div>
      {tabs ? (
        <div className={styles.tabs}>
          {Array.from({ length: tabs }, (_, i) => (
            <Skeleton key={i} w={70 + (i % 2) * 24} h={10} />
          ))}
        </div>
      ) : null}
    </>
  );
}

/** Whole-page skeleton: header, optional tabs, then a table. Used by route loading.tsx files. */
export function PageSkeleton({ tabs = 0, rows = 8, columns = 6, actions = true }: { tabs?: number; rows?: number; columns?: number; actions?: boolean }) {
  return (
    <div className={styles.page}>
      <Busy label="Loading page" />
      <Header actions={actions} tabs={tabs} />
      <SkeletonTable rows={rows} columns={columns} />
    </div>
  );
}

/** Card-grid page skeleton (projects). */
export function CardsPageSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className={styles.page}>
      <Busy label="Loading page" />
      <Header />
      <div style={{ display: "flex", gap: 6 }}>
        {[48, 72, 68, 70, 84, 64].map((x, i) => (
          <Skeleton key={i} w={x} h={26} r={999} />
        ))}
      </div>
      <div className={styles.cards}>
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className={styles.card}>
            <Skeleton w={60} h={9} />
            <Skeleton w={w(i)} h={13} />
            <Skeleton w="58%" h={9} />
            <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
              <Skeleton w="28%" h={22} />
              <Skeleton w="28%" h={22} />
              <Skeleton w="28%" h={22} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Detail page skeleton: title + two-column panels. */
export function DetailPageSkeleton() {
  return (
    <div className={styles.page}>
      <Busy label="Loading page" />
      <Header tabs={3} />
      <div className={styles.grid}>
        {[0, 1].map((p) => (
          <div key={p} className={styles.card}>
            <Skeleton w={120} h={12} />
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                <Skeleton w={80} h={8} />
                <Skeleton w={w(i + p)} h={11} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Dashboard skeleton: KPI tiles, chart panels, list panels. */
export function DashboardSkeleton() {
  const heights = [62, 88, 45, 72, 96, 54, 80, 38, 66, 90];
  return (
    <div className={styles.page}>
      <Busy label="Loading dashboard" />
      <Header actions={false} />
      <div className={styles.kpis}>
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className={styles.kpi}>
            <Skeleton w="70%" h={10} />
            <Skeleton w={i === 0 ? "85%" : "30%"} h={20} r={5} />
            <Skeleton w="80%" h={8} />
          </div>
        ))}
      </div>
      <div className={styles.grid}>
        {[0, 1].map((c) => (
          <div key={c} className={styles.chart}>
            <Skeleton w={160} h={12} />
            <div className={styles.bars}>
              {heights.map((h, i) => (
                <Skeleton key={i} h={`${(h + c * 17) % 100 || 40}%`} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
