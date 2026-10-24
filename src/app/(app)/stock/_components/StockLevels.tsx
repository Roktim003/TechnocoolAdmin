"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Checkbox, SelectField, TextField } from "@/components/ui/Field";
import { Notification } from "@/components/ui/Notification";
import { Pagination } from "@/components/ui/Pagination";
import { Tag } from "@/components/ui/Tag";
import { api, errorMessage, type Page } from "@/lib/api-client";
import { formatMoney } from "@/shared/time/format";
import { formatQty, type StockCaps, type StockLevelDto, type WarehouseDto } from "./types";
import styles from "./stock.module.css";

export function StockLevels({ caps, warehouses }: { caps: StockCaps; warehouses: WarehouseDto[] }) {
  const router = useRouter();
  const mine = warehouses.filter((w) => caps.warehouseIds.includes(w.id));
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [inStock, setInStock] = useState(true);
  const [belowMinimum, setBelowMinimum] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<Page<StockLevelDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await api<Page<StockLevelDto>>("/stock/balances", { query: { page, pageSize, q: debouncedQ, warehouseId, inStock: inStock ? "true" : undefined, belowMinimum: belowMinimum ? "true" : undefined } }));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedQ, warehouseId, inStock, belowMinimum]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = warehouseId ? mine.filter((w) => w.id === warehouseId) : mine;
  const columns: Column<StockLevelDto>[] = [
    { key: "code", header: "Code", render: (r) => <span className={styles.mono}>{r.product.code}</span> },
    {
      key: "name",
      header: "Product",
      render: (r) => (
        <Link href={`/stock/products/${r.product.id}`} className={styles.link}>
          {r.product.name}
        </Link>
      ),
    },
    ...shown.map((w) => ({
      key: `wh-${w.id}`,
      header: w.code,
      align: "end" as const,
      render: (r: StockLevelDto) => {
        const b = r.warehouses.find((x) => x.warehouseId === w.id);
        return (
          <span className={styles.num} title={b && b.reserved !== "0.000" ? `${formatQty(b.reserved)} reserved` : undefined}>
            {formatQty(b?.good ?? "0")}
            {b && b.reserved !== "0.000" ? <span className={styles.muted}> ({formatQty(b.reserved)} res.)</span> : null}
          </span>
        );
      },
    })),
    { key: "total", header: "Good total", align: "end", render: (r) => <span className={styles.num}>{formatQty(r.good)} {r.product.unitCode}</span> },
    { key: "damaged", header: "Damaged", align: "end", render: (r) => <span className={`${styles.num} ${r.damaged !== "0.000" ? styles.negative : ""}`}>{formatQty(r.damaged)}</span> },
    { key: "transit", header: "In transit", align: "end", render: (r) => <span className={styles.num}>{formatQty(r.inTransit)}</span> },
    ...(caps.seeCost
      ? [
          { key: "avg", header: "Avg cost", align: "end" as const, render: (r: StockLevelDto) => <span className={styles.num}>{formatMoney(r.avgCost)}</span> },
          { key: "value", header: "Value", align: "end" as const, render: (r: StockLevelDto) => <span className={styles.num}>{formatMoney(r.stockValue)}</span> },
        ]
      : []),
    {
      key: "flag",
      header: <span className="visually-hidden">Alerts</span>,
      render: (r) => (r.product.minStockLevel && Number(r.good) < Number(r.product.minStockLevel) ? <Tag kind="red">Below minimum</Tag> : r.product.status === "DISCONTINUED" ? <Tag kind="gray">Discontinued</Tag> : null),
    },
  ];

  return (
    <div className={styles.stack}>
      {error ? <Notification kind="error" title="Could not load stock levels">{error}</Notification> : null}
      <DataTable
        caption="Stock levels"
        columns={columns}
        rows={result?.data ?? []}
        rowKey={(r) => r.product.id}
        loading={loading}
        onRowClick={(r) => router.push(`/stock/products/${r.product.id}`)}
        rowLabel={(r) => `Open stock card for ${r.product.code}`}
        toolbar={
          <div className={styles.toolbar}>
            <TextField label="Search" placeholder="Code, name, model…" value={q} onChange={(e) => setQ(e.target.value)} fieldClassName={styles.search} />
            <SelectField label="Warehouse" value={warehouseId} onChange={(e) => (setWarehouseId(e.target.value), setPage(1))} fieldClassName={styles.filter}>
              <option value="">All my warehouses</option>
              {mine.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </SelectField>
            <Checkbox label="Only items in stock" checked={inStock} onChange={(e) => (setInStock(e.target.checked), setPage(1))} />
            <Checkbox label="Below minimum" checked={belowMinimum} onChange={(e) => (setBelowMinimum(e.target.checked), setPage(1))} />
          </div>
        }
        emptyMessage="No stock yet. Post a GRN or opening stock to get started."
        footer={result ? <Pagination page={page} pageSize={pageSize} total={result.meta.total} onChange={(p, s) => (setPage(p), setPageSize(s))} /> : null}
      />
    </div>
  );
}
