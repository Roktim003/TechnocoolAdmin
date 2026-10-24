import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { purchasing } from "@/modules/purchasing/interface/container";
import { purchasesContext } from "../_lib/access";
import { PurchasingSettingsForm } from "../_components/PurchasingSettingsForm";
import styles from "../../stock/_components/stock.module.css";

export const metadata: Metadata = { title: "Purchasing settings" };

export default async function PurchasingSettingsPage() {
  const ctx = await purchasesContext();
  if (!ctx?.caps.canFull) return <AccessDenied what="Purchasing settings" />;
  const settings = await purchasing().uow.store.settings();
  return (
    <>
      <div className={styles.breadcrumb}>
        <Link href="/purchases">Purchases</Link> / Settings
      </div>
      <PageHeader title="Purchasing settings" description="Defaults for new purchase orders." />
      <PurchasingSettingsForm initial={settings} />
    </>
  );
}
