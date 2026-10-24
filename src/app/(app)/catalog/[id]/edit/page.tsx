import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { catalog } from "@/modules/catalog/interface/container";
import { toProductDto } from "@/modules/catalog/interface/mappers";
import { filterSensitiveFields } from "@/shared/rbac/sensitive-fields";
import { UuidSchema } from "@/shared/validation/zod";
import { catalogAccess } from "../../_lib/access";
import { ProductForm } from "../../_components/ProductForm";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const caps = await catalogAccess();
  if (!caps?.canManage) return <AccessDenied what="editing products" />;
  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) notFound();
  const product = await catalog().products.get(id).catch(() => null);
  if (!product) notFound();
  // Same sensitive-field rule as the API: no purchaseCost without seeCost.
  const dto = filterSensitiveFields(toProductDto(product), { flags: { seeCost: caps.seeCost, seeProfit: false, seeMargin: false } });
  return (
    <>
      <PageHeader title={`Edit ${product.name}`} description={product.code} />
      <ProductForm caps={caps} product={dto} initialCatalogId={null} />
    </>
  );
}
