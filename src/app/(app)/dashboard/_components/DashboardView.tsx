"use client";

import Link from "next/link";
import { Chart } from "@/components/charts/Chart";
import { Tag } from "@/components/ui/Tag";
import type { ChartWidget, KpiWidget, ListWidget, Widget } from "@/modules/reporting/application/dashboard.service";
import styles from "./dashboard.module.css";

const money = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const count = new Intl.NumberFormat("en-IN");

function Kpi({ w }: { w: KpiWidget }) {
  const value = w.valueType === "money" ? `৳ ${money.format(Number(w.value))}` : count.format(Number(w.value));
  return (
    <Link href={w.link} className={[styles.kpi, styles[w.tone]].join(" ")}>
      <span className={styles.kpiTitle}>{w.title}</span>
      <span className={styles.kpiValue}>{value}</span>
      {w.caption ? <span className={styles.kpiCaption}>{w.caption}</span> : null}
    </Link>
  );
}

function ChartTile({ w }: { w: ChartWidget }) {
  return (
    <Chart
      chart={w.chart}
      footer={
        <Link href={w.link} className={styles.more}>
          Open the details →
        </Link>
      }
    />
  );
}

function List({ w }: { w: ListWidget }) {
  return (
    <section className={styles.list} aria-labelledby={`list-${w.id}`}>
      <div className={styles.listHead}>
        <h3 id={`list-${w.id}`} className={styles.listTitle}>
          {w.title}
        </h3>
        {w.link ? (
          <Link href={w.link} className={styles.more}>
            View all
          </Link>
        ) : null}
      </div>
      {w.rows.length === 0 ? (
        <p className={styles.empty}>{w.empty}</p>
      ) : (
        <ul className={styles.rows}>
          {w.rows.map((r, i) => (
            <li key={`${r.primary}-${i}`}>
              <Link href={r.link ?? w.link ?? "#"} className={styles.row}>
                <span className={styles.rowMain}>
                  <span className={styles.primary}>{r.primary}</span>
                  {r.secondary ? <span className={styles.secondary}>{r.secondary}</span> : null}
                </span>
                <span className={styles.rowSide}>
                  {r.meta ? <span className={styles.secondary}>{r.meta}</span> : null}
                  {r.tag ? <Tag kind={r.tag.kind}>{r.tag.label}</Tag> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** KPI row, then a two-column chart grid (one column on phones), then the lists. Every tile links somewhere. */
export function DashboardView({ widgets }: { widgets: Widget[] }) {
  const kpis = widgets.filter((w): w is KpiWidget => w.kind === "kpi");
  const charts = widgets.filter((w): w is ChartWidget => w.kind === "chart");
  const lists = widgets.filter((w): w is ListWidget => w.kind === "list");
  if (!widgets.length) return <p className={styles.empty}>Nothing to show for your role yet.</p>;
  return (
    <div className={styles.stack}>
      {kpis.length ? (
        <div className={styles.kpis}>
          {kpis.map((w) => (
            <Kpi key={w.id} w={w} />
          ))}
        </div>
      ) : null}
      {charts.length ? (
        <div className={styles.grid}>
          {charts.map((w) => (
            <ChartTile key={w.id} w={w} />
          ))}
        </div>
      ) : null}
      {lists.length ? (
        <div className={styles.grid}>
          {lists.map((w) => (
            <List key={w.id} w={w} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
