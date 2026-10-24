"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SelectField, TextField } from "@/components/ui/Field";
import { Notification } from "@/components/ui/Notification";
import { Pagination } from "@/components/ui/Pagination";
import { api, download, errorMessage, type Page } from "@/lib/api-client";
import { formatQty, newKey, type StockCaps, type WarehouseDto } from "./types";
import styles from "./stock.module.css";

interface Row {
  product: { id: string; code: string; name: string; unitCode: string; catalogName: string; categoryName: string };
  warehouses: { warehouseId: string; code: string; available: string }[];
  totalAvailable: string;
  minStockLevel: string;
  shortBy: string;
  suggestedQty: string;
}

interface FromLowStock {
  created: { id: string; displayNumber: string; supplier: { name: string }; lines: unknown[] }[];
  unassigned: { product: { id: string; code: string; name: string }; suggestedQty: string }[];
}

export function LowStockList({ caps, warehouses }: { caps: StockCaps; warehouses: WarehouseDto[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [made, setMade] = useState<FromLowStock | null>(null);
  const mine = warehouses.filter((w) => caps.warehouseIds.includes(w.id));
  const [catalogs, setCatalogs] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [catalogId, setCatalogId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [result, setResult] = useState<Page<Row> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api<{ data: { id: string; name: string }[] }>("/catalogs").then((r) => setCatalogs(r.data)).catch(() => undefined);
    api<{ data: { id: string; name: string }[] }>("/categories").then((r) => setCategories(r.data)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const query = { q: debouncedQ, catalogId, categoryId, warehouseId };
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await api<Page<Row>>("/stock/low-stock", { query: { page, pageSize, q: debouncedQ, catalogId, categoryId, warehouseId } }));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedQ, catalogId, categoryId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Draft POs from the chosen products: one per default supplier (prices from the last PO). */
  async function createPo(productIds: string[]) {
    setCreating(true);
    setMade(null);
    try {
      const r = (await api<{ data: FromLowStock }>("/purchase-orders/from-low-stock", { method: "POST", body: { productIds, warehouseId: warehouseId || null }, headers: { "Idempotency-Key": newKey() } })).data;
      setSelected(new Set());
      if (r.created.length === 1 && !r.unassigned.length) return router.push(`/purchases/${r.created[0]!.id}/edit`);
      setMade(r);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  const rows = result?.data ?? [];
  const toggle = (id: string) => setSelected((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.product.id));

  const shown = warehouseId ? mine.filter((w) => w.id === warehouseId) : mine;
  const columns: Column<Row>[] = [
    ...(caps.canCreatePo
      ? [
          {
            key: "select",
            header: (
              <input
                type="checkbox"
                aria-label="Select all on this page"
                checked={allOnPage}
                onChange={() => setSelected((s) => (allOnPage ? new Set([...s].filter((x) => !rows.some((r) => r.product.id === x))) : new Set([...s, ...rows.map((r) => r.product.id)])))}
              />
            ),
            render: (r: Row) => <input type="checkbox" aria-label={`Select ${r.product.code}`} checked={selected.has(r.product.id)} onChange={() => toggle(r.product.id)} />,
          },
        ]
      : []),
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
    { key: "brand", header: "Brand", render: (r) => r.product.catalogName },
    ...shown.map((w) => ({
      key: `wh-${w.id}`,
      header: `Avail. ${w.code}`,
      align: "end" as const,
      render: (r: Row) => <span className={styles.num}>{formatQty(r.warehouses.find((x) => x.warehouseId === w.id)?.available ?? "0")}</span>,
    })),
    { key: "total", header: warehouseId ? "Available" : "Total available", align: "end", render: (r) => <span className={styles.num}>{formatQty(r.totalAvailable)} {r.product.unitCode}</span> },
    { key: "min", header: "Minimum", align: "end", render: (r) => <span className={styles.num}>{formatQty(r.minStockLevel)}</span> },
    { key: "short", header: "Short by", align: "end", render: (r) => <strong className={`${styles.num} ${styles.negative}`}>{formatQty(r.shortBy)}</strong> },
    { key: "suggested", header: "Suggested reorder", align: "end", render: (r) => <span className={styles.num}>{formatQty(r.suggestedQty)}</span> },
    ...(caps.canCreatePo
      ? [
          {
            key: "po",
            header: <span className="visually-hidden">Create PO</span>,
            align: "end" as const,
            render: (r: Row) => (
              <Button kind="ghost" size="sm" onClick={() => createPo([r.product.id])} disabled={creating}>
                Create PO
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className={styles.stack}>
      {error ? <Notification kind="error">{error}</Notification> : null}
      {made ? (
        <Notification kind={made.created.length ? "success" : "warning"} title={made.created.length ? `${made.created.length} draft purchase order${made.created.length > 1 ? "s" : ""} created` : "No purchase orders created"} onClose={() => setMade(null)}>
          {made.created.length ? (
            <div>
              {made.created.map((p, i) => (
                <span key={p.id}>
                  {i ? ", " : ""}
                  <Link href={`/purchases/${p.id}/edit`} className={styles.mono}>
                    {p.displayNumber}
                  </Link>{" "}
                  ({p.supplier.name}, {p.lines.length} item{p.lines.length > 1 ? "s" : ""})
                </span>
              ))}
              . Check quantities and prices, then submit them for approval.
            </div>
          ) : null}
          {made.unassigned.length ? (
            <div style={{ marginTop: made.created.length ? "var(--space-2)" : 0 }}>
              No active default supplier for {made.unassigned.map((u) => u.product.code).join(", ")}. Set one on the product, or <Link href="/purchases/new">create a PO</Link> and pick the supplier.
            </div>
          ) : null}
        </Notification>
      ) : null}
      <DataTable
        caption="Products below their minimum"
        columns={columns}
        rows={result?.data ?? []}
        rowKey={(r) => r.product.id}
        loading={loading}
        emptyMessage="Nothing is below its minimum level. Set minimum levels on products in the catalog to get alerts."
        toolbar={
          <div className={styles.toolbar}>
            <TextField label="Search" placeholder="Code, name, model…" value={q} onChange={(e) => setQ(e.target.value)} fieldClassName={styles.search} />
            <SelectField label="Brand" value={catalogId} onChange={(e) => (setCatalogId(e.target.value), setPage(1))} fieldClassName={styles.filter}>
              <option value="">All brands</option>
              {catalogs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Category" value={categoryId} onChange={(e) => (setCategoryId(e.target.value), setPage(1))} fieldClassName={styles.filter}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Warehouse" value={warehouseId} onChange={(e) => (setWarehouseId(e.target.value), setPage(1))} fieldClassName={styles.filter} helper={warehouseId ? undefined : "Totals: all warehouses"}>
              <option value="">All warehouses</option>
              {mine.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </SelectField>
            <div className={styles.toolbarActions}>
              {caps.canCreatePo ? (
                <Button onClick={() => createPo([...selected])} disabled={!selected.size || creating} title="One draft PO per default supplier">
                  {creating ? "Creating…" : `Create PO${selected.size ? ` (${selected.size})` : ""}`}
                </Button>
              ) : null}
              <Button
                kind="secondary"
                disabled={exporting}
                onClick={async () => {
                  setExporting(true);
                  try {
                    await download("/stock/low-stock/export", query, "low-stock.xlsx");
                  } catch (err) {
                    setError(errorMessage(err));
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                {exporting ? "Exporting…" : "Export to Excel"}
              </Button>
            </div>
          </div>
        }
        footer={result ? <Pagination page={page} pageSize={pageSize} total={result.meta.total} onChange={(p, s) => (setPage(p), setPageSize(s))} /> : null}
      />
    </div>
  );
}
