import type { ModuleKey, PermissionLevel, PermissionMap } from "@/shared/rbac/levels";
import { hasLevel } from "@/shared/rbac/levels";

export interface NavItem {
  href: string;
  label: string;
  module: ModuleKey;
  /** Minimum level needed to see the menu item and open the page. */
  min: PermissionLevel;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", module: "dashboard", min: "VIEW" },
  { href: "/catalog", label: "Product catalog", module: "catalog", min: "VIEW" },
  { href: "/stock", label: "Stock in / out", module: "inventory", min: "VIEW" },
  { href: "/stock/counts", label: "Stock counts", module: "inventory", min: "VIEW" },
  { href: "/stock/low-stock", label: "Low stock", module: "inventory", min: "VIEW" },
  { href: "/stock/opening", label: "Opening stock", module: "inventory", min: "FULL" },
  { href: "/serials", label: "Serial numbers", module: "inventory", min: "VIEW" },
  { href: "/masters", label: "Customers", module: "inventory", min: "VIEW" },
  { href: "/purchases", label: "Purchases", module: "purchasing", min: "VIEW" },
  { href: "/projects", label: "Projects", module: "projects", min: "VIEW" },
  { href: "/reports", label: "Reports", module: "reports", min: "VIEW" },
  { href: "/users", label: "Users & roles", module: "users", min: "FULL" },
  { href: "/admin/system", label: "System health", module: "users", min: "FULL" },
  { href: "/admin/jobs", label: "Background jobs", module: "users", min: "FULL" },
];

export function visibleNav(permissions: PermissionMap): NavItem[] {
  return NAV_ITEMS.filter((i) => hasLevel(permissions[i.module], i.min));
}
