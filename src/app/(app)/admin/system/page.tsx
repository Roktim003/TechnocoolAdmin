import type { Metadata } from "next";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { system } from "@/modules/system/interface/container";
import { allowedFor } from "../../guard";
import { SystemHealthView, type HealthSnapshot } from "./_components/SystemHealthView";

export const metadata: Metadata = { title: "System health" };
export const dynamic = "force-dynamic";

export default async function SystemHealthPage() {
  const principal = await allowedFor("/admin/system");
  if (!principal) return <AccessDenied what="System health" />;
  // Plain JSON for the client component (dates become ISO strings).
  const snapshot = JSON.parse(JSON.stringify(await system().health.snapshot())) as HealthSnapshot;

  return (
    <>
      <PageHeader title="System health" description="Backups, checks, email and the background worker at a glance. Anything not set up yet is listed first." />
      <SystemHealthView snapshot={snapshot} />
    </>
  );
}
