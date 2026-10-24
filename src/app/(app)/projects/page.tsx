import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { projectsContext } from "./_lib/access";
import { ProjectBrowser } from "./_components/ProjectBrowser";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const ctx = await projectsContext();
  if (!ctx) return <AccessDenied what="Projects" />;
  return (
    <>
      <PageHeader
        title="Projects"
        description="Material issued to each site, plus labour, transport and other costs"
        actions={
          ctx.caps.canCreate ? (
            <Link href="/projects/new">
              <Button>+ New project</Button>
            </Link>
          ) : null
        }
      />
      <ProjectBrowser caps={ctx.caps} />
    </>
  );
}
