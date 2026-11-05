import { BusinessRuleError, ForbiddenError, ValidationError } from "@/shared/errors/app-error";
import type { OverheadScope } from "./types";

export const OverheadErrors = {
  forbidden: () => new ForbiddenError("Overhead costs need overheads ≥ VIEW and permission to see costs."),
  editForbidden: () => new ForbiddenError("Entering, editing or voiding overhead costs needs overheads ≥ CREATE and permission to see costs."),
  outOfScope: () => new ForbiddenError("You don't have access to this warehouse."),
  scopeCategory: (scope: OverheadScope) =>
    new ValidationError(scope === "WAREHOUSE" ? "A warehouse cost is a store charge or a holding cost." : "A company cost is the established cost (overhead).", [
      { path: "category", message: scope === "WAREHOUSE" ? "Choose store charge or holding cost." : "Choose established cost.", code: "SCOPE_CATEGORY" },
    ]),
  warehouseRequired: () => new ValidationError("Choose the warehouse.", [{ path: "warehouseId", message: "Choose the warehouse.", code: "WAREHOUSE_REQUIRED" }]),
  noWarehouseForCompany: () => new ValidationError("A company cost has no warehouse.", [{ path: "warehouseId", message: "Leave the warehouse empty for a company cost.", code: "WAREHOUSE_NOT_ALLOWED" }]),
  unknownWarehouse: () => new ValidationError("Choose an active warehouse.", [{ path: "warehouseId", message: "Choose an active warehouse." }]),
  monthTooFar: () => new ValidationError("The month can't be more than one month in the future.", [{ path: "month", message: "At most next month.", code: "MONTH_TOO_FAR" }]),
  badMonth: () => new ValidationError("Use a month like 2026-11.", [{ path: "month", message: "Use YYYY-MM." }]),
  alreadyVoided: () => new BusinessRuleError("This cost is already voided.", "COST_VOIDED"),
};
