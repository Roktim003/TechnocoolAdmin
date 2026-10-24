import type { Metadata } from "next";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { reporting, viewerOf } from "@/modules/reporting/interface/container";
import { allowedFor } from "../guard";
import { DashboardView } from "./_components/DashboardView";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/** Role-aware: the service leaves out every widget this user may not see (same as GET /api/v1/dashboard). */
export default async function Page() {
  const principal = await allowedFor("/dashboard");
  if (!principal) return <AccessDenied what="Dashboard" />;
  const out = await reporting().dashboard.build(viewerOf(principal));
  return (
    <>
      <PageHeader title="Dashboard" description={`Your warehouses at a glance · updated ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(out.generatedAt))}`} />
      <DashboardView widgets={JSON.parse(JSON.stringify(out.widgets))} />
    </>
  );
}
