/** Purchasing domain vocabulary. Money and quantities are decimal strings (never floats). */

export type PoType = "LOCAL" | "IMPORTED";
export type SupplierType = "LOCAL" | "FOREIGN";
export type Currency = "BDT" | "USD" | "EUR" | "CNY" | "MYR" | "THB";

export const PO_STATUSES = ["DRAFT", "PENDING_APPROVAL", "REJECTED", "APPROVED", "SENT", "PARTLY_RECEIVED", "FULLY_RECEIVED", "CLOSED", "CANCELLED"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

/** The creator can still edit (and resubmit) the PO. */
export const EDITABLE: PoStatus[] = ["DRAFT", "REJECTED"];
/** GRNs can be received against it. */
export const RECEIVABLE: PoStatus[] = ["APPROVED", "SENT", "PARTLY_RECEIVED"];
/** An approver may amend quantities, prices, lines and the expected date. */
export const AMENDABLE: PoStatus[] = ["APPROVED", "SENT", "PARTLY_RECEIVED"];
/** Cancel is allowed only before anything was received (and nothing is pending). */
export const CANCELLABLE: PoStatus[] = ["DRAFT", "PENDING_APPROVAL", "REJECTED", "APPROVED", "SENT"];
/** Still waiting for goods: counts as "open" and can be overdue. */
export const OPEN: PoStatus[] = ["APPROVED", "SENT", "PARTLY_RECEIVED"];
/** The PO was approved: its prices count in the price history. */
export const PRICED: PoStatus[] = ["APPROVED", "SENT", "PARTLY_RECEIVED", "FULLY_RECEIVED", "CLOSED"];

export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  REJECTED: "Rejected",
  APPROVED: "Approved",
  SENT: "Sent",
  PARTLY_RECEIVED: "Partly received",
  FULLY_RECEIVED: "Fully received",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

/** The PO type follows the supplier: foreign suppliers get imported POs. */
export const poTypeFor = (supplierType: SupplierType): PoType => (supplierType === "FOREIGN" ? "IMPORTED" : "LOCAL");
/** The GRN type that receives a PO. */
export const grnTypeFor = (t: PoType): "GRN_LOCAL" | "GRN_IMPORT" => (t === "IMPORTED" ? "GRN_IMPORT" : "GRN_LOCAL");

/** SUP-001 */
export const formatSupplierCode = (n: number) => `SUP-${String(n).padStart(3, "0")}`;
