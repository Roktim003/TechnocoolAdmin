export const ENTRY_TYPES = [
  "GRN_IMPORT",
  "GRN_LOCAL",
  "RETURN_FROM_SITE",
  "OPENING",
  "ISSUE_TO_PROJECT",
  "SALE",
  "RETURN_TO_SUPPLIER",
  "DAMAGE_WRITE_OFF",
  "TRANSFER",
  "REVERSAL",
  "STOCK_ADJUSTMENT",
] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];
/** System-created types: reversals and stock-count adjustments. */
export const SYSTEM_ENTRY_TYPES = ["REVERSAL", "STOCK_ADJUSTMENT"] as const;
/** Types a user can create. */
export const USER_ENTRY_TYPES = ENTRY_TYPES.filter((t) => !(SYSTEM_ENTRY_TYPES as readonly string[]).includes(t)) as Exclude<EntryType, (typeof SYSTEM_ENTRY_TYPES)[number]>[];

export type EntryStatus = "DRAFT" | "PENDING" | "POSTED" | "REJECTED" | "CANCELLED" | "REVERSED" | "DISPATCHED" | "RECEIVED";
export type Condition = "GOOD" | "DAMAGED";
/** ADJUST: each line is a GAIN (in) or a LOSS (out). */
export type Direction = "IN" | "OUT" | "MOVE" | "INVERSE" | "ADJUST";
export type AdjustDirection = "GAIN" | "LOSS";
export type ChargeType = "CUSTOMS_DUTY" | "AIT" | "IMPORT_VAT" | "FREIGHT" | "INSURANCE" | "CNF" | "OTHER";
export type ChargeMode = "PERCENT_OF_GOODS" | "AMOUNT_BDT";
export type SerialStatus = "IN_STOCK" | "RESERVED" | "IN_TRANSIT" | "ISSUED" | "SOLD" | "RETURNED_TO_SUPPLIER" | "WRITTEN_OFF" | "DAMAGED";
export type ProjectStatus = "PLANNING" | "RUNNING" | "ON_HOLD" | "COMPLETED" | "CLOSED";
export type Currency = "BDT" | "USD" | "EUR" | "CNY" | "MYR" | "THB";
export const CURRENCIES: Currency[] = ["BDT", "USD", "EUR", "CNY", "MYR", "THB"];

export interface EntryTypeMeta {
  label: string;
  direction: Direction;
  prefix: string;
  /** Where the line price comes from. */
  price: "COST_FOREIGN" | "COST_BDT" | "SELLING" | "AUTO";
  group: "IN" | "OUT" | "MOVE" | "SYSTEM";
}

export const ENTRY_TYPE_META: Record<EntryType, EntryTypeMeta> = {
  GRN_IMPORT: { label: "Purchase receipt (GRN) — Imported", direction: "IN", prefix: "GRN-I", price: "COST_FOREIGN", group: "IN" },
  GRN_LOCAL: { label: "Purchase receipt (GRN) — Local", direction: "IN", prefix: "GRN-L", price: "COST_BDT", group: "IN" },
  RETURN_FROM_SITE: { label: "Return from site", direction: "IN", prefix: "RTN", price: "AUTO", group: "IN" },
  OPENING: { label: "Opening stock", direction: "IN", prefix: "OPN", price: "COST_BDT", group: "IN" },
  ISSUE_TO_PROJECT: { label: "Issue to project", direction: "OUT", prefix: "ISS", price: "AUTO", group: "OUT" },
  SALE: { label: "Sale / delivery", direction: "OUT", prefix: "SAL", price: "SELLING", group: "OUT" },
  RETURN_TO_SUPPLIER: { label: "Return to supplier", direction: "OUT", prefix: "RTS", price: "AUTO", group: "OUT" },
  DAMAGE_WRITE_OFF: { label: "Damage / loss write-off", direction: "OUT", prefix: "DMG", price: "AUTO", group: "OUT" },
  TRANSFER: { label: "Transfer between warehouses", direction: "MOVE", prefix: "TRF", price: "AUTO", group: "MOVE" },
  REVERSAL: { label: "Reversal", direction: "INVERSE", prefix: "REV", price: "AUTO", group: "SYSTEM" },
  STOCK_ADJUSTMENT: { label: "Stock adjustment (count)", direction: "ADJUST", prefix: "ADJ", price: "AUTO", group: "SYSTEM" },
};

/** Entries that take stock out of a warehouse when posted (and reserve it when submitted). */
export const takesStock = (t: EntryType) => ENTRY_TYPE_META[t].direction === "OUT" || t === "TRANSFER";
/** Line prices that are costs (hidden from roles without seeCost). Only sales carry selling prices. */
export const priceIsCost = (t: EntryType) => t !== "SALE";

/** Serial status after an OUT entry posts. */
export const SERIAL_OUT_STATUS: Partial<Record<EntryType, SerialStatus>> = {
  ISSUE_TO_PROJECT: "ISSUED",
  SALE: "SOLD",
  RETURN_TO_SUPPLIER: "RETURNED_TO_SUPPLIER",
  DAMAGE_WRITE_OFF: "WRITTEN_OFF",
  TRANSFER: "IN_TRANSIT",
  STOCK_ADJUSTMENT: "WRITTEN_OFF",
};

export interface ProductCostState {
  totalQty: string;
  totalValue: string;
  avgCost: string;
}
