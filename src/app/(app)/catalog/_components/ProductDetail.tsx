"use client";

/* eslint-disable @next/next/no-img-element -- photos come from the authenticated API proxy */
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { Pagination } from "@/components/ui/Pagination";
import { Tabs } from "@/components/ui/Tabs";
import { Tag } from "@/components/ui/Tag";
import { api, errorMessage, type Page } from "@/lib/api-client";
import { formatDateTime, formatMoney } from "@/shared/time/format";
import { PriceHistoryTable } from "../../purchases/_components/PriceHistoryTable";
import { SOURCE_LABEL, STATUS_LABEL, type CatalogCaps, type ProductDto } from "./types";
import styles from "./catalog.module.css";

interface AuditRow {
  id: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string; username: string } | null;
}

const ACTIONS: Record<string, string> = {
  "product.create": "Created",
  "product.update": "Edited",
  "product.discontinue": "Discontinued",
  "product.reactivate": "Reactivated",
  "product.photo_add": "Photos added",
  "product.photo_update": "Photos rearranged",
  "product.photo_remove": "Photo removed",
};

const FIELD_LABELS: Record<string, string> = {
  name: "Item name",
  catalog: "Brand",
  model: "Model",
  category: "Category",
  unit: "Unit",
  purchaseCost: "Purchase cost",
  sellingPrice: "Selling price",
  purchaseUnit: "Purchase unit",
  purchaseUnitFactor: "Conversion factor",
  minStockLevel: "Min stock level",
  barcode: "Barcode",
  trackSerial: "Track serial numbers",
  warrantyMonths: "Warranty (months)",
  defaultSupplierName: "Default supplier",
  source: "Source",
  countryOfOrigin: "Country of origin",
  hsCode: "HS code",
  capacity: "Capacity",
  refrigerant: "Refrigerant",
  powerSupply: "Power supply",
  dimensionsWeight: "Dimensions / weight",
  specifications: "Specifications",
  status: "Status",
};

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));

function Changes({ row }: { row: AuditRow }) {
  if (row.action === "product.create") return <span>{row.after?.importedFrom ? `Imported from ${String(row.after.importedFrom)}` : "Product created"}</span>;
  if (row.action.startsWith("product.photo_")) {
    const n = Array.isArray(row.after?.photos) ? (row.after.photos as unknown[]).length : null;
    return <span>{row.action === "product.photo_add" && n ? `${n} photo${n === 1 ? "" : "s"} added` : ACTIONS[row.action]}</span>;
  }
  const before = row.before ?? {};
  const after = row.after ?? {};
  // Keys missing from both sides (e.g. purchaseCost stripped for this role) are skipped.
  const keys = Object.keys(FIELD_LABELS).filter((k) => (k in before || k in after) && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (!keys.length) return <span>No visible changes</span>;
  return (
    <ul className={styles.changes}>
      {keys.map((k) => (
        <li key={k}>
          {FIELD_LABELS[k]}: <span className={styles.strike}>{show(before[k])}</span> → {show(after[k])}
        </li>
      ))}
    </ul>
  );
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? styles.full : undefined}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function History({ productId }: { productId: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<Page<AuditRow> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Page<AuditRow>>(`/products/${productId}/history`, { query: { page, pageSize } })
      .then(setResult)
      .catch((err) => setError(errorMessage(err)));
  }, [productId, page, pageSize]);

  const columns: Column<AuditRow>[] = [
    { key: "when", header: "When", render: (r) => <span className={styles.nowrap}>{formatDateTime(r.createdAt)}</span> },
    { key: "who", header: "Who", render: (r) => (r.user ? r.user.name : "System") },
    { key: "what", header: "What", render: (r) => <Tag kind={r.action === "product.discontinue" ? "gray" : r.action === "product.create" ? "green" : "blue"}>{ACTIONS[r.action] ?? r.action}</Tag> },
    { key: "changes", header: "Changes", render: (r) => <Changes row={r} /> },
  ];

  return (
    <>
      {error ? <Notification kind="error" title="Could not load history">{error}</Notification> : null}
      <DataTable
        caption="Product history"
        columns={columns}
        rows={result?.data ?? []}
        rowKey={(r) => r.id}
        loading={!result && !error}
        emptyMessage="No history yet."
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

export function ProductDetail({ caps, initial, saved, photoError }: { caps: CatalogCaps; initial: ProductDto; saved: boolean; photoError: string | null }) {
  const [p, setP] = useState(initial);
  const [tab, setTab] = useState<"details" | "history" | "prices">("details");
  const [photoIndex, setPhotoIndex] = useState(() => Math.max(0, initial.photos.findIndex((ph) => ph.isPrimary)));
  const [notice, setNotice] = useState<{ kind: "success" | "error" | "warning"; title: string; message?: string } | null>(
    photoError ? { kind: "warning", title: "Product saved, but photos were not uploaded", message: `${photoError} Open Edit to try again.` } : saved ? { kind: "success", title: "Product saved" } : null,
  );
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (saved || photoError) window.history.replaceState(null, "", `/catalog/${initial.id}`);
  }, [saved, photoError, initial.id]);

  const changeStatus = useCallback(
    async (action: "discontinue" | "reactivate") => {
      setBusy(true);
      try {
        setP((await api<{ data: ProductDto }>(`/products/${p.id}/${action}`, { method: "POST" })).data);
        setNotice({ kind: "success", title: action === "discontinue" ? "Product discontinued" : "Product reactivated", message: action === "discontinue" ? "It stays in history but can’t be picked in new entries." : undefined });
      } catch (err) {
        setNotice({ kind: "error", title: "Could not change status", message: errorMessage(err) });
      } finally {
        setBusy(false);
        setConfirm(false);
      }
    },
    [p.id],
  );

  const photo = p.photos[photoIndex] ?? p.photos[0];

  return (
    <>
      <div className={styles.detailHeader}>
        <div>
          <p className={styles.breadcrumb}>
            <Link href={`/catalog?catalog=${p.catalog.id}`}>Product catalog</Link> / {p.catalog.name}
          </p>
          <h1 className={styles.detailTitle}>
            {p.name}
            <Tag kind={p.status === "ACTIVE" ? "green" : "gray"}>{STATUS_LABEL[p.status]}</Tag>
          </h1>
          <p className={styles.detailSub}>
            <span className={styles.mono}>{p.code}</span>
            {p.model ? ` · Model ${p.model}` : ""}
          </p>
        </div>
        {caps.canManage ? (
          <div className={styles.detailActions}>
            {p.status === "ACTIVE" ? (
              <Button kind="danger" onClick={() => setConfirm(true)} disabled={busy}>
                Discontinue
              </Button>
            ) : (
              <Button kind="secondary" onClick={() => changeStatus("reactivate")} disabled={busy}>
                Reactivate
              </Button>
            )}
            <Link href={`/catalog/${p.id}/edit`} className={styles.primaryLink}>
              Edit
            </Link>
          </div>
        ) : null}
      </div>

      {notice ? (
        <Notification kind={notice.kind} title={notice.title} onClose={() => setNotice(null)} className={styles.notice}>
          {notice.message}
        </Notification>
      ) : null}

      <Tabs
        label="Product sections"
        selected={tab}
        onChange={setTab}
        items={[
          { key: "details", label: "Details" },
          { key: "history", label: "History" },
          // Purchase prices are costs: only for roles with seeCost.
          ...(caps.seeCost ? [{ key: "prices" as const, label: "Price history" }] : []),
        ]}
      />

      {tab === "details" ? (
        <div className={styles.detailLayout} role="tabpanel">
          <section className={styles.gallery} aria-label="Photos">
            <div className={styles.galleryMain}>
              {photo ? (
                <a href={photo.url} target="_blank" rel="noreferrer">
                  <img src={photo.url} alt={p.name} />
                </a>
              ) : (
                <span>No photo</span>
              )}
            </div>
            {p.photos.length > 1 ? (
              <div className={styles.galleryThumbs}>
                {p.photos.map((ph, i) => (
                  <button
                    key={ph.id}
                    type="button"
                    className={`${styles.galleryThumb} ${ph.id === photo?.id ? styles.galleryThumbActive : ""}`}
                    onClick={() => setPhotoIndex(i)}
                    aria-label={`Photo ${i + 1}${ph.isPrimary ? " (primary)" : ""}`}
                  >
                    <img src={ph.thumbnailUrl} alt="" />
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <div className={styles.groups}>
            <section className={styles.section} aria-labelledby="d-basic">
              <h2 id="d-basic" className={styles.sectionTitle}>
                Basic details
              </h2>
              <dl className={styles.dl}>
                <Field label="Item name">{p.name}</Field>
                <Field label="Code / SKU">
                  <span className={styles.mono}>{p.code}</span>
                </Field>
                <Field label="Brand (catalog)">{p.catalog.name}</Field>
                <Field label="Model number">{show(p.model)}</Field>
                <Field label="Category">{p.category.name}</Field>
                <Field label="Unit of measure">
                  {p.unit.code} — {p.unit.name}
                </Field>
              </dl>
            </section>

            <section className={styles.section} aria-labelledby="d-price">
              <h2 id="d-price" className={styles.sectionTitle}>
                Price
              </h2>
              <dl className={styles.dl}>
                {caps.seeCost ? <Field label="Purchase cost">{formatMoney(p.purchaseCost)}</Field> : null}
                <Field label="Selling price">{formatMoney(p.sellingPrice)}</Field>
              </dl>
            </section>

            <section className={styles.section} aria-labelledby="d-optional">
              <h2 id="d-optional" className={styles.sectionTitle}>
                Optional details
              </h2>
              <dl className={styles.dl}>
                <Field label="Min stock level">{show(p.minStockLevel)}</Field>
                <Field label="Barcode">{p.barcode ? <span className={styles.mono}>{p.barcode}</span> : "—"}</Field>
                <Field label="Warranty">{p.warrantyMonths === null ? "—" : `${p.warrantyMonths} months`}</Field>
                <Field label="Default supplier">{p.defaultSupplier ? <Link href={`/purchases/suppliers/${p.defaultSupplier.id}`}>{p.defaultSupplier.name}</Link> : show(p.defaultSupplierName)}</Field>
                <Field label="Source">{p.source ? SOURCE_LABEL[p.source] : "—"}</Field>
                <Field label="Country of origin">{show(p.countryOfOrigin)}</Field>
                <Field label="HS code">{show(p.hsCode)}</Field>
                <Field label="Capacity">{show(p.capacity)}</Field>
                <Field label="Refrigerant">{show(p.refrigerant)}</Field>
                <Field label="Power supply">{show(p.powerSupply)}</Field>
                <Field label="Dimensions / weight">{show(p.dimensionsWeight)}</Field>
                <Field label="Purchase unit">{p.purchaseUnit ? `1 ${p.purchaseUnit.code} = ${p.purchaseUnitFactor} ${p.unit.code}` : "Same as base unit"}</Field>
                <Field label="Track serial numbers">{p.trackSerial ? "Yes" : "No"}</Field>
                <Field label="Status">{STATUS_LABEL[p.status]}{p.discontinuedAt ? ` since ${formatDateTime(p.discontinuedAt)}` : ""}</Field>
                <Field label="Specifications / notes" wide>
                  <span className={styles.pre}>{show(p.specifications)}</span>
                </Field>
                <Field label="Created">
                  {formatDateTime(p.createdAt)}
                  {p.createdBy ? ` by ${p.createdBy.name}` : ""}
                </Field>
                <Field label="Last updated">
                  {formatDateTime(p.updatedAt)}
                  {p.updatedBy ? ` by ${p.updatedBy.name}` : ""}
                </Field>
              </dl>
            </section>
          </div>
        </div>
      ) : tab === "prices" ? (
        <div className={styles.panel} role="tabpanel">
          <PriceHistoryTable path={`/products/${p.id}/price-history`} show="supplier" />
        </div>
      ) : (
        <div className={styles.panel} role="tabpanel">
          <History productId={p.id} />
        </div>
      )}

      <Modal open={confirm} size="sm" label={p.code} title={`Discontinue ${p.name}?`} primaryText="Discontinue" primaryKind="danger" submitting={busy} onClose={() => setConfirm(false)} onSubmit={() => changeStatus("discontinue")}>
        <p>The product stays in history and reports, but can’t be picked in new stock entries, purchases or projects. You can reactivate it later.</p>
      </Modal>
    </>
  );
}
