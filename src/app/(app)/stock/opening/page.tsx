import type { Metadata } from "next";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { inventory } from "@/modules/inventory/interface/container";
import { toOpeningWarehouseDto } from "@/modules/inventory/interface/mappers";
import { stockContext } from "../_lib/access";
import { OpeningWizard } from "../_components/OpeningWizard";

export const metadata: Metadata = { title: "Opening stock" };

export default async function OpeningStockPage() {
  const ctx = await stockContext("/stock/opening");
  if (!ctx) return <AccessDenied what="Opening stock" />;
  const locks = (await inventory().openings.warehouses(ctx.actor)).map(toOpeningWarehouseDto);
  return (
    <>
      <PageHeader title="Opening stock (go-live)" description="Load existing stock from Excel, check it, post it, then lock each warehouse." />
      <OpeningWizard caps={ctx.caps} initialLocks={locks} />
    </>
  );
}
