import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { catalogAccess } from "./_lib/access";
import { CatalogBrowser } from "./_components/CatalogBrowser";
import styles from "./_components/catalog.module.css";

export const metadata: Metadata = { title: "Product catalog" };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ catalog?: string; q?: string }> }) {
  const caps = await catalogAccess();
  if (!caps) return <AccessDenied what="Product catalog" />;
  const { catalog, q } = await searchParams;

  return (
    <>
      <PageHeader
        title="Product catalog"
        description="Everything the company stocks, grouped by brand. Stock, purchases and projects pick products from here."
        actions={
          caps.canCreate ? (
            <Link href={`/catalog/new${catalog ? `?catalog=${catalog}` : ""}`} className={styles.primaryLink}>
              + Add product
            </Link>
          ) : null
        }
      />
      <CatalogBrowser caps={caps} initialCatalogId={catalog ?? null} initialQuery={q ?? ""} />
    </>
  );
}
