import { BusinessRuleError, ConflictError, ForbiddenError, ValidationError } from "@/shared/errors/app-error";

export const InventoryErrors = {
  insufficientStock: (code: string, available: string, requested: string, warehouse: string, condition = "GOOD") =>
    new BusinessRuleError(
      `Not enough ${condition === "DAMAGED" ? "damaged " : ""}stock of ${code} in ${warehouse}: ${available} available, ${requested} requested.`,
      "INSUFFICIENT_STOCK",
    ),
  notEditable: (status: string) => new BusinessRuleError(`Only draft or rejected entries can be edited (this one is ${status.toLowerCase()}).`, "NOT_EDITABLE"),
  wrongStatus: (action: string, status: string) => new BusinessRuleError(`Can't ${action} an entry that is ${status.toLowerCase()}.`, "INVALID_STATUS"),
  notCreator: (action: string) => new ForbiddenError(`Only the person who created this entry can ${action} it.`),
  selfApproval: () => new ForbiddenError("You can't verify your own entry. Another approver must do it.", "FORBIDDEN"),
  outOfScope: (warehouse?: string) => new ForbiddenError(`You don't have access to ${warehouse ?? "this warehouse"}.`),
  postNotAllowed: () => new ForbiddenError("Only users with FULL inventory access can post entries directly. Submit it for verification instead."),
  fullOnly: (what: string) => new ForbiddenError(`${what} requires FULL inventory access.`),
  writeOffNeedsApproval: () => new BusinessRuleError("Write-offs need verification (inventory settings). Submit it for verification instead.", "APPROVAL_REQUIRED"),
  reasonRequired: (what: string) => new ValidationError(`A reason is required to ${what}.`, [{ path: "reason", message: "Reason is required." }]),
  noLines: () => new ValidationError("Add at least one product line.", [{ path: "lines", message: "Add at least one product line." }]),
  required: (path: string, message: string) => new ValidationError(message, [{ path, message }]),
  unknown: (what: string) => new BusinessRuleError(`The selected ${what} does not exist.`, `UNKNOWN_${what.toUpperCase().replace(/\s+/g, "_")}`),
  inactive: (what: string, name: string) => new BusinessRuleError(`${what} '${name}' is inactive.`, `INACTIVE_${what.toUpperCase().replace(/\s+/g, "_")}`),
  discontinued: (code: string) => new BusinessRuleError(`${code} is discontinued and can't be used in new entries.`, "PRODUCT_DISCONTINUED"),
  projectStatus: (code: string, status: string, allowed: string) =>
    new BusinessRuleError(`Project ${code} is ${status.toLowerCase().replace("_", " ")}; ${allowed}.`, "PROJECT_STATUS"),
  sameWarehouse: () => new BusinessRuleError("Choose a different destination warehouse.", "SAME_WAREHOUSE"),
  damagedNotAllowed: () => new BusinessRuleError("Damaged stock can't be issued, sold or transferred — only written off or returned to the supplier.", "DAMAGED_NOT_ALLOWED"),
  conditionNotAllowed: () => new BusinessRuleError("Condition DAMAGED is only allowed on returns from site, write-offs and returns to supplier.", "CONDITION_NOT_ALLOWED"),
  belowCost: (codes: string[]) =>
    new BusinessRuleError(`Selling price is below average cost for ${codes.join(", ")}.`, "BELOW_COST"),
  discountTooHigh: () => new BusinessRuleError("Discount can't be more than the subtotal.", "DISCOUNT_TOO_HIGH"),
  futureDate: () => new BusinessRuleError("The entry date can't be in the future.", "FUTURE_DATE"),
  serialCount: (code: string, need: string, got: number) =>
    new BusinessRuleError(`${code} tracks serial numbers: enter exactly ${need} serial number(s) (got ${got}).`, "SERIAL_COUNT"),
  serialFractional: (code: string) => new BusinessRuleError(`${code} tracks serial numbers, so its quantity must be a whole number.`, "SERIAL_COUNT"),
  serialDuplicate: (serial: string) => new ValidationError(`Serial ${serial} is listed twice.`, [{ path: "lines", message: `Serial ${serial} is listed twice.`, code: "SERIAL_DUPLICATE" }]),
  serialExists: (serial: string, status: string) => new BusinessRuleError(`Serial ${serial} already exists (${status.toLowerCase().replace(/_/g, " ")}).`, "SERIAL_EXISTS"),
  serialUnavailable: (serial: string, why: string) => new BusinessRuleError(`Serial ${serial} can't be used: ${why}.`, "SERIAL_UNAVAILABLE"),
  serialsMovedOn: (serial: string) => new BusinessRuleError(`Serial ${serial} has moved since this entry was posted, so the entry can't be reversed.`, "SERIALS_MOVED"),
  reversalNegative: (code: string, warehouse: string) =>
    new BusinessRuleError(`Reversing would make stock of ${code} in ${warehouse} negative.`, "REVERSAL_NEGATIVE_STOCK"),
  notReversible: (why: string) => new BusinessRuleError(why, "NOT_REVERSIBLE"),
  receiveQty: (code: string) => new ValidationError(`Received quantity for ${code} must be between 0 and the dispatched quantity.`, [{ path: "lines", message: "Invalid received quantity." }]),
  originalMismatch: (why: string) => new BusinessRuleError(why, "ORIGINAL_ENTRY_MISMATCH"),
  returnExceeds: (code: string, left: string) => new BusinessRuleError(`Only ${left} of ${code} from the original entry can still be returned.`, "RETURN_EXCEEDS"),
  attachmentType: () => new ValidationError("Only PDF, JPG, PNG and WebP files are allowed.", [{ path: "file", message: "Only PDF, JPG, PNG and WebP files are allowed.", code: "INVALID_FILE_TYPE" }]),
  attachmentSize: () => new ValidationError("Each file must be 10 MB or smaller.", [{ path: "file", message: "Each file must be 10 MB or smaller.", code: "FILE_TOO_LARGE" }]),
  attachmentLimit: () => new BusinessRuleError("An entry can have at most 20 attachments.", "ATTACHMENT_LIMIT"),
  countInProgress: (number: string, warehouse: string, codes: string[]) =>
    new BusinessRuleError(
      `Stock count ${number} is in progress in ${warehouse}${codes.length ? ` for ${codes.slice(0, 5).join(", ")}${codes.length > 5 ? "…" : ""}` : ""}. These products can't move until it is approved or cancelled.`,
      "COUNT_IN_PROGRESS",
    ),
  openingLocked: (warehouse: string) => new BusinessRuleError(`Opening stock for ${warehouse} is locked. An Admin must unlock it (with a reason) first.`, "OPENING_LOCKED"),
  adjustmentBelowReserved: (code: string, warehouse: string) =>
    new BusinessRuleError(`The count loss for ${code} would leave less stock in ${warehouse} than pending entries have reserved. Reject or cancel those entries first.`, "INSUFFICIENT_STOCK"),
  /** Receiving more than a PO line still has to come. */
  overReceipt: (code: string, productId: string, remaining: string, requested: string, poNumber: string, path = "lines") =>
    new BusinessRuleError(`Only ${remaining} of ${code} is still to be received on ${poNumber} (${requested} entered). To receive more, an approver must amend the PO first.`, "OVER_RECEIPT", {
      path,
      meta: { productId, productCode: code, remaining, requested, purchaseOrder: poNumber },
    }),
  notOnPurchaseOrder: (code: string, poNumber: string) => new BusinessRuleError(`${code} is not on purchase order ${poNumber}.`, "PRODUCT_NOT_ON_PO"),
  purchaseOrderMismatch: (why: string) => new BusinessRuleError(why, "PO_MISMATCH"),
  landedCostNotAllowed: () => new ForbiddenError("Only a verifier who can see costs (inventory APPROVE + seeCost) can change landed-cost charges."),
  nameTaken: (what: string, name: string) => new ConflictError(`A ${what} named '${name}' already exists.`, [{ path: "name", message: `This ${what} name is already used.` }]),
};
