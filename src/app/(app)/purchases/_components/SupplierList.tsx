"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Checkbox, SelectField, TextField } from "@/components/ui/Field";
import { Notification } from "@/components/ui/Notification";
import { Pagination } from "@/components/ui/Pagination";
import { Tag } from "@/components/ui/Tag";
import { api, errorMessage, type Page } from "@/lib/api-client";
import { SupplierFormModal } from "./SupplierFormModal";
import type { PurchasesCaps, SupplierDto } from "./types";
import styles from "../../stock/_components/stock.module.css";

export function SupplierList({ caps }: { caps: PurchasesCaps }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [type, setType] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<Page<SupplierDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [adding, setAdding] = useState(false);

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
      setResult(await api<Page<SupplierDto>>("/suppliers", { query: { page, pageSize, q: debouncedQ, type, isActive: showInactive ? undefined : "true" } }));
    } catch (err) {
      setNotice({ kind: "error", message: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedQ, type, showInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<SupplierDto>[] = [
    { key: "code", header: "Code", render: (s) => <span className={styles.mono}>{s.code}</span> },
    {
      key: "name",
      header: "Name",
      render: (s) => (
        <>
          <Link href={`/purchases/suppliers/${s.id}`} className={styles.link}>
            {s.name}
          </Link>{" "}
          {s.isActive ? null : <Tag kind="gray">Inactive</Tag>}
        </>
      ),
    },
    { key: "type", header: "Type", render: (s) => (s.type === "FOREIGN" ? <Tag kind="purple">Foreign · {s.defaultCurrency}</Tag> : <Tag kind="blue">Local</Tag>) },
    { key: "brands", header: "Brands supplied", render: (s) => s.brandsSupplied ?? "—" },
    { key: "contact", header: "Contact", render: (s) => [s.contactPerson, s.phone].filter(Boolean).join(" · ") || "—" },
    { key: "open", header: "Open POs", align: "end", render: (s) => <span className={styles.num}>{s.openPoCount}</span> },
  ];

  return (
    <div className={styles.stack}>
      {notice ? (
        <Notification kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.message}
        </Notification>
      ) : null}
      <DataTable
        caption="Suppliers"
        columns={columns}
        rows={result?.data ?? []}
        rowKey={(s) => s.id}
        loading={loading}
        onRowClick={(s) => router.push(`/purchases/suppliers/${s.id}`)}
        rowLabel={(s) => `Open ${s.name}`}
        emptyMessage="No suppliers match."
        toolbar={
          <div className={styles.toolbar}>
            <TextField label="Search" placeholder="Name, code, brand, contact…" value={q} onChange={(e) => setQ(e.target.value)} fieldClassName={styles.search} />
            <SelectField label="Type" value={type} onChange={(e) => (setType(e.target.value), setPage(1))} fieldClassName={styles.filter}>
              <option value="">Local and foreign</option>
              <option value="LOCAL">Local</option>
              <option value="FOREIGN">Foreign</option>
            </SelectField>
            <Checkbox label="Show inactive" checked={showInactive} onChange={(e) => (setShowInactive(e.target.checked), setPage(1))} />
            {caps.canFull ? (
              <div className={styles.toolbarActions}>
                <Button onClick={() => setAdding(true)}>+ Add supplier</Button>
              </div>
            ) : null}
          </div>
        }
        footer={result ? <Pagination page={page} pageSize={pageSize} total={result.meta.total} onChange={(p, s) => (setPage(p), setPageSize(s))} /> : null}
      />
      <SupplierFormModal
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(s) => {
          setAdding(false);
          setNotice({ kind: "success", message: `${s.name} added as ${s.code}.` });
          void load();
        }}
      />
    </div>
  );
}
