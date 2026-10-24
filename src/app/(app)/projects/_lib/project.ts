import { projects } from "@/modules/projects/interface/container";
import { toProjectDto } from "@/modules/projects/interface/mappers";
import type { ProjectsActor } from "@/modules/projects/application/ports";
import { NotFoundError } from "@/shared/errors/app-error";
import { filterSensitiveFields } from "@/shared/rbac/sensitive-fields";
import { UuidSchema } from "@/shared/validation/zod";
import type { ProjectDto } from "../_components/types";

/** A project as the API would return it to this actor (same sensitive-field filter). */
export async function loadProject(actor: ProjectsActor, id: string): Promise<ProjectDto | null> {
  if (!UuidSchema.safeParse(id).success) return null;
  try {
    const r = await projects().projects.detail(actor, id);
    return filterSensitiveFields(toProjectDto(r.project, r.summary, actor, r.transitions), { flags: { seeCost: actor.canSeeCost, seeProfit: false, seeMargin: actor.canSeeMargin } }) as ProjectDto;
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}
