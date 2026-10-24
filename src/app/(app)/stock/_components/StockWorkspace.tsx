"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { api } from "@/lib/api-client";
import { EntryForm } from "./EntryForm";
import { EntryList } from "./EntryList";
import { StockLevels } from "./StockLevels";
import type { EntryDto, EntryType, StockCaps, WarehouseDto } from "./types";
import styles from "./stock.module.css";

export type StockTab = "new" | "entries" | "pending" | "levels";

interface Props {
  caps: StockCaps;
  warehouses: WarehouseDto[];
  initialTab: StockTab;
  defaultVat: string;
  /** ?po=: open the new-entry form receiving against this purchase order. */
  initialPoId?: string;
  prefill?: { type?: EntryType; projectId?: string; warehouseId?: string };
}

export function StockWorkspace({ caps, warehouses, initialTab, defaultVat, initialPoId, prefill }: Props) {
  const [tab, setTab] = useState<StockTab>(initialTab);
  const [pending, setPending] = useState<number | null>(null);
  const [incoming, setIncoming] = useState<EntryDto[]>([]);

  useEffect(() => {
    if (caps.canApprove)
      api<{ meta: { total: number } }>("/stock-entries", { query: { awaitingMyApproval: "true", pageSize: 1 } })
        .then((r) => setPending(r.meta.total))
        .catch(() => undefined);
    if (caps.canCreate)
      api<{ data: EntryDto[] }>("/stock-entries", { query: { awaitingMyReceipt: "true", pageSize: 10, sort: "createdAt" } })
        .then((r) => setIncoming(r.data))
        .catch(() => undefined);
  }, [caps.canApprove, caps.canCreate]);

  const onCount = useCallback((n: number) => setPending(n), []);

  const change = (key: StockTab) => {
    setTab(key);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    window.history.replaceState(null, "", url);
  };

  const items = [
    ...(caps.canCreate ? [{ key: "new" as const, label: "New entry" }] : []),
    { key: "entries" as const, label: "Entries" },
    ...(caps.canApprove ? [{ key: "pending" as const, label: `Pending verification${pending ? ` (${pending})` : ""}` }] : []),
    { key: "levels" as const, label: "Stock levels" },
  ];
  const selected = items.some((i) => i.key === tab) ? tab : items[0]!.key;

  return (
    <>
      {incoming.length ? (
        <div className={styles.banner} role="status">
          <div>
            <strong>
              {incoming.length} transfer{incoming.length > 1 ? "s" : ""} to receive.
            </strong>{" "}
            <span className={styles.muted}>Count the goods and record what arrived.</span>
          </div>
          <div className={styles.bannerList}>
            {incoming.map((e) => (
              <Link key={e.id} href={`/stock/${e.id}#receive`} className={styles.mono}>
                {e.number} · {e.warehouse.code} → {e.toWarehouse?.code}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      <Tabs items={items} selected={selected} onChange={change} label="Stock" />
      <div className={styles.tabPanel}>
        {selected === "new" ? <EntryForm caps={caps} warehouses={warehouses} defaultVat={defaultVat} initialPoId={initialPoId} prefill={prefill} /> : null}
        {selected === "entries" ? <EntryList caps={caps} warehouses={warehouses} mode="all" /> : null}
        {selected === "pending" ? <EntryList caps={caps} warehouses={warehouses} mode="pending" onCount={onCount} /> : null}
        {selected === "levels" ? <StockLevels caps={caps} warehouses={warehouses} /> : null}
      </div>
    </>
  );
}
