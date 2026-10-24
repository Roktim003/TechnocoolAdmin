import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { stockAccess } from "../stock/_lib/access";
import { MastersAdmin } from "./MastersAdmin";

export const metadata: Metadata = { title: "Customers" };

export default async function MastersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const caps = await stockAccess("/masters");
  if (!caps) return <AccessDenied what="Customers" />;
  const { tab } = await searchParams;
  // Suppliers moved to Purchases (Module 4); keep old links working.
  if (tab === "suppliers") redirect("/purchases?tab=suppliers");
  // Projects moved to their own module (Module 5).
  if (tab === "projects") redirect("/projects");
  return (
    <>
      <PageHeader
        title="Customers"
        description={
          <>
            The parties stock entries refer to. Records are never deleted; deactivate them instead. Suppliers are managed under <Link href="/purchases?tab=suppliers">Purchases</Link>, projects under <Link href="/projects">Projects</Link>.
          </>
        }
      />
      <MastersAdmin canManage={caps.canFull} />
    </>
  );
}
