import { purchasingActor } from "@/modules/purchasing/interface/http";
import type { PurchasingActor } from "@/modules/purchasing/application/ports";
import { hasPermission } from "@/shared/rbac/guards";
import type { Principal } from "@/shared/auth/principal";
import { allowedFor } from "../../guard";
import type { PurchasesCaps } from "../_components/types";

const capsOf = (principal: Principal): PurchasesCaps => ({
  userId: principal.userId,
  canCreate: hasPermission(principal, "purchasing", "CREATE"),
  canApprove: hasPermission(principal, "purchasing", "APPROVE"),
  canFull: hasPermission(principal, "purchasing", "FULL"),
  canReceive: hasPermission(principal, "inventory", "CREATE"),
  seeCost: principal.flags.seeCost,
  warehouseIds: principal.warehouseIds,
});

/** What the purchases pages may show (the API enforces the same rules). */
export async function purchasesContext(): Promise<{ caps: PurchasesCaps; actor: PurchasingActor } | null> {
  const principal = await allowedFor("/purchases");
  return principal ? { caps: capsOf(principal), actor: purchasingActor(principal) } : null;
}
