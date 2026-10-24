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
import { formatAmount, formatQty, type WarehouseDto } from "../../stock/_components/types";
import { PO_STATUS_LABEL, PO_STATUS_TAG, PO_STATUSES, type PoDto, type PurchasesCaps, type SupplierDto } from "./types";
import { Progress } from "./Progress";
import styles from "../../stock/_components/stock.module.css";

interface Props {
  caps: PurchasesCaps;
  warehouses: WarehouseDto[];
  /** "pending": waiting for approval; "overdue": expected date passed, goods still due. */
  mode: "all" | "pending" | "overdue";
  onCount?: (n: number) => void;
  /** Fixed supplier (supplier detail page). */
  supplierId?: string;
}

export function PoList({ caps, warehouses, mode, onCount, supplierId: fixedSupplier }: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [type, setType] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [suppliers, setSuppliers] = useState<SupplierDto[]>([]);
  const [result, setResult] = useState<Page<PoDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fixedSupplier) api<{ data: SupplierDto[] }>("/suppliers", { query: { pageSize: 100 } }).then((r) => setSuppliers(r.data)).catch(() => undefined);
  }, [fixedSupplier]);

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
      const r = await api<Page<PoDto>>("/purchase-orders", {
        query: {
          page,
          pageSize,
          q: debouncedQ,
          status: mode === "pending" ? "PENDING_APPROVAL" : mode === "all" ? status : undefined,
          overdue: mode === "overdue" ? "true" : undefined,
          supplierId: fixedSupplier ?? supplierId,
          type,
          warehouseId,
          dateFrom,
          dateTo,
          sort: mode === "overdue" ? "expectedDeliveryDate" : mode === "pending" ? "createdAt" : undefined,
        },
      });
      setResult(r);
      onCount?.(r.meta.total);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedQ, status, supplierId, fixedSupplier, type, warehouseId, dateFrom, dateTo, mode, onCount]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<PoDto>[] = [
    {
      key: "number",
      header: "PO number",
      render: (p) => (
        <Link href={`/purchases/${p.id}`} className={styles.mono}>
          {p.displayNumber}
          {p.revision ? ` (rev ${p.revision})` : ""}
        </Link>
      ),
    },
    { key: "date", header: "Date", render: (p) => <span className={styles.nowrap}>{p.poDate}</span> },
    ...(fixedSupplier ? [] : [{ key: "supplier", header: "Supplier", render: (p: PoDto) => p.supplier.name }]),
    { key: "type", header: "Type", render: (p) => (p.type === "IMPORTED" ? <Tag kind="purple">Imported · {p.currency}</Tag> : <Tag kind="blue">Local</Tag>) },
    { key: "warehouse", header: "Deliver to", render: (p) => p.deliverTo.code },
    {
      key: "expected",
      header: "Expected",
      render: (p) => (
        <span className={`${styles.nowrap} ${p.overdue ? styles.negative : ""}`}>
          {p.expectedDeliveryDate ?? "—"}
          {p.overdue ? " · overdue" : ""}
        </span>
      ),
    },
    ...(caps.seeCost
      ? [
          {
            key: "total",
            header: "Total",
            align: "end" as const,
            render: (p: PoDto) => (
              <span className={styles.num}>
                {p.type === "IMPORTED" ? formatAmount(p.total, p.currency) : formatMoney(p.total)}
                {p.type === "IMPORTED" && p.totalBdt ? <div className={styles.lineMeta}>≈ {formatMoney(p.totalBdt)}</div> : null}
              </span>
            ),
          },
        ]
      : []),
    {
      key: "received",
      header: "Received",
      render: (p) => (
        <span title={`${formatQty(p.progress.receivedQty)} of ${formatQty(p.progress.orderedQty)}`}>
          <Progress percent={p.progress.percent} />
        </span>
      ),
    },
    { key: "status", header: "Status", render: (p) => <Tag kind={PO_STATUS_TAG[p.status]}>{PO_STATUS_LABEL[p.status]}</Tag> },
    { key: "by", header: "Created by", render: (p) => <span className={styles.nowrap}>{p.createdBy.name}</span> },
  ];

  const toolbar = (
    <div className={styles.toolbar}>
      <TextField label="Search" placeholder="PO number, quote ref, supplier…" value={q} onChange={(e) => setQ(e.target.value)} fieldClassName={styles.search} />
      {mode === "all" ? (
        <SelectField label="Status" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} fieldClassName={styles.filter}>
          <option value="">All statuses</option>
          {PO_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PO_STATUS_LABEL[s]}
            </option>
          ))}
        </SelectField>
      ) : null}
      {fixedSupplier ? null : (
        <SelectField label="Supplier" value={supplierId} onChange={(e) => (setSupplierId(e.target.value), setPage(1))} fieldClassName={styles.filter}>
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
      )}
      <SelectField label="Type" value={type} onChange={(e) => (setType(e.target.value), setPage(1))} fieldClassName={styles.filter}>
        <option value="">Local and imported</option>
        <option value="LOCAL">Local</option>
        <option value="IMPORTED">Imported</option>
      </SelectField>
      <SelectField label="Deliver to" value={warehouseId} onChange={(e) => (setWarehouseId(e.target.value), setPage(1))} fieldClassName={styles.filter}>
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

  const empty =
    mode === "pending"
      ? "Nothing waiting for approval."
      : mode === "overdue"
        ? "No overdue purchase orders. POs show here when the expected delivery date has passed and goods are still due."
        : "No purchase orders match these filters.";

  return (
    <div className={styles.stack}>
      {error ? <Notification kind="error" title="Could not load purchase orders">{error}</Notification> : null}
      <DataTable
        columns={columns}
        rows={result?.data ?? []}
        rowKey={(p) => p.id}
        loading={loading}
        caption={mode === "pending" ? "Purchase orders pending approval" : mode === "overdue" ? "Overdue purchase orders" : "Purchase orders"}
        toolbar={toolbar}
        onRowClick={(p) => router.push(`/purchases/${p.id}`)}
        rowLabel={(p) => `Open ${p.displayNumber}`}
        emptyMessage={empty}
        footer={result ? <Pagination page={page} pageSize={pageSize} total={result.meta.total} onChange={(p, s) => (setPage(p), setPageSize(s))} /> : null}
      />
    </div>
  );
}
