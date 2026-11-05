import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { hasLevel } from "@/shared/rbac/levels";
import { getWebPrincipal } from "@/modules/identity/interface/web-session";
import { reporting, viewerOf } from "@/modules/reporting/interface/container";
import { allowedFor } from "../guard";
import { ReportsWorkspace } from "./_components/ReportsWorkspace";
import states from "@/components/shell/PageStates.module.css";

export const metadata: Metadata = { title: "Reports" };

const TITLE = "Reports";
const subtitle = (count?: number) => `${count === undefined ? "Reports" : `${count} reports`} with filters, export and scheduled emails · Admin and Accounts only`;
const SUBTITLE = subtitle();

export default async function Page() {
  const principal = await allowedFor("/reports");
  if (!principal) {
    const signedIn = await getWebPrincipal();
    return (
      <>
        <PageHeader title={TITLE} description={SUBTITLE} />
        <section className={states.tile} role="alert">
          <p className={`${states.eyebrow} ${states.error}`}>Locked</p>
          <h2 className={states.heading}>Reports are for Admin and Accounts.</h2>
          <p className={states.text}>
            {signedIn ? `Your role (${signedIn.roleName}) has no access to Reports.` : "You have no access to Reports."} Reports show costs, profit and every warehouse’s figures, so an
            Admin gives access per role. Ask an Admin if you need it.
          </p>
          <Link href="/dashboard" className={states.link}>
            Go to the dashboard
          </Link>
        </section>
      </>
    );
  }
  // The reports this user may run (the overhead reports need overhead access).
  const count = reporting().reports.available(viewerOf(principal)).length;
  return (
    <>
      <PageHeader title={TITLE} description={subtitle(count)} />
      <ReportsWorkspace
        caps={{
          userId: principal.userId,
          isFull: hasLevel(principal.permissions.reports, "FULL"),
          canCreatePo: hasLevel(principal.permissions.purchasing, "CREATE"),
        }}
      />
    </>
  );
}
