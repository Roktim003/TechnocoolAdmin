import { AppError, BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/app-error";

export const ReportErrors = {
  unknownReport: () => new NotFoundError("Report"),
  outOfScope: () => new ForbiddenError("You do not have access to this warehouse."),
  timeout: (seconds: number) =>
    new AppError("QUERY_TIMEOUT", 503, `This report took longer than ${seconds} seconds. Narrow the filters (date range, warehouse, brand) and try again.`),
  tooManyRows: (max: number, total: number) =>
    new BusinessRuleError(`This export has ${total.toLocaleString("en-US")} rows; the limit is ${max.toLocaleString("en-US")}. Narrow the filters and try again.`, "EXPORT_TOO_LARGE", { meta: { limit: String(max), rows: String(total) } }),
  exportNotFound: () => new NotFoundError("Export"),
  exportNotReady: () => new BusinessRuleError("The export isn't ready yet.", "EXPORT_NOT_READY"),
  linkExpired: () => new ForbiddenError("This download link has expired or is invalid. Export the report again."),
  scheduleNotFound: () => new NotFoundError("Report schedule"),
  runNotFound: () => new NotFoundError("Report run"),
  notOwner: () => new ForbiddenError("Only the owner of this schedule (or a user with Reports FULL) can change it."),
  externalForbidden: () => new ForbiddenError("Sending reports to external email addresses requires FULL access to Reports."),
  recipientsRequired: () => new ValidationError("Add at least one recipient.", [{ path: "recipientUserIds", message: "Choose at least one user or (FULL access) an external email address." }]),
  recipientWithoutAccess: (names: string) =>
    new ValidationError("Some recipients can't open reports.", [{ path: "recipientUserIds", message: `${names} ${names.includes(",") ? "don't" : "doesn't"} have access to Reports, so they can't receive report emails.` }]),
  unknownUsers: () => new ValidationError("Unknown recipient.", [{ path: "recipientUserIds", message: "One or more users don't exist or are disabled." }]),
  dayRequired: (field: "dayOfWeek" | "dayOfMonth") => new ValidationError("The schedule is incomplete.", [{ path: field, message: field === "dayOfWeek" ? "Choose the day of the week." : "Choose the day of the month." }]),
  fileHidden: () => new ForbiddenError("This file was generated for someone who can see data you can't, so you can't download it."),
};
