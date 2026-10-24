import type { Metadata } from "next";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { catalogAccess } from "../_lib/access";
import { CatalogSettings } from "../_components/CatalogSettings";

export const metadata: Metadata = { title: "Catalog settings" };

export default async function CatalogSettingsPage() {
  const caps = await catalogAccess();
  if (!caps?.canManage) return <AccessDenied what="catalog settings" />;
  return (
    <>
      <PageHeader title="Catalog settings" description="Brands, categories and units of measure. Deactivate instead of deleting anything that products already use." />
      <CatalogSettings />
    </>
  );
}
