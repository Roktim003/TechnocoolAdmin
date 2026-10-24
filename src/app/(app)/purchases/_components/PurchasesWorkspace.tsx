"use client";

import { useCallback, useEffect, useState } from "react";
import { Notification } from "@/components/ui/Notification";
import { Tabs } from "@/components/ui/Tabs";
import { api } from "@/lib/api-client";
import type { WarehouseDto } from "../../stock/_components/types";
import { PoList } from "./PoList";
import { SupplierList } from "./SupplierList";
import type { PurchasesCaps } from "./types";
import styles from "../../stock/_components/stock.module.css";

export type PurchasesTab = "orders" | "pending" | "overdue" | "suppliers";

const SAVED: Record<string, string> = {
  lowStock: "Draft purchase orders were created from the low-stock list. Check prices and quantities, then submit them.",
};

export function PurchasesWorkspace({ caps, warehouses, initialTab, saved }: { caps: PurchasesCaps; warehouses: WarehouseDto[]; initialTab: PurchasesTab; saved: string | null }) {
  const [tab, setTab] = useState<PurchasesTab>(initialTab);
  const [pending, setPending] = useState<number | null>(null);
  const [overdue, setOverdue] = useState<number | null>(null);
  const [notice, setNotice] = useState(saved ? SAVED[saved] ?? null : null);

  useEffect(() => {
    if (caps.canApprove)
      api<{ meta: { total: number } }>("/purchase-orders", { query: { status: "PENDING_APPROVAL", pageSize: 1 } })
        .then((r) => setPending(r.meta.total))
        .catch(() => undefined);
    api<{ meta: { total: number } }>("/purchase-orders", { query: { overdue: "true", pageSize: 1 } })
      .then((r) => setOverdue(r.meta.total))
      .catch(() => undefined);
  }, [caps.canApprove]);

  const onPending = useCallback((n: number) => setPending(n), []);
  const onOverdue = useCallback((n: number) => setOverdue(n), []);

  const change = (key: PurchasesTab) => {
    setTab(key);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    url.searchParams.delete("saved");
    window.history.replaceState(null, "", url);
  };

  const items = [
    { key: "orders" as const, label: "Purchase orders" },
    ...(caps.canApprove ? [{ key: "pending" as const, label: `Pending approval${pending ? ` (${pending})` : ""}` }] : []),
    { key: "overdue" as const, label: `Overdue${overdue ? ` (${overdue})` : ""}` },
    { key: "suppliers" as const, label: "Suppliers" },
  ];
  const selected = items.some((i) => i.key === tab) ? tab : items[0]!.key;

  return (
    <>
      {notice ? (
        <Notification kind="success" onClose={() => setNotice(null)}>
          {notice}
        </Notification>
      ) : null}
      <Tabs items={items} selected={selected} onChange={change} label="Purchases" />
      <div className={styles.tabPanel}>
        {selected === "orders" ? <PoList caps={caps} warehouses={warehouses} mode="all" /> : null}
        {selected === "pending" ? <PoList caps={caps} warehouses={warehouses} mode="pending" onCount={onPending} /> : null}
        {selected === "overdue" ? <PoList caps={caps} warehouses={warehouses} mode="overdue" onCount={onOverdue} /> : null}
        {selected === "suppliers" ? <SupplierList caps={caps} /> : null}
      </div>
    </>
  );
}
