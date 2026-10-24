"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SelectField, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { Pagination } from "@/components/ui/Pagination";
import { Tag, type TagKind } from "@/components/ui/Tag";
import { api, errorMessage, type Page } from "@/lib/api-client";
import { formatDateTime } from "@/shared/time/format";
import { ENTRY_TYPE_META, SERIAL_STATUS_LABEL, type EntryType, type SerialDto, type WarehouseDto } from "../stock/_components/types";
import styles from "../stock/_components/stock.module.css";

interface HistoryRow {
  id: string;
  at: string;
  fromStatus: string | null;
  toStatus: string;
  entry: { id: string; number: string | null; type: EntryType } | null;
  fromWarehouse: string | null;
  toWarehouse: string | null;
}

const STATUS_TAG: Record<string, TagKind> = { IN_STOCK: "green", RESERVED: "yellow", IN_TRANSIT: "purple", ISSUED: "blue", SOLD: "blue", RETURNED_TO_SUPPLIER: "gray", WRITTEN_OFF: "gray", DAMAGED: "red" };

export function SerialsBrowser({ warehouses, initialProductId, initialQuery }: { warehouses: WarehouseDto[]; initialProductId: string | null; initialQuery: string }) {
  const [q, setQ] = useState(initialQuery);
  const [debouncedQ, setDebouncedQ] = useState(initialQuery);
  const [status, setStatus] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState(initialProductId ?? "");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<Page<SerialDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<(SerialDto & { history: HistoryRow[] }) | null>(null);

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
      setResult(await api<Page<SerialDto>>("/serials", { query: { page, pageSize, q: debouncedQ, status, warehouseId, productId } }));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedQ, status, warehouseId, productId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function show(s: SerialDto) {
    try {
      setOpen((await api<{ data: SerialDto & { history: HistoryRow[] } }>(`/serials/${s.id}`)).data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const where = (s: SerialDto) => s.warehouseCode ?? (s.projectCode ? `Project ${s.projectCode}` : (s.customerName ?? "—"));
  const columns: Column<SerialDto>[] = [
    { key: "serial", header: "Serial number", render: (s) => <span className={styles.mono}>{s.serial}</span> },
    {
      key: "product",
      header: "Product",
      render: (s) => (
        <span>
          <span className={styles.mono}>{s.productCode}</span> — {s.productName}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (s) => <Tag kind={STATUS_TAG[s.status] ?? "gray"}>{SERIAL_STATUS_LABEL[s.status] ?? s.status}</Tag> },
    { key: "where", header: "Where", render: where },
  ];

  return (
    <div className={styles.stack}>
      {error ? <Notification kind="error">{error}</Notification> : null}
      <DataTable
        caption="Serial numbers"
        columns={columns}
        rows={result?.data ?? []}
        rowKey={(s) => s.id}
        loading={loading}
        onRowClick={show}
        rowLabel={(s) => `History of ${s.serial}`}
        emptyMessage="No serial numbers found. They are recorded when serial-tracked products are received."
        toolbar={
          <div className={styles.toolbar}>
            <TextField label="Serial number" placeholder="Scan or type…" value={q} onChange={(e) => setQ(e.target.value)} fieldClassName={styles.search} />
            <SelectField label="Status" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} fieldClassName={styles.filter}>
              <option value="">Any status</option>
              {Object.entries(SERIAL_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </SelectField>
            <SelectField label="Warehouse" value={warehouseId} onChange={(e) => (setWarehouseId(e.target.value), setPage(1))} fieldClassName={styles.filter}>
              <option value="">Any</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </SelectField>
            {productId ? (
              <button type="button" className={styles.linkButton} onClick={() => (setProductId(""), setPage(1))}>
                Clear product filter
              </button>
            ) : null}
          </div>
        }
        footer={result ? <Pagination page={page} pageSize={pageSize} total={result.meta.total} onChange={(p, s) => (setPage(p), setPageSize(s))} /> : null}
      />

      <Modal open={!!open} title={open?.serial ?? ""} label={open ? `${open.productCode} — ${open.productName}` : undefined} onClose={() => setOpen(null)}>
        {open ? (
          <>
            <p style={{ marginBottom: "var(--space-5)" }}>
              <Tag kind={STATUS_TAG[open.status] ?? "gray"}>{SERIAL_STATUS_LABEL[open.status] ?? open.status}</Tag> {where(open)}
            </p>
            <ol className={styles.timeline}>
              {open.history.map((h) => (
                <li key={h.id}>
                  <div className={styles.timelineEvent}>
                    {SERIAL_STATUS_LABEL[h.toStatus] ?? h.toStatus}
                    {h.toWarehouse ? ` · ${h.toWarehouse}` : ""}
                  </div>
                  <div className={styles.muted}>
                    {formatDateTime(h.at)}
                    {h.entry ? (
                      <>
                        {" "}
                        · <Link href={`/stock/${h.entry.id}`}>{h.entry.number}</Link> ({ENTRY_TYPE_META[h.entry.type].label})
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
