import type { Metadata } from "next";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { catalogAccess } from "../_lib/access";
import { ProductForm } from "../_components/ProductForm";

export const metadata: Metadata = { title: "Add product" };

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ catalog?: string }> }) {
  const caps = await catalogAccess();
  if (!caps?.canCreate) return <AccessDenied what="adding products" />;
  const { catalog } = await searchParams;
  return (
    <>
      <PageHeader title="Add product" description="Add an item to the catalog. Stock, purchases and projects will pick it from here." />
      <ProductForm caps={caps} product={null} initialCatalogId={catalog ?? null} />
    </>
  );
}
