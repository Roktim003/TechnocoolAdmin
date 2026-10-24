import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/shell/PageStates";
import { catalog } from "@/modules/catalog/interface/container";
import { toProductDto } from "@/modules/catalog/interface/mappers";
import { filterSensitiveFields } from "@/shared/rbac/sensitive-fields";
import { UuidSchema } from "@/shared/validation/zod";
import { catalogAccess } from "../_lib/access";
import { ProductDetail } from "../_components/ProductDetail";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; photoError?: string }> }) {
  const caps = await catalogAccess();
  if (!caps) return <AccessDenied what="Product catalog" />;
  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) notFound();
  const product = await catalog().products.get(id).catch(() => null);
  if (!product) notFound();
  const { saved, photoError } = await searchParams;
  const dto = filterSensitiveFields(toProductDto(product), { flags: { seeCost: caps.seeCost, seeProfit: false, seeMargin: false } });
  return <ProductDetail caps={caps} initial={dto} saved={saved === "1"} photoError={photoError ?? null} />;
}
