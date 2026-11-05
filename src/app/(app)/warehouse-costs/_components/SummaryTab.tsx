"use client";

import { Fragment, useEffect, useState } from "react";
import { Chart, type ChartInput } from "@/components/charts/Chart";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Notification } from "@/components/ui/Notification";
import { SkeletonLines } from "@/components/ui/Skeleton";
import { api, download, errorMessage } from "@/lib/api-client";
import { formatMoney } from "@/shared/time/format";
import { addMoney, addMonths, CATEGORY_SHORT, monthLabel, thisMonth, type SummaryDto } from "./types";
import stock from "../../stock/_components/stock.module.css";
import css from "./warehouse-costs.module.css";

const pct = (v: string | null) => (v === null ? "—" : `${v}%`);

/** Per month: store charge and holding per warehouse (with holding as % of average stock value), the company's established cost, and the total. */
export function SummaryTab({ version }: { version: number }) {
  const [from, setFrom] = useState(() => addMonths(thisMonth(), -5));
  const [to, setTo] = useState(thisMonth);
  const [data, setData] = useState<SummaryDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const rangeError = from && to && from > to ? "From must be on or before To." : null;

  useEffect(() => {
    if (!from || !to || rangeError) return;
    let live = true;
    setLoading(true);
    api<{ data: SummaryDto }>("/warehouse-costs/summary", { query: { monthFrom: from, monthTo: to } })
      .then((r) => live && (setData(r.data), setError(null)))
      .catch((err) => live && setError(errorMessage(err)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [from, to, rangeError, version]);

  async function exportXlsx() {
    setExporting(true);
    try {
      await download("/warehouse-costs/summary/export", { monthFrom: from, monthTo: to }, `warehouse-costs-${from}-to-${to}.xlsx`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  const months = data?.months ?? [];
  const store = (m: SummaryDto["months"][number]) => addMoney(...m.warehouses.map((w) => w.storeChargeCost));
  const holding = (m: SummaryDto["months"][number]) => addMoney(...m.warehouses.map((w) => w.holdingCost));
  const chart: ChartInput = {
    type: "stacked",
    title: "Overhead per month",
    valueType: "money",
    series: [CATEGORY_SHORT.STORE_CHARGE, CATEGORY_SHORT.HOLDING, CATEGORY_SHORT.ESTABLISHMENT],
    points: months.map((m) => ({ label: monthLabel(m.month), values: [store(m), holding(m), m.company.establishmentCost] })),
  };
  const grand = {
    store: addMoney(...months.map(store)),
    holding: addMoney(...months.map(holding)),
    established: addMoney(...months.map((m) => m.company.establishmentCost)),
    total: addMoney(...months.map((m) => m.total)),
  };

  return (
    <div className={stock.stack}>
      <div className={css.summaryBar}>
        <TextField label="From month" type="month" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} error={rangeError ?? undefined} fieldClassName={css.month} />
        <TextField label="To month" type="month" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} fieldClassName={css.month} />
        <div className={css.summaryActions}>
          <Button kind="secondary" onClick={exportXlsx} disabled={exporting || !!rangeError || !from || !to}>
            <Icon name="download" size={14} /> {exporting ? "Preparing…" : "Export to Excel"}
          </Button>
        </div>
      </div>

      {error ? (
        <Notification kind="error" title="Could not load the summary" onClose={() => setError(null)}>
          {error}
        </Notification>
      ) : null}

      {!data && loading ? (
        <SkeletonLines lines={8} />
      ) : data ? (
        <>
          <Chart chart={chart} />
          <section className={stock.section} aria-labelledby="wc-summary" aria-busy={loading || undefined}>
            <h2 id="wc-summary" className={stock.sectionTitle} style={{ marginBottom: "var(--s-2)" }}>
              {monthLabel(data.monthFrom, true)} – {monthLabel(data.monthTo, true)}
            </h2>
            <p className={stock.sectionHelp} style={{ marginBottom: "var(--s-4)" }}>
              Voided lines are left out. Holding % is the month&apos;s holding cost as a share of the warehouse&apos;s average stock value. These costs never change stock value.
            </p>
            <div className={stock.linesWrap}>
              <table className={stock.lines}>
                <thead>
                  <tr>
                    <th>Warehouse</th>
                    <th className={stock.right}>Store charge (৳)</th>
                    <th className={stock.right}>Holding cost (৳)</th>
                    <th className={stock.right}>Established cost (৳)</th>
                    <th className={stock.right}>Total (৳)</th>
                    <th className={stock.right}>Avg stock value (৳)</th>
                    <th className={stock.right}>Holding %</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <Fragment key={m.month}>
                      <tr className={css.monthRow}>
                        <th colSpan={7} scope="rowgroup">
                          {monthLabel(m.month, true)}
                        </th>
                      </tr>
                      {m.warehouses.map((w) => (
                        <tr key={w.warehouse.id}>
                          <td className={css.indent}>{w.warehouse.name}</td>
                          <td className={`${stock.right} ${stock.num}`}>{formatMoney(w.storeChargeCost)}</td>
                          <td className={`${stock.right} ${stock.num}`}>{formatMoney(w.holdingCost)}</td>
                          <td className={`${stock.right} ${stock.muted}`}>—</td>
                          <td className={`${stock.right} ${stock.num}`}>{formatMoney(w.warehouseTotal)}</td>
                          <td className={`${stock.right} ${stock.num}`}>{formatMoney(w.averageStockValue)}</td>
                          <td className={`${stock.right} ${stock.num}`}>{pct(w.holdingPercent)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td className={css.indent}>Company (established cost)</td>
                        <td className={`${stock.right} ${stock.muted}`}>—</td>
                        <td className={`${stock.right} ${stock.muted}`}>—</td>
                        <td className={`${stock.right} ${stock.num}`}>{formatMoney(m.company.establishmentCost)}</td>
                        <td className={`${stock.right} ${stock.num}`}>{formatMoney(m.company.establishmentCost)}</td>
                        <td />
                        <td />
                      </tr>
                      <tr className={css.total}>
                        <td>{monthLabel(m.month)} total</td>
                        <td className={`${stock.right} ${stock.num}`}>{formatMoney(store(m))}</td>
                        <td className={`${stock.right} ${stock.num}`}>{formatMoney(holding(m))}</td>
                        <td className={`${stock.right} ${stock.num}`}>{formatMoney(m.company.establishmentCost)}</td>
                        <td className={`${stock.right} ${stock.num}`}>{formatMoney(m.total)}</td>
                        <td />
                        <td />
                      </tr>
                    </Fragment>
                  ))}
                  {months.length > 1 ? (
                    <tr className={css.grand}>
                      <td>Total for the period</td>
                      <td className={`${stock.right} ${stock.num}`}>{formatMoney(grand.store)}</td>
                      <td className={`${stock.right} ${stock.num}`}>{formatMoney(grand.holding)}</td>
                      <td className={`${stock.right} ${stock.num}`}>{formatMoney(grand.established)}</td>
                      <td className={`${stock.right} ${stock.num}`}>{formatMoney(grand.total)}</td>
                      <td />
                      <td />
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
