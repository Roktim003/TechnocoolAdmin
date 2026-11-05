"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Notification } from "@/components/ui/Notification";
import { Tabs } from "@/components/ui/Tabs";
import { formatMoney } from "@/shared/time/format";
import { CostFormModal, type SavedCost } from "./CostFormModal";
import { EntriesTab } from "./EntriesTab";
import { SummaryTab } from "./SummaryTab";
import { CATEGORY_SHORT, monthLabel, type CostWarning, type WarehouseCostCaps, type WarehouseCostDto, type WarehouseOption } from "./types";
import stock from "../../stock/_components/stock.module.css";

export type WarehouseCostsTab = "entries" | "summary";

export function WarehouseCostsWorkspace({ caps, warehouses, initialTab }: { caps: WarehouseCostCaps; warehouses: WarehouseOption[]; initialTab: WarehouseCostsTab }) {
  const [tab, setTab] = useState<WarehouseCostsTab>(initialTab);
  // null: closed; "new": add; a cost: edit it.
  const [form, setForm] = useState<WarehouseCostDto | "new" | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [warnings, setWarnings] = useState<CostWarning[]>([]);
  const [version, setVersion] = useState(0);

  const change = (key: WarehouseCostsTab) => {
    setTab(key);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    window.history.replaceState(null, "", url);
  };

  const saved = (c: SavedCost, receiptError?: string) => {
    const what = `${CATEGORY_SHORT[c.category]} for ${monthLabel(c.month)} (${c.warehouse?.name ?? "Company"}), ${formatMoney(c.amount)}`;
    setNotice(receiptError ? { kind: "error", message: `${what} added, but the receipt didn't upload: ${receiptError}` } : { kind: "success", message: `${what} ${form === "new" ? "added" : "saved"}.` });
    setWarnings(c.warnings ?? []);
    setForm(null);
    setVersion((v) => v + 1);
  };

  return (
    <>
      <PageHeader
        title="Warehouse costs"
        description="Monthly store charge, holding cost and company overhead"
        actions={
          caps.canEdit ? (
            <Button
              onClick={() => {
                change("entries");
                setForm("new");
              }}
            >
              + Add cost
            </Button>
          ) : null
        }
      />
      <div className={stock.stack} style={{ marginBottom: notice || warnings.length ? "var(--s-4)" : undefined }}>
        {notice ? (
          <Notification kind={notice.kind} onClose={() => setNotice(null)}>
            {notice.message}
          </Notification>
        ) : null}
        {warnings.length ? (
          <Notification kind="warning" title="Saved — please double-check" onClose={() => setWarnings([])}>
            {warnings.map((w) => (
              <div key={w.code}>{w.message}</div>
            ))}
          </Notification>
        ) : null}
      </div>
      <Tabs
        label="Warehouse costs"
        selected={tab}
        onChange={change}
        items={[
          { key: "entries", label: "Entries" },
          { key: "summary", label: "Monthly summary" },
        ]}
      />
      <div className={stock.tabPanel}>
        {tab === "entries" ? <EntriesTab warehouses={warehouses} version={version} onEdit={(c) => setForm(c)} notify={setNotice} /> : <SummaryTab version={version} />}
      </div>
      {form ? <CostFormModal cost={form === "new" ? null : form} warehouses={warehouses} onClose={() => setForm(null)} onSaved={saved} /> : null}
    </>
  );
}
