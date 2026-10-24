import { principalActor } from "@/modules/inventory/interface/http";
import type { InventoryActor } from "@/modules/inventory/application/ports";
import { hasPermission } from "@/shared/rbac/guards";
import type { Principal } from "@/shared/auth/principal";
import { allowedFor } from "../../guard";
import type { StockCaps } from "../_components/types";

const capsOf = (principal: Principal): StockCaps => ({
  userId: principal.userId,
  canCreate: hasPermission(principal, "inventory", "CREATE"),
  canApprove: hasPermission(principal, "inventory", "APPROVE"),
  canFull: hasPermission(principal, "inventory", "FULL"),
  seeCost: principal.flags.seeCost,
  seeProfit: principal.flags.seeProfit,
  warehouseIds: principal.warehouseIds,
  isAdmin: principal.isAdmin,
  canCreatePo: hasPermission(principal, "purchasing", "CREATE"),
});

/** What the stock pages may show (the API enforces the same rules). `href` picks the menu rule. */
export async function stockAccess(href = "/stock"): Promise<StockCaps | null> {
  const principal = await allowedFor(href);
  return principal ? capsOf(principal) : null;
}

/** Caps plus the inventory actor, for pages that read through the inventory services. */
export async function stockContext(href = "/stock"): Promise<{ caps: StockCaps; actor: InventoryActor } | null> {
  const principal = await allowedFor(href);
  return principal ? { caps: capsOf(principal), actor: principalActor(principal) } : null;
}
