import { registerProjectStockListener } from "@/modules/inventory/application/project-events";
import { registerReceiptListener } from "@/modules/inventory/application/receipts";
import { projects } from "@/modules/projects/interface/container";
import { purchasing } from "@/modules/purchasing/interface/container";
import { reporting } from "@/modules/reporting/interface/container";
import { onDataChange } from "@/shared/events/change-events";

/** One function object, so repeated wiring never registers it twice. */
const clearDashboardCache = () => reporting().dashboard.clearCache();

/**
 * Wires the modules together at startup, so inventory has no compile-time dependency on the
 * modules built on top of it:
 *  - purchasing registers its ReceiptListener: GRNs against purchase orders update the PO in
 *    the posting transaction;
 *  - projects registers its ProjectStockListener: posted / reversed issues and returns queue
 *    the project's cost-alert check;
 *  - reporting clears the cached dashboard when postings, purchasing or projects change data.
 * Idempotent. Called by src/instrumentation.ts (web), the worker and the test setup.
 */
export function wireModules(): void {
  registerReceiptListener(purchasing().receipts);
  registerProjectStockListener(projects().stockListener);
  onDataChange(clearDashboardCache);
}
