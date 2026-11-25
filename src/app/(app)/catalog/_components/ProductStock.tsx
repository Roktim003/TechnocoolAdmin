"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { api, errorMessage } from "@/lib/api-client";
import { formatMoney } from "@/shared/time/format";
import styles from "./catalog.module.css";

/** One row of GET /stock/balances (stock module), for one product. Cost fields are absent without seeCost. */
interface Balance {
  warehouses: { warehouseId: string; code: string; good: string; damaged: string; reserved: string; available: string }[];
  onHand: string;
  reserved: string;
  available: string;
  damaged: string;
  inTransit: string;
  total: string;
  avgCost?: string;
  stockValue?: string;
}
interface WarehouseRow {
  id: string;
  name: string;
  good: string;
  reserved: string;
  available: string;
  damaged: string;
}

/** "12.000" → "12", "2.500" → "2.5". */
const qty = (v: string) => (v.includes(".") ? v.replace(/\.?0+$/, "") : v);

/**
 * How much of the product is in stock, per warehouse (the user's warehouses only), with the
 * average cost and stock value for roles that see cost. Needs inventory ≥ VIEW.
 */
export function ProductStock({ productId, unitCode, seeCost, canAddStock }: { productId: string; unitCode: string; seeCost: boolean; canAddStock: boolean }) {
  const [balance, setBalance] = useState<Balance | null | undefined>(undefined);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ data: Balance[] }>("/stock/balances", { query: { productId, pageSize: 1 } }),
      api<{ data: { id: string; name: string }[] }>("/warehouses").catch(() => ({ data: [] })),
    ])
      .then(([b, w]) => {
        setBalance(b.data[0] ?? null);
        setNames(Object.fromEntries(w.data.map((x) => [x.id, x.name])));
      })
      .catch((err) => setError(errorMessage(err)));
  }, [productId]);

  const rows: WarehouseRow[] = (balance?.warehouses ?? []).map((w) => ({ id: w.warehouseId, name: names[w.warehouseId] ?? w.code, good: w.good, reserved: w.reserved, available: w.available, damaged: w.damaged }));
  const columns: Column<WarehouseRow>[] = [
    { key: "warehouse", header: "Warehouse", render: (r) => r.name },
    { key: "good", header: `On hand (${unitCode})`, align: "end", render: (r) => qty(r.good) },
    { key: "reserved", header: "Reserved", align: "end", render: (r) => qty(r.reserved) },
    { key: "available", header: "Available", align: "end", render: (r) => qty(r.available) },
    { key: "damaged", header: "Damaged", align: "end", render: (r) => qty(r.damaged) },
  ];

  return (
    <section className={styles.section} aria-labelledby="d-stock">
      <h2 id="d-stock" className={styles.sectionTitle}>
        Stock
      </h2>
      {error ? (
        <p className={styles.sectionHelp}>Could not load stock: {error}</p>
      ) : (
        <>
          <dl className={styles.dl}>
            <div>
              <dt>Total in stock</dt>
              <dd>{balance === undefined ? "…" : `${qty(balance?.total ?? "0")} ${unitCode}`}</dd>
            </div>
            <div>
              <dt>Available</dt>
              <dd>{balance === undefined ? "…" : `${qty(balance?.available ?? "0")} ${unitCode}`}</dd>
            </div>
            {balance && balance.inTransit !== "0.000" ? (
              <div>
                <dt>In transit</dt>
                <dd>
                  {qty(balance.inTransit)} {unitCode}
                </dd>
              </div>
            ) : null}
            {seeCost ? (
              <>
                <div>
                  <dt>Average cost</dt>
                  <dd>{balance === undefined ? "…" : formatMoney(balance?.avgCost ?? "0")}</dd>
                </div>
                <div>
                  <dt>Stock value</dt>
                  <dd>{balance === undefined ? "…" : formatMoney(balance?.stockValue ?? "0")}</dd>
                </div>
              </>
            ) : null}
          </dl>
          <DataTable caption="Stock by warehouse" columns={columns} rows={rows} rowKey={(r) => r.id} loading={balance === undefined} emptyMessage="No warehouses in your access." />
          <p className={styles.sectionHelp}>
            <Link href={`/stock/products/${productId}`}>Open stock card</Link> (every movement in and out)
            {canAddStock ? (
              <>
                {" · "}
                <Link href="/stock?tab=new">Add stock</Link> (purchase receipt or opening stock)
              </>
            ) : null}
          </p>
        </>
      )}
    </section>
  );
}
