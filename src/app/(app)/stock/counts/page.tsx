import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { inventory } from "@/modules/inventory/interface/container";
import { stockAccess } from "../_lib/access";
import { CountList } from "./_components/CountList";
import styles from "../../catalog/_components/catalog.module.css";

export const metadata: Metadata = { title: "Stock counts" };

export default async function CountsPage() {
  const caps = await stockAccess("/stock/counts");
  if (!caps) return <AccessDenied what="Stock counts" />;
  const warehouses = (await inventory().masters.warehouses()).filter((w) => caps.warehouseIds.includes(w.id));
  return (
    <>
      <PageHeader
        title="Stock counts"
        description="Count what is on the shelves, compare with the system, and post the differences after approval."
        actions={
          caps.canCreate ? (
            <Link href="/stock/counts/new" className={styles.primaryLink}>
              + New count
            </Link>
          ) : null
        }
      />
      <CountList warehouses={warehouses} />
    </>
  );
}
