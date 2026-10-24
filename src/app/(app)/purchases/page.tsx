import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { inventory } from "@/modules/inventory/interface/container";
import { purchasesContext } from "./_lib/access";
import { PurchasesWorkspace, type PurchasesTab } from "./_components/PurchasesWorkspace";
import styles from "../stock/_components/stock.module.css";

export const metadata: Metadata = { title: "Purchases" };

const TABS: PurchasesTab[] = ["orders", "pending", "overdue", "suppliers"];

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ tab?: string; saved?: string }> }) {
  const ctx = await purchasesContext();
  if (!ctx) return <AccessDenied what="Purchases" />;
  const { tab, saved } = await searchParams;
  const warehouses = await inventory().masters.warehouses();
  return (
    <>
      <PageHeader
        title="Purchases"
        description="Purchase orders to local and foreign suppliers: approval, sending, and the goods received against them."
        actions={
          <div className={styles.footerActions}>
            {ctx.caps.canFull ? (
              <Link href="/purchases/settings" className={styles.link}>
                Purchasing settings
              </Link>
            ) : null}
            {ctx.caps.canCreate ? (
              <Link href="/purchases/new">
                <Button>New purchase order</Button>
              </Link>
            ) : null}
          </div>
        }
      />
      <PurchasesWorkspace caps={ctx.caps} warehouses={warehouses} initialTab={TABS.includes(tab as PurchasesTab) ? (tab as PurchasesTab) : "orders"} saved={saved ?? null} />
    </>
  );
}
