"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SelectField, TextField } from "@/components/ui/Field";
import { Notification } from "@/components/ui/Notification";
import { Pagination } from "@/components/ui/Pagination";
import { Tag } from "@/components/ui/Tag";
import { api, errorMessage, type Page } from "@/lib/api-client";
import { formatMoney } from "@/shared/time/format";
import { ENTRY_TYPE_META, formatQty, STATUS_LABEL, STATUS_TAG, type EntryDto, type EntryType, type StockCaps, type WarehouseDto } from "./types";
import styles from "./stock.module.css";

interface Props {
  caps: StockCaps;
  warehouses: WarehouseDto[];
  /** "pending": entries waiting for the caller's verification. */
  mode: "all" | "pending";
  onCount?: (n: number) => void;
}

const party = (e: EntryDto) => e.supplier?.name ?? e.customer?.name ?? (e.project ? `${e.project.code} — ${e.project.name}` : e.toWarehouse ? `→ ${e.toWarehouse.name}` : "—");

export function EntryList({ caps, warehouses, mode, onCount }: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<Page<EntryDto> | null>(null);
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
      const r = await api<Page<EntryDto>>("/stock-entries", {
        query: { page, pageSize, q: debouncedQ, type, status: mode === "pending" ? undefined : status, warehouseId, dateFrom, dateTo, ...(mode === "pending" ? { awaitingMyApproval: "true", sort: "createdAt" } : {}) },
      });
      setResult(r);
      if (mode === "pending") onCount?.(r.meta.total);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedQ, type, status, warehouseId, dateFrom, dateTo, mode, onCount]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<EntryDto>[] = [
    {
      key: "number",
      header: "Number",
      render: (e) => (
        <Link href={`/stock/${e.id}`} className={styles.mono}>
          {e.displayNumber}
        </Link>
      ),
    },
    { key: "date", header: "Date", render: (e) => <span className={styles.nowrap}>{e.entryDate}</span> },
    { key: "type", header: "Type", render: (e) => <span className={styles.nowrap}>{e.typeLabel}</span> },
    { key: "warehouse", header: "Warehouse", render: (e) => e.warehouse.code },
    { key: "party", header: "Supplier / customer / project", render: (e) => party(e) },
    { key: "qty", header: "Items", align: "end", render: (e) => <span className={styles.num}>{e.itemCount} · {formatQty(e.totalQty)}</span> },
    {
      key: "total",
      header: "Value",
      align: "end",
      render: (e) => <span className={styles.num}>{e.type === "SALE" ? formatMoney(e.grandTotal) : caps.seeCost && e.costTotal !== undefined ? formatMoney(e.costTotal) : "—"}</span>,
    },
    { key: "status", header: "Status", render: (e) => <Tag kind={STATUS_TAG[e.status]}>{STATUS_LABEL[e.status]}</Tag> },
    { key: "by", header: "Created by", render: (e) => <span className={styles.nowrap}>{e.createdBy.name}</span> },
  ];

  const toolbar = (
    <div className={styles.toolbar}>
      <TextField label="Search" placeholder="Number, reference, party…" value={q} onChange={(e) => setQ(e.target.value)} fieldClassName={styles.search} />
      <SelectField label="Type" value={type} onChange={(e) => (setType(e.target.value), setPage(1))} fieldClassName={styles.filter}>
        <option value="">All types</option>
        {(Object.keys(ENTRY_TYPE_META) as EntryType[]).map((t) => (
          <option key={t} value={t}>
            {ENTRY_TYPE_META[t].label}
          </option>
        ))}
      </SelectField>
      {mode === "all" ? (
        <SelectField label="Status" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} fieldClassName={styles.filter}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </SelectField>
      ) : null}
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
  );

  return (
    <div className={styles.stack}>
      {error ? <Notification kind="error" title="Could not load entries">{error}</Notification> : null}
      <DataTable
        columns={columns}
        rows={result?.data ?? []}
        rowKey={(e) => e.id}
        loading={loading}
        caption={mode === "pending" ? "Entries waiting for your verification" : "Stock entries"}
        toolbar={toolbar}
        onRowClick={(e) => router.push(`/stock/${e.id}`)}
        rowLabel={(e) => `Open ${e.displayNumber}`}
        emptyMessage={mode === "pending" ? "Nothing to verify. Entries other people submit in your warehouses appear here." : "No entries match these filters."}
        footer={result ? <Pagination page={page} pageSize={pageSize} total={result.meta.total} onChange={(p, s) => (setPage(p), setPageSize(s))} /> : null}
      />
    </div>
  );
}
