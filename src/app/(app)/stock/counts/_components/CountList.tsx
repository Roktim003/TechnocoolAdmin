"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SelectField } from "@/components/ui/Field";
import { Notification } from "@/components/ui/Notification";
import { Pagination } from "@/components/ui/Pagination";
import { Tag } from "@/components/ui/Tag";
import { api, errorMessage, type Page } from "@/lib/api-client";
import { formatDateTime } from "@/shared/time/format";
import type { WarehouseDto } from "../../_components/types";
import { COUNT_STATUS_LABEL, COUNT_STATUS_TAG, SCOPE_LABEL, type CountSummaryDto } from "./count-types";
import styles from "../../_components/stock.module.css";

export function CountList({ warehouses }: { warehouses: WarehouseDto[] }) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<Page<CountSummaryDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await api<Page<CountSummaryDto>>("/stock-counts", { query: { page, pageSize, status, warehouseId } }));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<CountSummaryDto>[] = [
    {
      key: "number",
      header: "Number",
      render: (c) => (
        <Link href={`/stock/counts/${c.id}`} className={styles.mono}>
          {c.number}
        </Link>
      ),
    },
    { key: "wh", header: "Warehouse", render: (c) => c.warehouse.name },
    { key: "scope", header: "Scope", render: (c) => `${SCOPE_LABEL[c.scope] ?? c.scope}${c.blindCount ? " · blind" : ""}` },
    { key: "progress", header: "Counted", align: "end", render: (c) => <span className={styles.num}>{c.progress.counted} / {c.progress.total}</span> },
    { key: "status", header: "Status", render: (c) => <Tag kind={COUNT_STATUS_TAG[c.status]}>{COUNT_STATUS_LABEL[c.status]}</Tag> },
    { key: "started", header: "Started", render: (c) => <span className={styles.nowrap}>{formatDateTime(c.startedAt)}</span> },
    { key: "by", header: "Created by", render: (c) => c.createdBy.name },
    { key: "adj", header: "Adjustment", render: (c) => (c.adjustmentEntry ? <Link href={`/stock/${c.adjustmentEntry.id}`} className={styles.mono}>{c.adjustmentEntry.number}</Link> : "—") },
  ];

  return (
    <div className={styles.stack}>
      {error ? <Notification kind="error">{error}</Notification> : null}
      <DataTable
        caption="Stock counts"
        columns={columns}
        rows={result?.data ?? []}
        rowKey={(c) => c.id}
        loading={loading}
        onRowClick={(c) => router.push(`/stock/counts/${c.id}`)}
        rowLabel={(c) => `Open ${c.number}`}
        emptyMessage="No stock counts yet."
        toolbar={
          <div className={styles.toolbar}>
            <SelectField label="Status" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} fieldClassName={styles.filter}>
              <option value="">All statuses</option>
              {Object.entries(COUNT_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </SelectField>
            <SelectField label="Warehouse" value={warehouseId} onChange={(e) => (setWarehouseId(e.target.value), setPage(1))} fieldClassName={styles.filter}>
              <option value="">All my warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </SelectField>
          </div>
        }
        footer={result ? <Pagination page={page} pageSize={pageSize} total={result.meta.total} onChange={(p, s) => (setPage(p), setPageSize(s))} /> : null}
      />
    </div>
  );
}
