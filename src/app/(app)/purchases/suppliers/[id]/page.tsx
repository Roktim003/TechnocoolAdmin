import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/shell/PageStates";
import { inventory } from "@/modules/inventory/interface/container";
import { purchasing } from "@/modules/purchasing/interface/container";
import { toSupplierDetailDto } from "@/modules/purchasing/interface/mappers";
import { NotFoundError } from "@/shared/errors/app-error";
import { UuidSchema } from "@/shared/validation/zod";
import { purchasesContext } from "../../_lib/access";
import { SupplierDetail } from "../../_components/SupplierDetail";

export const metadata: Metadata = { title: "Supplier" };

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await purchasesContext();
  if (!ctx) return <AccessDenied what="Purchases" />;
  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) notFound();
  try {
    const [r, warehouses] = await Promise.all([purchasing().suppliers.detail(id), inventory().masters.warehouses()]);
    return <SupplierDetail caps={ctx.caps} initial={toSupplierDetailDto(r.supplier, r.stats, ctx.actor)} warehouses={warehouses} />;
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}
