import type { TagKind } from "@/components/ui/Tag";
import { ENTRY_TYPE_META, USER_ENTRY_TYPES, type EntryType } from "@/modules/inventory/domain/types";
import type { EntryDto } from "@/modules/inventory/interface/mappers";

export type { EntryDto, EntryType };
export { ENTRY_TYPE_META, USER_ENTRY_TYPES };

export interface StockCaps {
  userId: string;
  /** inventory ≥ CREATE */
  canCreate: boolean;
  /** inventory ≥ APPROVE */
  canApprove: boolean;
  /** inventory = FULL */
  canFull: boolean;
  seeCost: boolean;
  seeProfit: boolean;
  warehouseIds: string[];
  /** The built-in Admin role (go-live lock / unlock). */
  isAdmin: boolean;
  /** purchasing ≥ CREATE (low stock → "Create PO") */
  canCreatePo: boolean;
}

export type EntryStatus = EntryDto["status"];

export const STATUS_LABEL: Record<EntryStatus, string> = {
  DRAFT: "Draft",
  PENDING: "Pending verification",
  POSTED: "Posted",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  REVERSED: "Reversed",
  DISPATCHED: "Dispatched",
  RECEIVED: "Received",
};

export const STATUS_TAG: Record<EntryStatus, TagKind> = {
  DRAFT: "blue",
  PENDING: "yellow",
  POSTED: "green",
  REJECTED: "red",
  CANCELLED: "gray",
  REVERSED: "gray",
  DISPATCHED: "purple",
  RECEIVED: "green",
};

export const TYPE_GROUPS: { label: string; types: EntryType[] }[] = [
  { label: "Stock in", types: ["GRN_IMPORT", "GRN_LOCAL", "RETURN_FROM_SITE", "OPENING"] },
  { label: "Stock out", types: ["ISSUE_TO_PROJECT", "SALE", "RETURN_TO_SUPPLIER", "DAMAGE_WRITE_OFF"] },
  { label: "Move", types: ["TRANSFER"] },
];

export const CHARGE_TYPES = [
  ["CUSTOMS_DUTY", "Customs duty"],
  ["IMPORT_VAT", "Import VAT"],
  ["AIT", "AIT"],
  ["FREIGHT", "Freight"],
  ["INSURANCE", "Insurance"],
  ["CNF", "C&F agent"],
  ["OTHER", "Other"],
] as const;

export interface WarehouseDto {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface SupplierDto {
  id: string;
  name: string;
  type: "LOCAL" | "FOREIGN";
  currency: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
}

export interface CustomerDto {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
}

export const PROJECT_STATUSES = ["PLANNING", "RUNNING", "ON_HOLD", "COMPLETED", "CLOSED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = { PLANNING: "Planning", RUNNING: "Running", ON_HOLD: "On hold", COMPLETED: "Completed", CLOSED: "Closed" };
export const PROJECT_STATUS_TAG: Record<ProjectStatus, TagKind> = { PLANNING: "blue", RUNNING: "green", ON_HOLD: "yellow", COMPLETED: "purple", CLOSED: "gray" };

export interface ProjectDto {
  id: string;
  code: string;
  name: string;
  clientName: string | null;
  siteAddress: string | null;
  status: ProjectStatus;
  defaultWarehouse: { id: string; code: string; name: string } | null;
  isActive: boolean;
}

export interface StockLevelDto {
  product: { id: string; code: string; name: string; unitCode: string; minStockLevel: string | null; trackSerial: boolean; status: string; catalogName: string; categoryName: string };
  warehouses: { warehouseId: string; code: string; good: string; damaged: string; reserved: string }[];
  good: string;
  damaged: string;
  reserved: string;
  inTransit: string;
  avgCost?: string;
  stockValue?: string;
}

export interface MovementDto {
  id: string;
  seq: string;
  postedAt: string;
  entry: { id: string; number: string | null; type: EntryType } | null;
  product: { id: string; code: string; name: string };
  warehouse: { id: string; code: string; name: string };
  condition: "GOOD" | "DAMAGED";
  qtyChange: string;
  unitCost?: string;
  valueChange?: string;
  balanceAfter: string;
  avgCostAfter?: string;
}

export interface SerialDto {
  id: string;
  productId: string;
  serial: string;
  status: string;
  productCode: string;
  productName: string;
  warehouseCode: string | null;
  projectCode: string | null;
  customerName: string | null;
}

export const SERIAL_STATUS_LABEL: Record<string, string> = {
  IN_STOCK: "In stock",
  RESERVED: "Reserved",
  IN_TRANSIT: "In transit",
  ISSUED: "Issued to project",
  SOLD: "Sold",
  RETURNED_TO_SUPPLIER: "Returned to supplier",
  WRITTEN_OFF: "Written off",
  DAMAGED: "Damaged",
};

export interface ProductOption {
  id: string;
  code: string;
  name: string;
  model: string | null;
  unit: { code: string };
  sellingPrice: string;
  trackSerial: boolean;
  status: string;
}

/** A fresh Idempotency-Key for one user action (stock-changing requests require it). */
export const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const qtyFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });
/** "1,250.5" from "1250.500" (exact: Intl formats numeric strings without float rounding). */
export const formatQty = (v: string | null | undefined) => (v === null || v === undefined || v === "" ? "—" : qtyFormat.format(v as unknown as number));

const plain = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
/** Foreign-currency amounts: "USD 1,200.00". */
export const formatAmount = (v: string | null | undefined, currency = "BDT") => (v === null || v === undefined || v === "" ? "—" : `${currency === "BDT" ? "৳" : currency} ${plain.format(v as unknown as number)}`);

export const entryTitle = (e: Pick<EntryDto, "displayNumber" | "typeLabel">) => `${e.displayNumber} · ${e.typeLabel}`;
