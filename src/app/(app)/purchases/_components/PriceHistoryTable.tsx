"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Notification } from "@/components/ui/Notification";
import { Pagination } from "@/components/ui/Pagination";
import { Tag } from "@/components/ui/Tag";
import { api, errorMessage, type Page } from "@/lib/api-client";
import { formatMoney } from "@/shared/time/format";
import { formatAmount, formatQty } from "../../stock/_components/types";
import { PO_STATUS_LABEL, PO_STATUS_TAG, type PriceHistoryDto } from "./types";
import styles from "../../stock/_components/stock.module.css";

/**
 * Approved PO prices, newest first. `path` is a product's or a supplier's price-history endpoint;
 * `show` picks the other side's column. The API refuses it without seeCost (callers hide it).
 */
export function PriceHistoryTable({ path, show }: { path: string; show: "supplier" | "product" }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<Page<PriceHistoryDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await api<Page<PriceHistoryDto>>(path, { query: { page, pageSize } }));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [path, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<PriceHistoryDto>[] = [
    { key: "date", header: "PO date", render: (r) => <span className={styles.nowrap}>{r.poDate}</span> },
    {
      key: "po",
      header: "PO",
      render: (r) => (
        <Link href={`/purchases/${r.poId}`} className={styles.mono}>
          {r.poNumber}
        </Link>
      ),
    },
    show === "supplier"
      ? { key: "supplier", header: "Supplier", render: (r) => r.supplier.name }
      : {
          key: "product",
          header: "Product",
          render: (r) => (
            <>
              <span className={styles.mono}>{r.product.code}</span> {r.product.name}
            </>
          ),
        },
    { key: "qty", header: "Qty", align: "end", render: (r) => <span className={styles.num}>{formatQty(r.qty)}</span> },
    { key: "price", header: "Unit price", align: "end", render: (r) => <span className={styles.num}>{formatAmount(r.unitPrice, r.currency)}</span> },
    {
      key: "bdt",
      header: "Unit price (৳)",
      align: "end",
      render: (r) => (
        <span className={styles.num}>
          {formatMoney(r.unitPriceBdt)}
          {r.currency !== "BDT" ? <div className={styles.lineMeta}>@ {r.exchangeRate}</div> : null}
        </span>
      ),
    },
    { key: "status", header: "PO status", render: (r) => <Tag kind={PO_STATUS_TAG[r.status]}>{PO_STATUS_LABEL[r.status]}</Tag> },
  ];

  return (
    <div className={styles.stack}>
      {error ? <Notification kind="error">{error}</Notification> : null}
      <DataTable
        caption="Purchase price history"
        columns={columns}
        rows={result?.data ?? []}
        rowKey={(r) => `${r.poId}-${r.product.id}`}
        loading={loading}
        emptyMessage="No approved purchase orders yet."
        footer={result ? <Pagination page={page} pageSize={pageSize} total={result.meta.total} onChange={(p, s) => (setPage(p), setPageSize(s))} /> : null}
      />
    </div>
  );
}
