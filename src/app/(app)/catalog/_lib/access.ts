import { hasPermission } from "@/shared/rbac/guards";
import { allowedFor } from "../../guard";
import type { CatalogCaps } from "../_components/types";

/** Principal + what the UI may show on catalog pages (the API enforces the same rules). */
export async function catalogAccess(): Promise<CatalogCaps | null> {
  const principal = await allowedFor("/catalog");
  if (!principal) return null;
  return {
    userId: principal.userId,
    canCreate: hasPermission(principal, "catalog", "CREATE"),
    canManage: hasPermission(principal, "catalog", "FULL"),
    seeCost: principal.flags.seeCost,
  };
}
