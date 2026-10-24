import type { PermissionMap, SensitiveFlags } from "@/shared/rbac/levels";

export interface SeedRole {
  name: string;
  description: string;
  isLocked: boolean;
  permissions: PermissionMap;
  flags: SensitiveFlags;
}

export const ADMIN_ROLE_NAME = "Admin";

/** The four roles StockBook ships with. Only Admin is locked; the others are editable. */
export const SEED_ROLES: SeedRole[] = [
  {
    name: ADMIN_ROLE_NAME,
    description: "Full access to everything. Locked.",
    isLocked: true,
    permissions: { dashboard: "FULL", catalog: "FULL", inventory: "FULL", purchasing: "FULL", projects: "FULL", reports: "FULL", users: "FULL" },
    flags: { seeCost: true, seeProfit: true, seeMargin: true },
  },
  {
    name: "Accounts",
    description: "Finance team: approves stock movements, full reports.",
    isLocked: false,
    permissions: { dashboard: "VIEW", catalog: "VIEW", inventory: "APPROVE", purchasing: "VIEW", projects: "VIEW", reports: "FULL", users: "NONE" },
    flags: { seeCost: true, seeProfit: true, seeMargin: false },
  },
  {
    name: "Manager",
    description: "Operations manager: approves stock, raises purchases and projects.",
    isLocked: false,
    permissions: { dashboard: "VIEW", catalog: "VIEW", inventory: "APPROVE", purchasing: "CREATE", projects: "CREATE", reports: "NONE", users: "NONE" },
    flags: { seeCost: true, seeProfit: false, seeMargin: false },
  },
  {
    name: "Store Manager",
    description: "Warehouse staff: records stock in and out.",
    isLocked: false,
    permissions: { dashboard: "VIEW", catalog: "VIEW", inventory: "CREATE", purchasing: "NONE", projects: "NONE", reports: "NONE", users: "NONE" },
    flags: { seeCost: false, seeProfit: false, seeMargin: false },
  },
];

export const SEED_WAREHOUSES = [
  { code: "A", name: "Warehouse A" },
  { code: "B", name: "Warehouse B" },
];
