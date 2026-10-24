import { getWebPrincipal } from "@/modules/identity/interface/web-session";
import { hasPermission } from "@/shared/rbac/guards";
import type { Principal } from "@/shared/auth/principal";
import { NAV_ITEMS } from "./nav";

/** Returns the principal if they may open the page at `href` (same rule as the menu), else null. */
export async function allowedFor(href: string): Promise<Principal | null> {
  const principal = await getWebPrincipal();
  const item = NAV_ITEMS.find((i) => i.href === href);
  if (!principal || !item) return null;
  return hasPermission(principal, item.module, item.min) ? principal : null;
}
