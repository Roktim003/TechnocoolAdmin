import type { Metadata } from "next";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { catalogAccess } from "../_lib/access";
import { ImportWizard } from "../_components/ImportWizard";

export const metadata: Metadata = { title: "Import products" };

export default async function ImportPage() {
  const caps = await catalogAccess();
  if (!caps?.canManage) return <AccessDenied what="product import" />;
  return (
    <>
      <PageHeader title="Import products" description="Add many products at once from an Excel file. Nothing is saved until every row is valid." />
      <ImportWizard seeCost={caps.seeCost} />
    </>
  );
}
