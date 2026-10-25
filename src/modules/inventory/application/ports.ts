import type { ActorContext, AuditService } from "@/modules/audit/application/audit.service";
import type { ListQuery } from "@/shared/pagination/list-query";
import type { PermissionLevel } from "@/shared/rbac/levels";
import type { AdjustDirection, ChargeMode, ChargeType, Condition, Currency, EntryStatus, EntryType, ProductCostState, ProjectStatus, SerialStatus } from "../domain/types";
import type { BalanceFilters, EntryFilters, MasterFilters, MovementFilters, SerialFilters } from "./dto";
import type { CountStore } from "./count.service";
import type { OpeningStore } from "./opening.service";

/** The caller of an inventory use-case. */
export interface InventoryActor extends ActorContext {
  actorId: string;
  name: string;
  level: PermissionLevel;
  warehouseIds: string[];
  canSeeCost: boolean;
  canSeeProfit: boolean;
  /** The built-in Admin role (go-live lock / unlock). */
  isAdmin: boolean;
}

/* ─────────────── records ─────────────── */

export interface Ref {
  id: string;
  name: string;
}
export interface WarehouseRef {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface LineRecord {
  id: string;
  lineNo: number;
  productId: string;
  product: { id: string; code: string; name: string; unitCode: string; trackSerial: boolean; status: "ACTIVE" | "DISCONTINUED"; sellingPrice: string };
  qty: string;
  unitPrice: string;
  unitCostBdt: string;
  landedUnitCost: string | null;
  amount: string;
  costAmount: string;
  condition: Condition;
  originalLineId: string | null;
  receivedQty: string | null;
  /** STOCK_ADJUSTMENT lines only. */
  adjustDirection: AdjustDirection | null;
  /** GRN lines received against a purchase order line. */
  purchaseOrderLineId: string | null;
  note: string | null;
  serials: { serial: string; serialId: string | null; received: boolean }[];
}

export interface ChargeRecord {
  id: string;
  type: ChargeType;
  mode: ChargeMode;
  value: string;
  includeInCost: boolean;
  label: string | null;
  amountBdt: string;
}

export interface EntryRefs {
  poNumberText: string | null;
  supplierInvoiceNo: string | null;
  lcNo: string | null;
  billOfEntryNo: string | null;
  challanNo: string | null;
  siteAddress: string | null;
  receivedBy: string | null;
  vehicle: string | null;
  reason: string | null;
  description: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  notes: string | null;
}

export interface EntryRecord extends EntryRefs {
  id: string;
  number: string | null;
  draftRef: string;
  type: EntryType;
  status: EntryStatus;
  entryDate: string;
  warehouse: WarehouseRef;
  toWarehouse: WarehouseRef | null;
  supplier: (Ref & { isActive: boolean }) | null;
  customer: (Ref & { isActive: boolean }) | null;
  project: (Ref & { code: string; status: ProjectStatus; isActive: boolean }) | null;
  originalEntry: { id: string; number: string | null; type: EntryType; status: EntryStatus; projectId: string | null; supplierId: string | null } | null;
  reversalOf: { id: string; number: string | null } | null;
  reversedBy: { id: string; number: string | null } | null;
  relatedEntry: { id: string; number: string | null; type: EntryType } | null;
  relatedFrom: { id: string; number: string | null; type: EntryType; status: EntryStatus }[];
  /** GRNs received against a purchase order. */
  purchaseOrder: { id: string; number: string | null } | null;
  /** Entries whose originalEntryId points here (returns of this issue / GRN). */
  referencedBy: { id: string; number: string | null; type: EntryType; status: EntryStatus }[];
  currency: Currency;
  exchangeRate: string;
  discountAmount: string;
  vatPercent: string;
  subtotal: string;
  vatAmount: string;
  grandTotal: string;
  costTotal: string;
  belowCostConfirmed: boolean;
  createdBy: Ref;
  verifiedBy: Ref | null;
  receivedByUser: Ref | null;
  submittedAt: Date | null;
  verifiedAt: Date | null;
  rejectionReason: string | null;
  postedAt: Date | null;
  dispatchedAt: Date | null;
  receivedAt: Date | null;
  cancelledAt: Date | null;
  reversedAt: Date | null;
  reversalReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: LineRecord[];
  charges: ChargeRecord[];
  attachmentCount: number;
}

/** Writable entry fields (what a draft / edit stores). */
export interface EntryWrite extends EntryRefs {
  type: EntryType;
  entryDate: string;
  warehouseId: string;
  toWarehouseId: string | null;
  supplierId: string | null;
  customerId: string | null;
  projectId: string | null;
  originalEntryId: string | null;
  purchaseOrderId?: string | null;
  currency: Currency;
  exchangeRate: string;
  discountAmount: string;
  vatPercent: string;
  lines: {
    productId: string;
    qty: string;
    unitPrice: string;
    condition: Condition;
    originalLineId: string | null;
    adjustDirection?: AdjustDirection | null;
    purchaseOrderLineId?: string | null;
    note: string | null;
    serials: string[];
  }[];
  charges: { type: ChargeType; mode: ChargeMode; value: string; includeInCost: boolean; label: string | null }[];
}

export interface ProductInfo {
  id: string;
  code: string;
  name: string;
  trackSerial: boolean;
  status: "ACTIVE" | "DISCONTINUED";
  sellingPrice: string;
}

export interface BalanceKey {
  productId: string;
  warehouseId: string;
  condition: Condition;
}
export interface BalanceRow extends BalanceKey {
  qtyOnHand: string;
  qtyReserved: string;
}

export interface SerialRecord {
  id: string;
  productId: string;
  serial: string;
  status: SerialStatus;
  warehouseId: string | null;
  projectId: string | null;
  customerId: string | null;
  supplierId: string | null;
  reservedEntryId: string | null;
}

export interface MovementInsert {
  entryId: string;
  lineId: string | null;
  productId: string;
  warehouseId: string;
  condition: Condition;
  qtyChange: string;
  unitCost: string;
  valueChange: string;
  balanceAfter: string;
  avgCostAfter: string;
}

export interface MovementRecord extends MovementInsert {
  id: string;
  seq: string;
  postedAt: Date;
  entry: { id: string; number: string | null; type: EntryType };
  product: { id: string; code: string; name: string };
  warehouse: { id: string; code: string; name: string };
}

export interface InventorySettings {
  defaultSalesVatPercent: string;
  adminWriteOffNeedsApproval: boolean;
  allowAdminBelowCostSale: boolean;
  fiscalYearStartMonth: number;
}

export interface Customer {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AttachmentRecord {
  id: string;
  entityType: string;
  entityId: string;
  fileKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  label: string | null;
  uploadedBy: Ref;
  createdAt: Date;
}

/** Per-product stock row for the stock-levels table. */
export interface StockLevelRow {
  product: { id: string; code: string; name: string; unitCode: string; minStockLevel: string | null; trackSerial: boolean; status: string; catalogName: string; categoryName: string };
  warehouses: { warehouseId: string; code: string; good: string; damaged: string; reserved: string }[];
  good: string;
  damaged: string;
  reserved: string;
  inTransit: string;
  avgCost: string;
}

/* ─────────────── the store (one per DB client or transaction) ─────────────── */

export interface InventoryStore {
  /**
   * Opaque handle of the database client behind this store (the transaction inside
   * `transaction()`), so registered listeners (e.g. purchasing's ReceiptListener) can join it.
   */
  readonly tx: unknown;
  audit: AuditService;
  /** Stock counts and opening imports share the posting transaction. */
  counts: CountStore;
  openings: OpeningStore;

  // reference data
  settings(): Promise<InventorySettings>;
  updateSettings(data: Partial<InventorySettings>): Promise<InventorySettings>;
  warehouse(id: string): Promise<WarehouseRef | null>;
  /** The given warehouses, or all of them (transfers can go to any warehouse). */
  warehouses(ids?: string[]): Promise<WarehouseRef[]>;
  products(ids: string[]): Promise<ProductInfo[]>;

  // masters (suppliers belong to purchasing since Module 4, projects to the projects module since Module 5)
  listCustomers(q: ListQuery<MasterFilters>): Promise<{ items: Customer[]; total: number }>;
  customer(id: string): Promise<Customer | null>;
  createCustomer(data: Omit<Customer, "id" | "createdAt" | "updatedAt" | "isActive"> & { nameKey: string }): Promise<Customer>;
  updateCustomer(id: string, data: Partial<Omit<Customer, "id" | "createdAt" | "updatedAt">> & { nameKey?: string }): Promise<Customer>;
  customerNameExists(nameKey: string, exceptId?: string): Promise<boolean>;

  // entries
  entry(id: string): Promise<EntryRecord | null>;
  /** SELECT … FOR UPDATE on the entry row, then loads it. */
  lockEntry(id: string): Promise<EntryRecord | null>;
  listEntries(q: ListQuery<EntryFilters>, scope: { warehouseIds: string[]; userId: string; awaitingApprovalFor?: string; awaitingReceiptFor?: string[] }): Promise<{ items: EntryRecord[]; total: number }>;
  createEntry(data: EntryWrite & { draftRef: string; status: EntryStatus; createdById: string; reversalOfId?: string | null; relatedEntryId?: string | null }): Promise<string>;
  replaceEntry(id: string, data: EntryWrite): Promise<void>;
  updateEntry(id: string, data: Partial<Record<string, unknown>>): Promise<void>;
  updateLine(lineId: string, data: { unitCostBdt?: string; landedUnitCost?: string | null; amount?: string; costAmount?: string; unitPrice?: string; receivedQty?: string | null; originalLineId?: string | null }): Promise<void>;
  /** The computed cost columns of many lines in one statement (posting / submit). */
  updateLineCosts(rows: { lineId: string; unitCostBdt: string; landedUnitCost: string | null; amount: string; costAmount: string }[]): Promise<void>;
  updateCharge(chargeId: string, amountBdt: string): Promise<void>;
  /** Replaces an entry's landed-cost charges (pending import GRNs). */
  replaceCharges(entryId: string, charges: EntryWrite["charges"]): Promise<void>;
  linkLineSerial(lineId: string, serial: string, serialId: string, received?: boolean): Promise<void>;
  /** Posted quantity already returned against an original line (excluding one entry). */
  returnedQty(originalLineId: string, exceptEntryId: string): Promise<string>;
  /** Next number for (docType, fiscalYear): locks the sequence row FOR UPDATE. */
  nextNumber(docType: string, fiscalYear: string): Promise<number>;
  /** Next number without consuming it (preview only). */
  peekNumber(docType: string, fiscalYear: string): Promise<number>;

  // stock-count freeze and go-live lock
  /**
   * Transaction-scoped advisory locks per warehouse: postings take them shared, starting a
   * count takes one exclusive, so a count's snapshot never races a posting.
   */
  lockWarehouses(ids: string[], mode: "shared" | "exclusive"): Promise<void>;
  /** A COUNTING / SUBMITTED count in the warehouse covering any of the products. */
  activeCount(warehouseId: string, productIds: string[]): Promise<{ id: string; number: string; productIds: string[] } | null>;
  openingLocked(warehouseId: string): Promise<boolean>;

  // stock (locks are one SELECT … ORDER BY … FOR UPDATE, so rows are always locked in key order;
  // saves write all rows in one statement — fewer round trips while the locks are held)
  lockCosts(productIds: string[]): Promise<Map<string, ProductCostState>>;
  saveCosts(rows: { productId: string; state: ProductCostState }[]): Promise<void>;
  costs(productIds: string[]): Promise<Map<string, ProductCostState>>;
  lockBalances(keys: BalanceKey[]): Promise<Map<string, BalanceRow>>;
  balances(keys: BalanceKey[]): Promise<Map<string, BalanceRow>>;
  saveBalances(rows: BalanceRow[]): Promise<void>;
  reservations(entryId: string): Promise<(BalanceKey & { qty: string })[]>;
  addReservations(entryId: string, rows: (BalanceKey & { qty: string })[]): Promise<void>;
  deleteReservations(entryId: string): Promise<void>;
  inTransit(transferEntryId: string): Promise<{ productId: string; qty: string; value: string }[]>;
  addInTransit(transferEntryId: string, productId: string, qty: string, value: string): Promise<void>;
  clearInTransit(transferEntryId: string): Promise<void>;
  insertMovements(rows: MovementInsert[]): Promise<void>;
  entryMovements(entryId: string): Promise<MovementRecord[]>;

  // serials
  serialsByText(productId: string, serials: string[]): Promise<SerialRecord[]>;
  serialsById(ids: string[]): Promise<SerialRecord[]>;
  createSerial(data: Omit<SerialRecord, "id">): Promise<SerialRecord>;
  updateSerial(id: string, data: Partial<Omit<SerialRecord, "id" | "productId" | "serial">>): Promise<void>;
  addSerialMovement(row: { serialId: string; entryId: string; fromStatus: SerialStatus | null; toStatus: SerialStatus; fromWarehouseId: string | null; toWarehouseId: string | null }): Promise<void>;
  /** Serial movements of one entry, plus the entry id of each serial's latest movement. */
  serialMovementsOfEntry(entryId: string): Promise<{ serialId: string; fromStatus: SerialStatus | null; toStatus: SerialStatus; fromWarehouseId: string | null; toWarehouseId: string | null; latestEntryId: string }[]>;
  serialsReservedBy(entryId: string): Promise<SerialRecord[]>;

  // reads for screens
  stockLevels(q: ListQuery<BalanceFilters>, warehouseIds: string[]): Promise<{ items: StockLevelRow[]; total: number }>;
  movements(q: ListQuery<MovementFilters>, warehouseIds: string[]): Promise<{ items: MovementRecord[]; total: number }>;
  inTransitForProduct(productId: string, warehouseIds: string[]): Promise<{ entryId: string; number: string | null; fromCode: string; toCode: string; qty: string }[]>;
  /** scope: only serials in these warehouses, or out of stock after moving through one of them. */
  listSerials(q: ListQuery<SerialFilters>, scope?: string[]): Promise<{ items: (SerialRecord & { productCode: string; productName: string; warehouseCode: string | null; projectCode: string | null; customerName: string | null })[]; total: number }>;
  serialHistory(id: string): Promise<{ id: string; at: Date; fromStatus: SerialStatus | null; toStatus: SerialStatus; entry: { id: string; number: string | null; type: EntryType }; fromWarehouse: string | null; toWarehouse: string | null }[]>;

  // attachments
  attachments(entityType: string, entityId: string): Promise<AttachmentRecord[]>;
  attachment(id: string): Promise<AttachmentRecord | null>;
  addAttachment(data: Omit<AttachmentRecord, "id" | "createdAt" | "uploadedBy"> & { uploadedById: string }): Promise<AttachmentRecord>;
  deleteAttachment(id: string): Promise<void>;
}

export type EntryEvent = "submitted" | "posted" | "approved" | "rejected" | "cancelled" | "dispatched" | "received" | "reversed";
export type CountEvent = "submitted" | "recount" | "approved" | "cancelled";

/**
 * Side effects after a transaction commits: notifications and low-stock checks. They never run
 * inside the stock transaction, and implementations swallow (log) their own errors.
 */
export interface InventoryEvents {
  entry(event: EntryEvent, e: EntryRecord, ctx: { actorId: string; shortage?: EntryRecord | null }): Promise<void>;
  count(event: CountEvent, c: { id: string; number: string; warehouse: WarehouseRef; createdById: string; submittedById: string | null; counterIds: string[]; recountLines?: number }, ctx: { actorId: string }): Promise<void>;
  /** Available quantity of these products may have changed (posting, reservation, release). */
  stockChanged(productIds: string[]): Promise<void>;
}

export const noEvents: InventoryEvents = {
  entry: async () => undefined,
  count: async () => undefined,
  stockChanged: async () => undefined,
};

/* ─────────────── purchase orders (implemented by purchasing, registered at startup) ─────────────── */

/** What a GRN may receive against a purchase order. Prices are in the PO currency. */
export interface ReceiptTerms {
  purchaseOrderId: string;
  number: string;
  /** GRN_LOCAL for local POs, GRN_IMPORT for imported ones. */
  grnType: "GRN_LOCAL" | "GRN_IMPORT";
  supplierId: string;
  deliverToWarehouseId: string;
  currency: Currency;
  exchangeRate: string;
  lines: { purchaseOrderLineId: string; productId: string; unitPrice: string; remaining: string }[];
}

/** A GRN as the PO sees it: quantities per PO line. */
export interface ReceiptEvent {
  entryId: string;
  entryNumber: string | null;
  purchaseOrderId: string;
  actorId: string;
  lines: { purchaseOrderLineId: string; productId: string; productCode: string; qty: string }[];
}

/**
 * The purchase-order side of GRNs. Inventory defines it and never imports purchasing code;
 * purchasing implements it and registers it at startup. Every method except `committed` runs
 * inside the stock transaction (`db` is `InventoryStore.tx`) and throws to abort it.
 */
export interface ReceiptListener {
  /**
   * Locks the PO (and its lines) for the rest of the transaction. Posting calls it before
   * locking stock rows, so every transaction takes PO → cost → balance locks in that order.
   */
  lock(db: unknown, purchaseOrderId: string): Promise<void>;
  /** The PO's receiving terms (locks the PO); throws when it doesn't exist or can't be received against. */
  terms(db: unknown, purchaseOrderId: string): Promise<ReceiptTerms>;
  /** GRN submitted (pending): holds its quantities (pendingReceiptQty), refusing over-receipt. */
  pending(db: unknown, r: ReceiptEvent): Promise<void>;
  /** A pending GRN was rejected or cancelled: releases what `pending` held. */
  released(db: unknown, r: ReceiptEvent): Promise<void>;
  /** GRN posted: moves (or adds, for a direct post) the quantities to receivedQty; updates the PO status. */
  posted(db: unknown, r: ReceiptEvent, opts: { fromPending: boolean }): Promise<void>;
  /** A posted GRN was reversed: takes the quantities back off receivedQty; updates the PO status. */
  reversed(db: unknown, r: ReceiptEvent): Promise<void>;
  /** After commit (notifications). Never throws. */
  committed(event: "posted" | "reversed", r: ReceiptEvent): Promise<void>;
}

export interface InventoryUnitOfWork {
  store: InventoryStore;
  transaction<T>(fn: (store: InventoryStore) => Promise<T>, opts?: { timeoutMs?: number }): Promise<T>;
}

export interface FileStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Uint8Array; contentType: string } | null>;
  delete(keys: string[]): Promise<void>;
}

export const balanceKey = (k: BalanceKey) => `${k.productId}|${k.warehouseId}|${k.condition}`;
export const sortKeys = <T extends BalanceKey>(keys: T[]): T[] =>
  [...keys].sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : a.warehouseId < b.warehouseId ? -1 : a.warehouseId > b.warehouseId ? 1 : a.condition < b.condition ? -1 : a.condition > b.condition ? 1 : 0));

/* ─────────────── projects (read by the projects module through this interface) ─────────────── */

/** One product's posted material on a project: issues and returns from site, reversals netted out. */
export interface ProjectMaterialRow {
  projectId: string;
  productId: string;
  product: { code: string; name: string; unitCode: string; trackSerial: boolean };
  issuedQty: string;
  /** GOOD + DAMAGED. */
  returnedQty: string;
  returnedDamagedQty: string;
  /** Σ qty × the unit cost recorded in the ledger (BDT). */
  issuedCost: string;
  returnedCost: string;
}

/** An issue to / return from a project (or a reversal of one). */
export interface ProjectEntryRow {
  id: string;
  number: string | null;
  draftRef: string;
  type: EntryType;
  status: EntryStatus;
  entryDate: string;
  warehouse: { id: string; code: string; name: string };
  itemCount: number;
  totalQty: string;
  costTotal: string;
  reversalOf: { id: string; number: string | null; type: EntryType } | null;
  createdBy: Ref;
  postedAt: Date | null;
}

/**
 * Read-only stock data for the projects module (it never touches inventory tables itself).
 * Only movements of posted entries exist, so pending entries never count.
 */
export interface InventoryProjectQuery {
  material(projectIds: string[]): Promise<ProjectMaterialRow[]>;
  /** Serial numbers currently at the project's site (ISSUED to it and not returned). */
  serialsAtSite(projectId: string): Promise<{ productId: string; serial: string }[]>;
  entries(projectId: string, page: { skip: number; take: number }, filters?: { type?: EntryType; status?: EntryStatus }): Promise<{ items: ProjectEntryRow[]; total: number }>;
  /** Entries that keep a project open: PENDING ones and transfers dispatched but not received. */
  openEntries(projectId: string): Promise<{ id: string; number: string | null; draftRef: string; type: EntryType; status: EntryStatus }[]>;
}

/** Implemented by the projects module and registered at startup (cost alerts after issues / returns). */
export interface ProjectStockListener {
  /** After commit, when an issue to / return from a project was posted or reversed. Never throws. */
  materialChanged(projectId: string, entry: { id: string; number: string | null; type: EntryType }): Promise<void>;
}
