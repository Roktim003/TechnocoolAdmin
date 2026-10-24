import type { Metadata } from "next";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { inventory } from "@/modules/inventory/interface/container";
import { stockAccess } from "../stock/_lib/access";
import { SerialsBrowser } from "./SerialsBrowser";

export const metadata: Metadata = { title: "Serial numbers" };

export default async function SerialsPage({ searchParams }: { searchParams: Promise<{ productId?: string; q?: string }> }) {
  const caps = await stockAccess("/serials");
  if (!caps) return <AccessDenied what="Serial numbers" />;
  const { productId, q } = await searchParams;
  return (
    <>
      <PageHeader title="Serial numbers" description="Find any serial-tracked unit: where it is now and every entry it went through." />
      <SerialsBrowser warehouses={await inventory().masters.warehouses()} initialProductId={productId ?? null} initialQuery={q ?? ""} />
    </>
  );
}
