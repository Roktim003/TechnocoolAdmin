import type { ModuleKey, PermissionLevel, PermissionMap } from "@/shared/rbac/levels";
import { hasLevel } from "@/shared/rbac/levels";
import type { IconName } from "@/components/ui/Icon";

/** Sidebar groups, in display order. */
export const NAV_GROUPS = ["Overview", "Inventory", "Operations", "Insights", "Admin"] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export interface NavItem {
  href: string;
  label: string;
  module: ModuleKey;
  /** Minimum level needed to see the menu item and open the page. */
  min: PermissionLevel;
  group: NavGroup;
  icon: IconName;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", module: "dashboard", min: "VIEW", group: "Overview", icon: "house" },
  { href: "/catalog", label: "Product catalog", module: "catalog", min: "VIEW", group: "Inventory", icon: "package" },
  { href: "/stock", label: "Stock in / out", module: "inventory", min: "VIEW", group: "Inventory", icon: "arrows" },
  { href: "/stock/counts", label: "Stock counts", module: "inventory", min: "VIEW", group: "Inventory", icon: "clipboard" },
  { href: "/stock/low-stock", label: "Low stock", module: "inventory", min: "VIEW", group: "Inventory", icon: "alert" },
  { href: "/stock/opening", label: "Opening stock", module: "inventory", min: "FULL", group: "Inventory", icon: "archive" },
  { href: "/serials", label: "Serial numbers", module: "inventory", min: "VIEW", group: "Inventory", icon: "scan" },
  { href: "/masters", label: "Customers", module: "inventory", min: "VIEW", group: "Operations", icon: "users" },
  { href: "/purchases", label: "Purchases", module: "purchasing", min: "VIEW", group: "Operations", icon: "cart" },
  { href: "/projects", label: "Projects", module: "projects", min: "VIEW", group: "Operations", icon: "kanban" },
  { href: "/warehouse-costs", label: "Warehouse costs", module: "overheads", min: "VIEW", group: "Operations", icon: "warehouse" },
  { href: "/reports", label: "Reports", module: "reports", min: "VIEW", group: "Insights", icon: "chart" },
  { href: "/users", label: "Users & roles", module: "users", min: "FULL", group: "Admin", icon: "lock" },
];

export function visibleNav(permissions: PermissionMap): NavItem[] {
  return NAV_ITEMS.filter((i) => hasLevel(permissions[i.module], i.min));
}
