import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { inventory } from "@/modules/inventory/interface/container";
import { purchasing } from "@/modules/purchasing/interface/container";
import { purchasesContext } from "../_lib/access";
import { PoForm } from "../_components/PoForm";
import styles from "../../stock/_components/stock.module.css";

export const metadata: Metadata = { title: "New purchase order" };

export default async function NewPoPage({ searchParams }: { searchParams: Promise<{ supplierId?: string }> }) {
  const ctx = await purchasesContext();
  if (!ctx?.caps.canCreate) return <AccessDenied what="New purchase order" />;
  const { supplierId } = await searchParams;
  const [warehouses, settings] = await Promise.all([inventory().masters.warehouses(), purchasing().uow.store.settings()]);
  return (
    <>
      <div className={styles.breadcrumb}>
        <Link href="/purchases">Purchases</Link> / New purchase order
      </div>
      <PageHeader title="New purchase order" description="Local suppliers: ৳ with discount and VAT. Foreign suppliers: their currency with an indicative exchange rate; landed costs are added on the GRN." />
      <PoForm caps={ctx.caps} warehouses={warehouses} defaults={{ terms: settings.defaultTerms, vatPercent: settings.defaultVatPercent }} initialSupplierId={supplierId} />
    </>
  );
}
