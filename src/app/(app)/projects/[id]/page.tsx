import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/shell/PageStates";
import { projectsContext } from "../_lib/access";
import { loadProject } from "../_lib/project";
import { ProjectDetail } from "../_components/ProjectDetail";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; tab?: string }> }) {
  const ctx = await projectsContext();
  if (!ctx) return <AccessDenied what="Projects" />;
  const [{ id }, { saved, tab }] = await Promise.all([params, searchParams]);
  const p = await loadProject(ctx.actor, id);
  if (!p) notFound();
  return <ProjectDetail key={p.updatedAt} caps={ctx.caps} initial={p} saved={saved === "1"} initialTab={tab ?? null} />;
}
