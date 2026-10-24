import { BusinessRuleError, ForbiddenError, ValidationError } from "@/shared/errors/app-error";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "./types";

const label = (s: ProjectStatus) => PROJECT_STATUS_LABEL[s].toLowerCase();

export const ProjectErrors = {
  invalidTransition: (from: ProjectStatus, to: ProjectStatus) =>
    new BusinessRuleError(`A project can't go from ${label(from)} to ${label(to)}.`, "INVALID_TRANSITION", { path: "toStatus" }),
  transitionNotAllowed: (level: string) => new ForbiddenError(level === "ADMIN" ? "Only the Admin can reopen a closed project." : "This status change needs projects FULL access."),
  reasonRequired: () => new ValidationError("Give a reason for this status change.", [{ path: "reason", message: "Give a reason (at least 3 characters).", code: "REASON_REQUIRED" }]),
  openEntries: (numbers: string[]) =>
    new BusinessRuleError(`The project can't be closed while stock entries are still open: ${numbers.join(", ")}. Approve, reject or receive them first.`, "PROJECT_HAS_OPEN_ENTRIES", { meta: { entries: numbers.join(",") } }),
  closed: (code: string) => new BusinessRuleError(`Project ${code} is closed; it can't be changed.`, "PROJECT_CLOSED"),
  contractValueForbidden: () => new ForbiddenError("Only users with projects FULL access and permission to see margins can set the contract value."),
  costAlreadyVoided: () => new BusinessRuleError("This cost is already voided.", "COST_VOIDED"),
  costHidden: () => new ForbiddenError("The cost statement shows costs; your role can't see costs."),
  unknownUser: () => new ValidationError("The site engineer must be an active user.", [{ path: "siteEngineerUserId", message: "Choose an active user." }]),
  unknownWarehouse: () => new ValidationError("Choose an active warehouse.", [{ path: "defaultWarehouseId", message: "Choose an active warehouse." }]),
  datesOrder: () => new ValidationError("The expected end date can't be before the start date.", [{ path: "expectedEndDate", message: "Must be on or after the start date." }]),
  badStartStatus: () => new ValidationError("A new project starts as planning or running.", [{ path: "status", message: "Planning or running." }]),
};
