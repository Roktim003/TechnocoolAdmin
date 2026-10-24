"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SelectField, TextField } from "@/components/ui/Field";
import { Notification } from "@/components/ui/Notification";
import { Pagination } from "@/components/ui/Pagination";
import { Tag } from "@/components/ui/Tag";
import { api, download, errorMessage, ApiError, type Page } from "@/lib/api-client";
import { formatMoney } from "@/shared/time/format";
import { ProductThumb } from "./ProductThumb";
import { STATUS_LABEL, type CatalogCaps, type CatalogDto, type CategoryDto, type ProductSummaryDto } from "./types";
import styles from "./catalog.module.css";

interface Props {
  caps: CatalogCaps;
  initialCatalogId: string | null;
  initialQuery: string;
}

export function CatalogBrowser({ caps, initialCatalogId, initialQuery }: Props) {
  const router = useRouter();
  const [catalogs, setCatalogs] = useState<CatalogDto[] | null>(null);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [catalogId, setCatalogId] = useState<string | null>(initialCatalogId);
  const [q, setQ] = useState(initialQuery);
  const [debouncedQ, setDebouncedQ] = useState(initialQuery);
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<Page<ProductSummaryDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newCatalog, setNewCatalog] = useState("");
  const [newCatalogError, setNewCatalogError] = useState<string | undefined>();
  const [exporting, setExporting] = useState(false);

  const loadCatalogs = useCallback(async () => {
    const list = (await api<{ data: CatalogDto[] }>("/catalogs")).data;
    setCatalogs(list);
    return list;
  }, []);

  useEffect(() => {
    loadCatalogs()
      .then((list) => setCatalogId((current) => (current && list.some((c) => c.id === current) ? current : (list.find((c) => c.isActive) ?? list[0])?.id ?? null)))
      .catch((err) => setError(errorMessage(err)));
    api<{ data: CategoryDto[] }>("/categories")
      .then((r) => setCategories(r.data))
      .catch(() => undefined);
  }, [loadCatalogs]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const filters = { catalogId: catalogId ?? undefined, q: debouncedQ, categoryId, status, source };

  const load = useCallback(async () => {
    if (!catalogId) return;
    setLoading(true);
    try {
      setResult(await api<Page<ProductSummaryDto>>("/products", { query: { page, pageSize, sort: "name", catalogId, q: debouncedQ, categoryId, status, source } }));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [catalogId, page, pageSize, debouncedQ, categoryId, status, source]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectCatalog(id: string) {
    setCatalogId(id);
    setPage(1);
    const url = new URL(window.location.href);
    url.searchParams.set("catalog", id);
    window.history.replaceState(null, "", url);
  }

  async function addCatalog() {
    if (!newCatalog.trim()) return setNewCatalogError("Enter a name.");
    try {
      const created = (await api<{ data: CatalogDto }>("/catalogs", { method: "POST", body: { name: newCatalog.trim() } })).data;
      setAdding(false);
      setNewCatalog("");
      setNewCatalogError(undefined);
      await loadCatalogs();
      selectCatalog(created.id);
    } catch (err) {
      setNewCatalogError(err instanceof ApiError ? (err.fieldErrors().name ?? err.message) : errorMessage(err));
    }
  }

  async function exportList() {
    setExporting(true);
    try {
      await download("/products/export", { ...filters, sort: "name" }, "products.xlsx");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  const selected = catalogs?.find((c) => c.id === catalogId);
  const filtered = !!(debouncedQ || categoryId || status || source);

  const columns: Column<ProductSummaryDto>[] = [
    { key: "photo", header: <span className="visually-hidden">Photo</span>, render: (p) => <ProductThumb src={p.thumbnailUrl} alt={p.name} /> },
    { key: "code", header: "Code", render: (p) => <span className={styles.mono}>{p.code}</span> },
    {
      key: "name",
      header: "Item name",
      render: (p) => (
        <Link href={`/catalog/${p.id}`} className={styles.nameCell}>
          {p.name}
        </Link>
      ),
    },
    { key: "model", header: "Model", render: (p) => <span className={styles.nowrap}>{p.model ?? "—"}</span> },
    { key: "category", header: "Category", render: (p) => <span className={styles.nowrap}>{p.category.name}</span> },
    { key: "unit", header: "Unit", render: (p) => p.unit.code },
    { key: "price", header: "Selling price", align: "end", render: (p) => <span className={styles.money}>{formatMoney(p.sellingPrice)}</span> },
    ...(caps.seeCost ? [{ key: "cost", header: "Purchase cost", align: "end" as const, render: (p: ProductSummaryDto) => <span className={styles.money}>{formatMoney(p.purchaseCost)}</span> }] : []),
    { key: "status", header: "Status", render: (p) => <Tag kind={p.status === "ACTIVE" ? "green" : "gray"}>{STATUS_LABEL[p.status]}</Tag> },
  ];

  return (
    <>
      {error ? (
        <Notification kind="error" title="Something went wrong" onClose={() => setError(null)} className={styles.notice}>
          {error}
        </Notification>
      ) : null}

      <div className={styles.cards} role="radiogroup" aria-label="Catalog">
        {(catalogs ?? []).map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={c.id === catalogId}
            className={`${styles.card} ${c.id === catalogId ? styles.cardSelected : ""}`}
            onClick={() => selectCatalog(c.id)}
          >
            <span className={styles.cardName}>{c.name}</span>
            <span className={styles.cardCount}>
              {c.productCount} product{c.productCount === 1 ? "" : "s"}
              {c.isActive ? "" : " · Inactive"}
            </span>
          </button>
        ))}
        {caps.canManage ? (
          adding ? (
            <form
              className={styles.cardForm}
              onSubmit={(e) => {
                e.preventDefault();
                void addCatalog();
              }}
            >
              <TextField label="Catalog name" value={newCatalog} onChange={(e) => setNewCatalog(e.target.value)} error={newCatalogError} placeholder="e.g. Gree" autoFocus />
              <div className={styles.cardFormActions}>
                <Button type="submit" size="sm">
                  Add
                </Button>
                <Button
                  kind="ghost"
                  size="sm"
                  onClick={() => {
                    setAdding(false);
                    setNewCatalog("");
                    setNewCatalogError(undefined);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <button type="button" className={`${styles.card} ${styles.cardAdd}`} onClick={() => setAdding(true)}>
              + Add catalog
            </button>
          )
        ) : null}
      </div>

      <DataTable
        caption={selected ? `${selected.name} products` : "Products"}
        columns={columns}
        rows={result?.data ?? []}
        rowKey={(p) => p.id}
        loading={loading}
        onRowClick={(p) => router.push(`/catalog/${p.id}`)}
        rowLabel={(p) => `${p.code} ${p.name}`}
        emptyMessage={filtered ? "No products match these filters." : "No products in this catalog yet. Use “+ Add product” to create the first one."}
        toolbar={
          <div className={styles.toolbar}>
            <TextField label="Search" type="search" placeholder="Name, code, model or barcode" value={q} onChange={(e) => setQ(e.target.value)} fieldClassName={styles.search} />
            <SelectField
              label="Category"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
              fieldClassName={styles.filter}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              fieldClassName={styles.filter}
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="DISCONTINUED">Discontinued</option>
            </SelectField>
            <SelectField
              label="Source"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setPage(1);
              }}
              fieldClassName={styles.filter}
            >
              <option value="">All sources</option>
              <option value="IMPORTED">Imported</option>
              <option value="LOCAL">Local</option>
            </SelectField>
            {caps.canManage ? (
              <div className={styles.toolbarActions}>
                <Button kind="secondary" onClick={exportList} disabled={exporting || !catalogId}>
                  {exporting ? "Exporting…" : "Export"}
                </Button>
                <Link href="/catalog/import" className={styles.secondaryLink}>
                  Import
                </Link>
                <Link href="/catalog/settings" className={styles.secondaryLink}>
                  Settings
                </Link>
              </div>
            ) : null}
          </div>
        }
        footer={
          result ? (
            <Pagination
              page={result.meta.page}
              pageSize={result.meta.pageSize}
              total={result.meta.total}
              onChange={(p, s) => {
                setPage(p);
                setPageSize(s);
              }}
            />
          ) : null
        }
      />
    </>
  );
}
