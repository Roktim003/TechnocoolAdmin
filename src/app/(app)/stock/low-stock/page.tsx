import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { inventory } from "@/modules/inventory/interface/container";
import { stockAccess } from "../_lib/access";
import { LowStockList } from "../_components/LowStockList";
import styles from "../_components/stock.module.css";

export const metadata: Metadata = { title: "Low stock" };

export default async function LowStockPage() {
  const caps = await stockAccess("/stock/low-stock");
  if (!caps) return <AccessDenied what="Low stock" />;
  return (
    <>
      <PageHeader
        title="Low stock"
        description="Products whose available good stock (on hand minus reserved) is below their minimum level. Suggested reorder = 2 × minimum − available."
        actions={
          caps.canFull ? (
            <Link href="/stock/settings#alerts" className={styles.link}>
              Alert settings
            </Link>
          ) : null
        }
      />
      <LowStockList caps={caps} warehouses={await inventory().masters.warehouses()} />
    </>
  );
}
