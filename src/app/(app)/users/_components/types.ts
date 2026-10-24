import type { TagKind } from "@/components/ui/Tag";
import type { PermissionLevel } from "@/shared/rbac/levels";

export type { LoginHistoryDto, RoleDto, RoleMatrixDto, UserDto, WarehouseDto } from "@/modules/identity/application/dto";

export interface Notice {
  kind: "success" | "error" | "info";
  title: string;
  message?: string;
}

export type Notify = (notice: Notice) => void;

export const LEVEL_TAG: Record<PermissionLevel, TagKind> = {
  NONE: "gray",
  VIEW: "blue",
  CREATE: "purple",
  APPROVE: "yellow",
  FULL: "green",
};

export const LEVEL_LABEL: Record<PermissionLevel, string> = {
  NONE: "None",
  VIEW: "View",
  CREATE: "Create",
  APPROVE: "Approve",
  FULL: "Full",
};
