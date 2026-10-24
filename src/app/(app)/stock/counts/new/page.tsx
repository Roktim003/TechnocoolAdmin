import type { Metadata } from "next";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { inventory } from "@/modules/inventory/interface/container";
import { stockAccess } from "../../_lib/access";
import { NewCountForm } from "../_components/NewCountForm";

export const metadata: Metadata = { title: "New stock count" };

export default async function NewCountPage() {
  const caps = await stockAccess("/stock/counts");
  if (!caps?.canCreate) return <AccessDenied what="stock counts" />;
  const warehouses = (await inventory().masters.warehouses()).filter((w) => w.isActive && caps.warehouseIds.includes(w.id));
  return (
    <>
      <PageHeader title="New stock count" description="Choose the warehouse and what to count. Counting starts when you press Start." />
      <NewCountForm warehouses={warehouses} />
    </>
  );
}
