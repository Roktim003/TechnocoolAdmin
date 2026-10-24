"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SelectField, TextField } from "@/components/ui/Field";
import { Notification } from "@/components/ui/Notification";
import { Pagination } from "@/components/ui/Pagination";
import { Tag } from "@/components/ui/Tag";
import { api, errorMessage } from "@/lib/api-client";
import { formatDateTime, formatMoney } from "@/shared/time/format";
import { ENTRY_TYPE_META, formatQty, type MovementDto, type StockCaps, type StockLevelDto, type WarehouseDto } from "./types";
import styles from "./stock.module.css";

interface CardData {
  product: { id: string; code: string; name: string; unitCode: string; trackSerial: boolean };
  level: StockLevelDto | null;
  inTransit: { entryId: string; number: string | null; fromCode: string; toCode: string; qty: string }[];
  movements: MovementDto[];
}

export function ProductStockCard({ caps, productId, warehouses }: { caps: StockCaps; productId: string; warehouses: WarehouseDto[] }) {
  const [data, setData] = useState<CardData | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [warehouseId, setWarehouseId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ data: CardData; meta: { total: number } }>(`/stock/products/${productId}`, { query: { page, pageSize, warehouseId, dateFrom, dateTo } });
      setData(r.data);
      setTotal(r.meta.total);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [productId, page, pageSize, warehouseId, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const l = data?.level;
  const columns: Column<MovementDto>[] = [
    { key: "at", header: "Posted", render: (m) => <span className={styles.nowrap}>{formatDateTime(m.postedAt)}</span> },
    {
      key: "entry",
      header: "Entry",
      render: (m) =>
        m.entry ? (
          <Link href={`/stock/${m.entry.id}`} className={styles.mono}>
            {m.entry.number}
          </Link>
        ) : (
          "—"
        ),
    },
    { key: "type", header: "Type", render: (m) => <span className={styles.nowrap}>{m.entry ? ENTRY_TYPE_META[m.entry.type].label : "—"}</span> },
    { key: "wh", header: "Warehouse", render: (m) => m.warehouse.code },
    { key: "cond", header: "Condition", render: (m) => (m.condition === "DAMAGED" ? <Tag kind="red">Damaged</Tag> : "Good") },
    { key: "qty", header: "Qty", align: "end", render: (m) => <span className={`${styles.num} ${m.qtyChange.startsWith("-") ? styles.negative : styles.positive}`}>{m.qtyChange.startsWith("-") ? "" : "+"}{formatQty(m.qtyChange)}</span> },
    { key: "bal", header: "Balance", align: "end", render: (m) => <span className={styles.num}>{formatQty(m.balanceAfter)}</span> },
    ...(caps.seeCost
      ? [
          { key: "uc", header: "Unit cost", align: "end" as const, render: (m: MovementDto) => <span className={styles.num}>{formatMoney(m.unitCost)}</span> },
          { key: "val", header: "Value", align: "end" as const, render: (m: MovementDto) => <span className={styles.num}>{formatMoney(m.valueChange)}</span> },
          { key: "avg", header: "Avg after", align: "end" as const, render: (m: MovementDto) => <span className={styles.num}>{formatMoney(m.avgCostAfter)}</span> },
        ]
      : []),
  ];

  return (
    <div className={styles.stack}>
      <div className={styles.breadcrumb}>
        <Link href="/stock?tab=levels">Stock levels</Link> / {data?.product.code ?? "…"}
      </div>
      <div className={styles.detailHeader}>
        <div>
          <h1 className={styles.detailTitle}>{data?.product.name ?? "Stock card"}</h1>
          <p className={styles.detailSub}>
            <span className={styles.mono}>{data?.product.code}</span> · <Link href={`/catalog/${productId}`}>Catalog page</Link>
            {data?.product.trackSerial ? (
              <>
                {" "}
                · <Link href={`/serials?productId=${productId}`}>Serial numbers</Link>
              </>
            ) : null}
          </p>
        </div>
      </div>
      {error ? <Notification kind="error">{error}</Notification> : null}

      <div className={styles.cards}>
        <Card label="Good stock" value={`${formatQty(l?.good ?? "0")} ${data?.product.unitCode ?? ""}`} />
        <Card label="Reserved" value={formatQty(l?.reserved ?? "0")} />
        <Card label="Damaged" value={formatQty(l?.damaged ?? "0")} />
        <Card label="In transit" value={formatQty(l?.inTransit ?? "0")} />
        {caps.seeCost ? <Card label="Average cost" value={formatMoney(l?.avgCost ?? "0")} /> : null}
        {caps.seeCost ? <Card label="Stock value" value={formatMoney(l?.stockValue ?? "0")} /> : null}
      </div>

      {l?.warehouses.length ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-4)" }}>
            By warehouse
          </h2>
          <table className={styles.lines}>
            <thead>
              <tr>
                <th>Warehouse</th>
                <th className={styles.right}>Good</th>
                <th className={styles.right}>Reserved</th>
                <th className={styles.right}>Available</th>
                <th className={styles.right}>Damaged</th>
              </tr>
            </thead>
            <tbody>
              {l.warehouses.map((w) => (
                <tr key={w.warehouseId}>
                  <td>{warehouses.find((x) => x.id === w.warehouseId)?.name ?? w.code}</td>
                  <td className={`${styles.right} ${styles.num}`}>{formatQty(w.good)}</td>
                  <td className={`${styles.right} ${styles.num}`}>{formatQty(w.reserved)}</td>
                  <td className={`${styles.right} ${styles.num}`}>{formatQty(subtract(w.good, w.reserved))}</td>
                  <td className={`${styles.right} ${styles.num}`}>{formatQty(w.damaged)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.inTransit.length ? (
            <p className={styles.muted} style={{ marginTop: "var(--space-4)" }}>
              In transit:{" "}
              {data.inTransit.map((t, i) => (
                <span key={t.entryId}>
                  {i ? ", " : ""}
                  <Link href={`/stock/${t.entryId}`}>{t.number}</Link> ({t.fromCode} → {t.toCode}, {formatQty(t.qty)})
                </span>
              ))}
            </p>
          ) : null}
        </section>
      ) : null}

      <DataTable
        caption="Stock ledger"
        columns={columns}
        rows={data?.movements ?? []}
        rowKey={(m) => m.id}
        loading={loading}
        emptyMessage="No movements yet."
        toolbar={
          <div className={styles.toolbar}>
            <SelectField label="Warehouse" value={warehouseId} onChange={(e) => (setWarehouseId(e.target.value), setPage(1))} fieldClassName={styles.filter}>
              <option value="">All my warehouses</option>
              {warehouses
                .filter((w) => caps.warehouseIds.includes(w.id))
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </SelectField>
            <TextField label="From" type="date" value={dateFrom} onChange={(e) => (setDateFrom(e.target.value), setPage(1))} fieldClassName={styles.filter} />
            <TextField label="To" type="date" value={dateTo} onChange={(e) => (setDateTo(e.target.value), setPage(1))} fieldClassName={styles.filter} />
          </div>
        }
        footer={<Pagination page={page} pageSize={pageSize} total={total} onChange={(p, s) => (setPage(p), setPageSize(s))} />}
      />
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardLabel}>{label}</div>
      <div className={styles.cardValue}>{value}</div>
    </div>
  );
}

/** Exact a − b for 3-dp quantity strings (display only). */
function subtract(a: string, b: string): string {
  const scale = (v: string) => {
    const [i, f = ""] = v.replace("-", "").split(".");
    const n = BigInt(`${i}${f.padEnd(3, "0").slice(0, 3)}`);
    return v.startsWith("-") ? -n : n;
  };
  const r = scale(a) - scale(b);
  const s = (r < 0n ? -r : r).toString().padStart(4, "0");
  return `${r < 0n ? "-" : ""}${s.slice(0, -3)}.${s.slice(-3)}`;
}
