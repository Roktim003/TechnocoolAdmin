import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { inventory } from "@/modules/inventory/interface/container";
import { projectsContext } from "../../_lib/access";
import { loadProject } from "../../_lib/project";
import { ProjectForm } from "../../_components/ProjectForm";
import styles from "../../../stock/_components/stock.module.css";

export const metadata: Metadata = { title: "Edit project" };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await projectsContext();
  if (!ctx) return <AccessDenied what="Projects" />;
  const { id } = await params;
  const p = await loadProject(ctx.actor, id);
  if (!p) notFound();
  if (!p.actions.edit) redirect(`/projects/${p.id}`);
  return (
    <>
      <div className={styles.breadcrumb}>
        <Link href="/projects">Projects</Link> / <Link href={`/projects/${p.id}`}>{p.code}</Link> / Edit
      </div>
      <PageHeader title={`Edit ${p.code}`} />
      <ProjectForm caps={ctx.caps} warehouses={await inventory().masters.warehouses()} project={p} />
    </>
  );
}
