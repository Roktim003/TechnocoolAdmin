import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { inventory } from "@/modules/inventory/interface/container";
import { stockAccess } from "./_lib/access";
import { StockWorkspace, type StockTab } from "./_components/StockWorkspace";
import styles from "./_components/stock.module.css";
import { USER_ENTRY_TYPES, type EntryType } from "./_components/types";

export const metadata: Metadata = { title: "Stock in / out" };

const TABS: StockTab[] = ["new", "entries", "pending", "levels"];

export default async function StockPage({ searchParams }: { searchParams: Promise<{ tab?: string; po?: string; type?: string; project?: string; warehouse?: string }> }) {
  const caps = await stockAccess();
  if (!caps) return <AccessDenied what="Stock in / out" />;
  const { tab, po, type, project, warehouse } = await searchParams;
  const prefillType = (USER_ENTRY_TYPES as readonly string[]).includes(type ?? "") ? (type as EntryType) : undefined;
  const [warehouses, settings] = await Promise.all([inventory().masters.warehouses(), inventory().masters.settings()]);
  const initialTab = (po || prefillType) && caps.canCreate ? "new" : TABS.includes(tab as StockTab) ? (tab as StockTab) : caps.canCreate ? "new" : "entries";

  return (
    <>
      <PageHeader
        title="Stock in / out"
        description="Receive goods, issue to projects, sell, return, write off and transfer between warehouses. Every change is posted to the stock ledger."
        actions={
          caps.canFull ? (
            <Link href="/stock/settings" className={styles.link}>
              Inventory settings
            </Link>
          ) : null
        }
      />
      <StockWorkspace caps={caps} warehouses={warehouses} initialTab={initialTab} defaultVat={settings.defaultSalesVatPercent} initialPoId={po} prefill={prefillType ? { type: prefillType, projectId: project, warehouseId: warehouse } : undefined} />
    </>
  );
}
