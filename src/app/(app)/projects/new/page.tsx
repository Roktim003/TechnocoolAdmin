import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { inventory } from "@/modules/inventory/interface/container";
import { projects } from "@/modules/projects/interface/container";
import { projectsContext } from "../_lib/access";
import { ProjectForm } from "../_components/ProjectForm";
import styles from "../../stock/_components/stock.module.css";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage() {
  const ctx = await projectsContext();
  if (!ctx?.caps.canCreate) return <AccessDenied what="New project" />;
  const [warehouses, nextCode] = await Promise.all([inventory().masters.warehouses(), projects().projects.nextCode()]);
  return (
    <>
      <div className={styles.breadcrumb}>
        <Link href="/projects">Projects</Link> / New project
      </div>
      <PageHeader title="New project" description="Material is tracked from what is issued to and returned from the site; labour, transport and other costs are added on the project page." />
      <ProjectForm caps={ctx.caps} warehouses={warehouses} nextCode={nextCode} />
    </>
  );
}
