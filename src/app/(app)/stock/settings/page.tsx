import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { inventory } from "@/modules/inventory/interface/container";
import { stockAccess } from "../_lib/access";
import { InventorySettingsForm } from "../_components/InventorySettingsForm";
import { AlertSettingsForm } from "../_components/AlertSettingsForm";

export const metadata: Metadata = { title: "Inventory settings" };

export default async function InventorySettingsPage() {
  const caps = await stockAccess();
  if (!caps?.canFull) return <AccessDenied what="inventory settings" />;
  const [settings, alerts] = await Promise.all([inventory().masters.settings(), inventory().alerts.settings()]);
  return (
    <>
      <PageHeader title="Inventory settings" description={<Link href="/stock">← Stock in / out</Link>} />
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        <InventorySettingsForm initial={settings} />
        <AlertSettingsForm initial={alerts} />
      </div>
    </>
  );
}
