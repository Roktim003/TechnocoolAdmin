"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notification } from "@/components/ui/Notification";
import { Tabs } from "@/components/ui/Tabs";
import { Tag } from "@/components/ui/Tag";
import { api, errorMessage } from "@/lib/api-client";
import { formatMoney } from "@/shared/time/format";
import type { WarehouseDto } from "../../stock/_components/types";
import { PoList } from "./PoList";
import { PriceHistoryTable } from "./PriceHistoryTable";
import { SupplierFormModal } from "./SupplierFormModal";
import type { PurchasesCaps, SupplierDetailDto, SupplierDto } from "./types";
import styles from "../../stock/_components/stock.module.css";
import p from "./purchases.module.css";

export function SupplierDetail({ caps, initial, warehouses }: { caps: PurchasesCaps; initial: SupplierDetailDto; warehouses: WarehouseDto[] }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [tab, setTab] = useState<"orders" | "prices">("orders");
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  async function toggleActive() {
    try {
      const r = s.isActive ? await api<{ data: SupplierDto }>(`/suppliers/${s.id}/deactivate`, { method: "POST" }) : await api<{ data: SupplierDto }>(`/suppliers/${s.id}`, { method: "PATCH", body: { isActive: true } });
      setS((x) => ({ ...x, ...r.data }));
      setNotice({ kind: "success", message: r.data.isActive ? `${s.name} reactivated.` : `${s.name} deactivated. It can't be used on new POs or GRNs.` });
    } catch (err) {
      setNotice({ kind: "error", message: errorMessage(err) });
    }
  }

  const specs: [string, string | null][] = [
    ["Contact person", s.contactPerson],
    ["Phone", s.phone],
    ["Email", s.email],
    ["Address", s.address],
    ["Brands supplied", s.brandsSupplied],
    ["Payment terms", s.paymentTermsNote],
    ["Notes", s.notes],
  ];

  return (
    <>
      <div className={styles.breadcrumb}>
        <Link href="/purchases?tab=suppliers">Purchases · Suppliers</Link> / {s.code}
      </div>
      <div className={styles.detailHeader}>
        <div>
          <h1 className={styles.detailTitle}>
            {s.name}
            {s.type === "FOREIGN" ? <Tag kind="purple">Foreign · {s.defaultCurrency}</Tag> : <Tag kind="blue">Local</Tag>}
            {s.isActive ? null : <Tag kind="gray">Inactive</Tag>}
          </h1>
          <p className={styles.detailSub}>
            <span className={styles.mono}>{s.code}</span>
          </p>
        </div>
        <div className={styles.detailActions}>
          {caps.canCreate && s.isActive ? (
            <Link href={`/purchases/new?supplierId=${s.id}`}>
              <Button>New PO for this supplier</Button>
            </Link>
          ) : null}
          {caps.canFull ? (
            <>
              <Button kind="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button kind={s.isActive ? "danger" : "secondary"} onClick={toggleActive}>
                {s.isActive ? "Deactivate" : "Reactivate"}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className={styles.stack}>
        {notice ? (
          <Notification kind={notice.kind} onClose={() => setNotice(null)}>
            {notice.message}
          </Notification>
        ) : null}

        <div className={p.statGrid}>
          <Stat label="Open POs" value={String(s.stats.openPoCount)} />
          <Stat label="All POs" value={String(s.stats.poCount)} />
          <Stat label="Last purchase" value={s.stats.lastPurchaseDate ?? "—"} />
          <Stat label="Products (default supplier)" value={String(s.stats.productCount)} />
          {s.stats.totalOrderedBdt !== undefined ? <Stat label="Total ordered (৳)" value={formatMoney(s.stats.totalOrderedBdt)} /> : null}
        </div>

        <section className={styles.section} aria-labelledby="s-details">
          <h2 id="s-details" className={styles.sectionTitle} style={{ marginBottom: "var(--space-5)" }}>
            Details
          </h2>
          <dl className={styles.specs}>
            {specs.map(([label, v]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{v ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </section>

        <Tabs
          label="Supplier"
          selected={tab}
          onChange={setTab}
          items={[{ key: "orders", label: "Purchase orders" }, ...(caps.seeCost ? [{ key: "prices" as const, label: "Price history" }] : [])]}
        />
        <div className={styles.tabPanel}>
          {tab === "orders" ? <PoList caps={caps} warehouses={warehouses} mode="all" supplierId={s.id} /> : <PriceHistoryTable path={`/suppliers/${s.id}/price-history`} show="product" />}
        </div>
      </div>

      <SupplierFormModal
        open={editing}
        supplier={s}
        onClose={() => setEditing(false)}
        onSaved={(x) => {
          setEditing(false);
          setS((cur) => ({ ...cur, ...x }));
          setNotice({ kind: "success", message: "Supplier saved." });
          router.refresh();
        }}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={p.stat}>
      <div className={styles.muted}>{label}</div>
      <div className={p.statValue}>{value}</div>
    </div>
  );
}
