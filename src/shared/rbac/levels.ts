/**
 * RBAC vocabulary shared by every module. Pure TypeScript — no framework imports.
 * Values mirror the Prisma enums `ModuleKey` and `PermissionLevel`.
 */

export const MODULE_KEYS = ["dashboard", "catalog", "inventory", "purchasing", "projects", "reports", "users"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

/** Ordered from lowest to highest. */
export const PERMISSION_LEVELS = ["NONE", "VIEW", "CREATE", "APPROVE", "FULL"] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export const SENSITIVE_FLAGS = ["seeCost", "seeProfit", "seeMargin"] as const;
export type SensitiveFlag = (typeof SENSITIVE_FLAGS)[number];
export type SensitiveFlags = Record<SensitiveFlag, boolean>;

export type PermissionMap = Record<ModuleKey, PermissionLevel>;

export const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: "Dashboard",
  catalog: "Product catalog",
  inventory: "Stock in / out",
  purchasing: "Purchases",
  projects: "Projects",
  reports: "Reports",
  users: "Users & roles",
};

export const FLAG_LABELS: Record<SensitiveFlag, string> = {
  seeCost: "See cost",
  seeProfit: "See profit",
  seeMargin: "See contract value & margin",
};

export function levelRank(level: PermissionLevel): number {
  return PERMISSION_LEVELS.indexOf(level);
}

/** True when `actual` is at least `required` (e.g. APPROVE satisfies CREATE). */
export function hasLevel(actual: PermissionLevel | undefined, required: PermissionLevel): boolean {
  return levelRank(actual ?? "NONE") >= levelRank(required);
}

export function emptyPermissionMap(level: PermissionLevel = "NONE"): PermissionMap {
  return Object.fromEntries(MODULE_KEYS.map((m) => [m, level])) as PermissionMap;
}

export function isModuleKey(v: string): v is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(v);
}
