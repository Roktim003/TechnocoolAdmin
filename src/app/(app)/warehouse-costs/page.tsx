import type { Metadata } from "next";
import { AccessDenied } from "@/components/shell/PageStates";
import { inventory } from "@/modules/inventory/interface/container";
import { hasPermission } from "@/shared/rbac/guards";
import { canSeeOverheads } from "@/shared/rbac/levels";
import { allowedFor } from "../guard";
import { WarehouseCostsWorkspace } from "./_components/WarehouseCostsWorkspace";

export const metadata: Metadata = { title: "Warehouse costs" };

export default async function WarehouseCostsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const principal = await allowedFor("/warehouse-costs");
  // The menu needs overheads ≥ VIEW; the amounts also need seeCost (the API answers 403 otherwise).
  if (!principal || !canSeeOverheads(principal)) return <AccessDenied what="Warehouse costs" />;
  const [{ tab }, all] = await Promise.all([searchParams, inventory().masters.warehouses()]);
  const warehouses = all.filter((w) => principal.warehouseIds.includes(w.id));
  const canEdit = hasPermission(principal, "overheads", "CREATE") && principal.flags.seeCost;
  return <WarehouseCostsWorkspace caps={{ canEdit }} warehouses={warehouses} initialTab={tab === "summary" ? "summary" : "entries"} />;
}
