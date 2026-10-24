import { BusinessRuleError, ConflictError, ForbiddenError, ValidationError } from "@/shared/errors/app-error";
import { PO_STATUS_LABEL, type PoStatus } from "./types";

const label = (s: PoStatus) => PO_STATUS_LABEL[s].toLowerCase();

export const PurchasingErrors = {
  wrongStatus: (action: string, status: PoStatus) => new BusinessRuleError(`Can't ${action} a purchase order that is ${label(status)}.`, "INVALID_STATUS"),
  notCreator: (action: string) => new ForbiddenError(`Only the person who created this purchase order (or a FULL purchasing user) can ${action} it.`),
  selfApproval: () => new ForbiddenError("You can't approve your own purchase order. Another approver must do it (only FULL purchasing users may approve their own).", "FORBIDDEN"),
  approverOnly: () => new ForbiddenError("Only users with purchasing APPROVE can approve purchase orders. Submit it for approval instead."),
  outOfScope: (warehouse?: string) => new ForbiddenError(`You don't have access to ${warehouse ?? "this warehouse"}.`),
  inactiveSupplier: (name: string) => new BusinessRuleError(`Supplier '${name}' is inactive.`, "INACTIVE_SUPPLIER"),
  unknown: (what: string) => new BusinessRuleError(`The selected ${what} does not exist.`, `UNKNOWN_${what.toUpperCase().replace(/\s+/g, "_")}`),
  inactive: (what: string, name: string) => new BusinessRuleError(`${what} '${name}' is inactive.`, `INACTIVE_${what.toUpperCase().replace(/\s+/g, "_")}`),
  discontinued: (code: string) => new BusinessRuleError(`${code} is discontinued and can't be ordered.`, "PRODUCT_DISCONTINUED"),
  duplicateProduct: (code: string) => new BusinessRuleError(`${code} is on the PO twice. Use one line with the total quantity.`, "DUPLICATE_PRODUCT"),
  noLines: () => new ValidationError("Add at least one product line.", [{ path: "lines", message: "Add at least one product line." }]),
  priceRequired: (code: string) => new BusinessRuleError(`Enter a unit price greater than 0 for ${code}.`, "PRICE_REQUIRED"),
  rateRequired: () => new ValidationError("Imported POs need the exchange rate (BDT per unit of the currency).", [{ path: "exchangeRate", message: "Enter the exchange rate." }]),
  discountTooHigh: () => new BusinessRuleError("Discount can't be more than the subtotal.", "DISCOUNT_TOO_HIGH"),
  supplierTypeChange: () => new BusinessRuleError("The PO type is fixed once created: choose a supplier of the same type (local / foreign).", "PO_TYPE_FIXED"),
  dateOrder: () => new ValidationError("Expected delivery can't be before the PO date.", [{ path: "expectedDeliveryDate", message: "Must be on or after the PO date." }]),
  notReceivable: (number: string, status: PoStatus) =>
    new BusinessRuleError(`Purchase order ${number} is ${label(status)}: goods can be received only while it is approved, sent or partly received.`, "PO_NOT_RECEIVABLE"),
  hasReceipts: () => new BusinessRuleError("Goods were already received (or a GRN is pending) against this PO, so it can't be cancelled. Close it instead.", "PO_HAS_RECEIPTS"),
  pendingReceipts: () => new BusinessRuleError("A GRN against this PO is waiting for verification. Approve or reject it first.", "PO_PENDING_RECEIPTS"),
  amendBelowReceived: (code: string, min: string) => new BusinessRuleError(`${code} can't go below ${min} (already received or pending receipt).`, "AMEND_BELOW_RECEIVED"),
  removeReceivedLine: (code: string) => new BusinessRuleError(`${code} was already received (or is pending receipt) and can't be removed. Reduce it to the received quantity instead.`, "AMEND_BELOW_RECEIVED"),
  lineProductChange: () => new BusinessRuleError("A PO line's product can't be changed. Remove the line and add a new one.", "LINE_PRODUCT_FIXED"),
  noChanges: () => new BusinessRuleError("Nothing changed: amend at least one quantity, price, line or date.", "NO_CHANGES"),
  noSupplierEmail: (name: string) => new ValidationError(`${name} has no email address. Add one to the supplier or enter the address.`, [{ path: "to", message: "Enter the supplier's email address." }]),
  receiptMismatch: (why: string) => new BusinessRuleError(why, "RECEIPT_MISMATCH"),
  priceHistoryNeedsCost: () => new ForbiddenError("Price history shows purchase prices: it needs the 'See cost' permission."),
  nameTaken: (name: string) => new ConflictError(`A supplier named '${name}' already exists.`, [{ path: "name", message: "This supplier name is already used." }]),
  nothingToOrder: () => new BusinessRuleError("None of the selected products can be ordered (they must be active).", "NOTHING_TO_ORDER"),
};
