import type { TagKind } from "@/components/ui/Tag";
import {
  COST_CATEGORIES,
  COST_CATEGORY_LABEL,
  DIRECT_COST_CATEGORIES,
  isOverhead,
  OVERHEAD_CATEGORIES,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUSES,
  PROJECT_TYPE_LABEL,
  PROJECT_TYPES,
  type CostCategory,
  type ProjectStatus,
  type ProjectType,
} from "@/modules/projects/domain/types";
import type { toCostDto, toCostHistoryDto, toEntryRowDto, toMaterialDto, toProjectAttachmentDto, toProjectDto } from "@/modules/projects/interface/mappers";

export { COST_CATEGORIES, COST_CATEGORY_LABEL, DIRECT_COST_CATEGORIES, isOverhead, OVERHEAD_CATEGORIES, PROJECT_STATUS_LABEL, PROJECT_STATUSES, PROJECT_TYPE_LABEL, PROJECT_TYPES, type CostCategory, type ProjectStatus, type ProjectType };

export type ProjectDto = ReturnType<typeof toProjectDto>;
export type MaterialDto = ReturnType<typeof toMaterialDto>;
export type MovementDto = ReturnType<typeof toEntryRowDto>;
export type CostDto = ReturnType<typeof toCostDto>;
export type CostHistoryDto = ReturnType<typeof toCostHistoryDto>[number];
export type ProjectAttachmentDto = ReturnType<typeof toProjectAttachmentDto>;
/** Add / edit responses carry non-blocking warnings (large overhead, overheads above 30 % of direct cost). */
export interface CostWarning {
  code: string;
  message: string;
}

/** Cost category tags: direct costs in neutral colours, overheads in purple. */
export const COST_CATEGORY_TAG: Record<CostCategory, TagKind> = {
  LABOUR: "blue",
  TRANSPORT: "green",
  OTHER: "gray",
  STORE_CHARGE: "purple",
  HOLDING: "purple",
  ESTABLISHMENT: "purple",
};

/** Subtotal key per category (GET /projects/:id/costs → subtotals). */
export const COST_SUBTOTAL_KEY: Record<CostCategory, string> = {
  LABOUR: "labourCost",
  TRANSPORT: "transportCost",
  OTHER: "otherCost",
  STORE_CHARGE: "storeChargeCost",
  HOLDING: "holdingCost",
  ESTABLISHMENT: "establishmentCost",
};

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
