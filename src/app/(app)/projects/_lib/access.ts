import { projectsActor } from "@/modules/projects/interface/http";
import type { ProjectsActor } from "@/modules/projects/application/ports";
import { hasPermission } from "@/shared/rbac/guards";
import type { Principal } from "@/shared/auth/principal";
import { allowedFor } from "../../guard";
import type { ProjectsCaps } from "../_components/types";

const capsOf = (principal: Principal): ProjectsCaps => ({
  userId: principal.userId,
  canCreate: hasPermission(principal, "projects", "CREATE"),
  canFull: hasPermission(principal, "projects", "FULL"),
  canIssue: hasPermission(principal, "inventory", "CREATE"),
  seeCost: principal.flags.seeCost,
  seeMargin: principal.flags.seeMargin,
  isAdmin: principal.isAdmin,
});

/** What the project pages may show (the API enforces the same rules). */
export async function projectsContext(): Promise<{ caps: ProjectsCaps; actor: ProjectsActor; principal: Principal } | null> {
  const principal = await allowedFor("/projects");
  return principal ? { caps: capsOf(principal), actor: projectsActor(principal), principal } : null;
}
