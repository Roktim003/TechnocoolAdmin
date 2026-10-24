import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { inventory } from "@/modules/inventory/interface/container";
import { purchasing } from "@/modules/purchasing/interface/container";
import { purchasesContext } from "../../_lib/access";
import { loadPo } from "../../_lib/po";
import { PoForm } from "../../_components/PoForm";
import styles from "../../../stock/_components/stock.module.css";

export const metadata: Metadata = { title: "Edit purchase order" };

export default async function EditPoPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await purchasesContext();
  if (!ctx) return <AccessDenied what="Purchases" />;
  const { id } = await params;
  const po = await loadPo(ctx.actor, id);
  if (po === "forbidden") return <AccessDenied what="this purchase order" />;
  if (!po) notFound();
  if (!po.actions.edit) redirect(`/purchases/${po.id}`);
  const [warehouses, settings] = await Promise.all([inventory().masters.warehouses(), purchasing().uow.store.settings()]);
  return (
    <>
      <div className={styles.breadcrumb}>
        <Link href="/purchases">Purchases</Link> / <Link href={`/purchases/${po.id}`}>{po.displayNumber}</Link> / Edit
      </div>
      <PageHeader title={`Edit ${po.displayNumber}`} />
      <PoForm caps={ctx.caps} warehouses={warehouses} defaults={{ terms: settings.defaultTerms, vatPercent: settings.defaultVatPercent }} po={po} />
    </>
  );
}
