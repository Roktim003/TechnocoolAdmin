import type { ReportDefinition, ReportRegistry } from "../application/ports";
import { auditLog, pendingVerification } from "./reports/control";
import { overheadsSpentVsCharged, warehouseHoldingCost } from "./reports/overheads";
import { materialByProject, projectCostSummary } from "./reports/projects";
import { importShipments, openPos, priceHistory, purchasesBySupplier } from "./reports/purchases";
import { damageLoss, salesReport } from "./reports/sales";
import { lowStock, serialLookup, stockAging, stockMovement, stockSummary } from "./reports/stock";

/**
 * The report registry: one definition per report, numbered 1–17 (new reports take the next number;
 * the screen lists them by group, in number order). 16 and 17 need overhead access (report-level
 * `requires`), so other viewers see 15.
 * To add a report: write a `defineReport({...})` next to the others and list it here.
 */
export const REPORTS: ReportDefinition[] = [
  stockSummary,
  stockMovement,
  stockAging,
  lowStock,
  serialLookup,
  openPos,
  purchasesBySupplier,
  priceHistory,
  projectCostSummary,
  materialByProject,
  salesReport,
  damageLoss,
  pendingVerification,
  auditLog,
  importShipments,
  warehouseHoldingCost,
  overheadsSpentVsCharged,
].sort((a, b) => a.meta.number - b.meta.number);

export const reportRegistry: ReportRegistry = {
  all: () => REPORTS,
  get: (id) => REPORTS.find((r) => r.meta.id === id),
};
