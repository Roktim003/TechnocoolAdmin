import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/shell/PageStates";
import { inventory } from "@/modules/inventory/interface/container";
import { UuidSchema } from "@/shared/validation/zod";
import { stockAccess } from "../../_lib/access";
import { ProductStockCard } from "../../_components/ProductStockCard";

export const metadata: Metadata = { title: "Stock card" };

export default async function ProductStockPage({ params }: { params: Promise<{ productId: string }> }) {
  const caps = await stockAccess();
  if (!caps) return <AccessDenied what="Stock in / out" />;
  const { productId } = await params;
  if (!UuidSchema.safeParse(productId).success) notFound();
  return <ProductStockCard caps={caps} productId={productId} warehouses={await inventory().masters.warehouses()} />;
}
