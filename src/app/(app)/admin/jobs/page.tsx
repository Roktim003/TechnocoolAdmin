import type { Metadata } from "next";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { system } from "@/modules/system/interface/container";
import { allowedFor } from "../../guard";
import { JobsView, type JobsData } from "./_components/JobsView";

export const metadata: Metadata = { title: "Background jobs" };
export const dynamic = "force-dynamic";

export default async function BackgroundJobsPage({ searchParams }: { searchParams: Promise<{ queue?: string; page?: string }> }) {
  const principal = await allowedFor("/admin/jobs");
  if (!principal) return <AccessDenied what="Background jobs" />;
  const { queue, page } = await searchParams;

  const jobs = system().jobs;
  const overview = await jobs.overview();
  const names = overview.queues.map((q) => q.name);
  // Default: the first queue with failures, else email.
  const selected = queue && names.includes(queue) ? queue : (overview.queues.find((q) => q.counts.failed > 0)?.name ?? "email");
  const pageNo = Math.max(1, Number(page) || 1);
  const failed = await jobs.failed(selected, pageNo, 25);

  const data: JobsData = JSON.parse(JSON.stringify({ ...overview, selected, page: pageNo, pageSize: 25, failed }));
  return (
    <>
      <PageHeader title="Background jobs" description="Emails, PDFs, exports, imports, backups and checks run in the background worker. Failed jobs can be retried here." />
      <JobsView data={data} />
    </>
  );
}
