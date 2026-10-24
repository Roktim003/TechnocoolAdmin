import type { TagKind } from "@/components/ui/Tag";
import { COST_CATEGORIES, COST_CATEGORY_LABEL, PROJECT_STATUS_LABEL, PROJECT_STATUSES, PROJECT_TYPE_LABEL, PROJECT_TYPES, type CostCategory, type ProjectStatus, type ProjectType } from "@/modules/projects/domain/types";
import type { toCostDto, toEntryRowDto, toMaterialDto, toProjectAttachmentDto, toProjectDto } from "@/modules/projects/interface/mappers";

export { COST_CATEGORIES, COST_CATEGORY_LABEL, PROJECT_STATUS_LABEL, PROJECT_STATUSES, PROJECT_TYPE_LABEL, PROJECT_TYPES, type CostCategory, type ProjectStatus, type ProjectType };

export type ProjectDto = ReturnType<typeof toProjectDto>;
export type MaterialDto = ReturnType<typeof toMaterialDto>;
export type MovementDto = ReturnType<typeof toEntryRowDto>;
export type CostDto = ReturnType<typeof toCostDto>;
export type ProjectAttachmentDto = ReturnType<typeof toProjectAttachmentDto>;

export interface ProjectsCaps {
  userId: string;
  /** projects ≥ CREATE */
  canCreate: boolean;
  /** projects = FULL */
  canFull: boolean;
  /** inventory ≥ CREATE (issue material / returns) */
  canIssue: boolean;
  seeCost: boolean;
  seeMargin: boolean;
  isAdmin: boolean;
}

export const PROJECT_STATUS_TAG: Record<ProjectStatus, TagKind> = {
  PLANNING: "blue",
  RUNNING: "green",
  ON_HOLD: "yellow",
  COMPLETED: "purple",
  CLOSED: "gray",
};
