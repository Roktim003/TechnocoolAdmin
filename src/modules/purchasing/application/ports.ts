import type { ActorContext, AuditService } from "@/modules/audit/application/audit.service";
import type { ListQuery } from "@/shared/pagination/list-query";
import type { PermissionLevel } from "@/shared/rbac/levels";
import type { Currency, PoStatus, PoType, SupplierType } from "../domain/types";
import type { PoFilters, PriceHistoryFilters, SupplierFilters } from "./dto";

/** The caller of a purchasing use-case. */
export interface PurchasingActor extends ActorContext {
  actorId: string;
  name: string;
  /** Role's `purchasing` level. */
  level: PermissionLevel;
  /** Role's `inventory` level (receiving against POs is an inventory action). */
  inventoryLevel: PermissionLevel;
  warehouseIds: string[];
  canSeeCost: boolean;
}

export interface Ref {
  id: string;
  name: string;
}

/* ─────────────── records ─────────────── */

export interface SupplierRecord {
  id: string;
  code: string;
  name: string;
  type: SupplierType;
  defaultCurrency: Currency;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  brandsSupplied: string | null;
  paymentTermsNote: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** APPROVED / SENT / PARTLY_RECEIVED POs. */
  openPoCount: number;
}

export type SupplierWrite = Omit<SupplierRecord, "id" | "code" | "createdAt" | "updatedAt" | "openPoCount" | "isActive">;

export interface SupplierStats {
  openPoCount: number;
  poCount: number;
  lastPurchaseDate: string | null;
  totalOrderedBdt: string;
  productCount: number;
}

export interface PoLineRecord {
  id: string;
  lineNo: number;
  productId: string;
  product: { id: string; code: string; name: string; unitCode: string; status: "ACTIVE" | "DISCONTINUED"; trackSerial: boolean };
  qty: string;
  unitPrice: string;
  amount: string;
  receivedQty: string;
  pendingReceiptQty: string;
  note: string | null;
}

export interface PoRecord {
  id: string;
  number: string | null;
  draftRef: string;
  type: PoType;
  status: PoStatus;
  supplier: { id: string; code: string; name: string; type: SupplierType; email: string | null; isActive: boolean; address: string | null; contactPerson: string | null; phone: string | null; paymentTermsNote: string | null };
  currency: Currency;
  exchangeRate: string;
  poDate: string;
  expectedDeliveryDate: string | null;
  deliverTo: { id: string; code: string; name: string; isActive: boolean };
  project: { id: string; code: string; name: string } | null;
  supplierQuoteRef: string | null;
  discountAmount: string;
  vatPercent: string;
  subtotal: string;
  vatAmount: string;
  total: string;
  totalBdt: string;
  terms: string | null;
  notes: string | null;
  revision: number;
  createdBy: Ref;
  approvedBy: Ref | null;
  rejectedBy: Ref | null;
  closedBy: Ref | null;
  cancelledBy: Ref | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  sentAt: Date | null;
  closedAt: Date | null;
  closedReason: string | null;
  cancelledAt: Date | null;
  cancelledReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: PoLineRecord[];
  attachmentCount: number;
}

/** What a create / edit / amend writes (totals computed by the service). */
export interface PoWrite {
  supplierId: string;
  type: PoType;
  currency: Currency;
  exchangeRate: string;
  poDate: string;
  expectedDeliveryDate: string | null;
  deliverToWarehouseId: string;
  projectId: string | null;
  supplierQuoteRef: string | null;
  discountAmount: string;
  vatPercent: string;
  subtotal: string;
  vatAmount: string;
  total: string;
  totalBdt: string;
  terms: string | null;
  notes: string | null;
  lines: { id?: string; productId: string; qty: string; unitPrice: string; amount: string; note: string | null }[];
}

export interface RevisionRecord {
  id: string;
  revision: number;
  changedBy: Ref;
  reason: string;
  snapshot: unknown;
  /** `price` changes are hidden from roles without seeCost. */
  changes: { text: string; price: boolean }[];
  createdAt: Date;
}

/** A GRN linked to the PO (read from inventory's entries). */
/** One workflow step from the audit log (the timeline keeps every reject → resubmit round). */
export interface HistoryRecord {
  /** Without the "purchase_order." prefix, e.g. "submit". */
  action: string;
  at: Date;
  by: Ref | null;
  after: Record<string, unknown> | null;
}

export interface LinkedReceipt {
  id: string;
  number: string | null;
  draftRef: string;
  type: string;
  status: string;
  entryDate: string;
  createdBy: Ref;
  postedAt: Date | null;
  totalQty: string;
}

export interface PriceHistoryRow {
  poId: string;
  poNumber: string | null;
  poDate: string;
  status: PoStatus;
  supplier: { id: string; code: string; name: string };
  product: { id: string; code: string; name: string; unitCode: string };
  currency: Currency;
  qty: string;
  unitPrice: string;
  exchangeRate: string;
}

export interface ProductRef {
  id: string;
  code: string;
  name: string;
  unitCode: string;
  status: "ACTIVE" | "DISCONTINUED";
  purchaseCost: string;
  defaultSupplierId: string | null;
}

export interface PurchasingSettings {
  defaultTerms: string | null;
  defaultVatPercent: string;
}

export interface AttachmentRecord {
  id: string;
  entityId: string;
  fileKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  label: string | null;
  uploadedBy: Ref;
  createdAt: Date;
}

/* ─────────────── the store (one per DB client or transaction) ─────────────── */

export interface PurchasingStore {
  /** Opaque DB handle (the transaction inside `transaction()`). */
  readonly tx: unknown;
  audit: AuditService;

  // reference data (read models of other modules' tables)
  products(ids: string[]): Promise<ProductRef[]>;
  warehouse(id: string): Promise<{ id: string; code: string; name: string; isActive: boolean } | null>;
  warehouses(ids: string[]): Promise<{ id: string; code: string; name: string; isActive: boolean }[]>;
  project(id: string): Promise<{ id: string; code: string; name: string; isActive: boolean; status: string } | null>;
  fiscalYearStartMonth(): Promise<number>;
  nextNumber(docType: string, fiscalYear: string): Promise<number>;
  peekNumber(docType: string, fiscalYear: string): Promise<number>;
  settings(): Promise<PurchasingSettings>;
  updateSettings(data: Partial<PurchasingSettings>): Promise<PurchasingSettings>;

  // suppliers
  listSuppliers(q: ListQuery<SupplierFilters>): Promise<{ items: SupplierRecord[]; total: number }>;
  supplier(id: string): Promise<SupplierRecord | null>;
  supplierNameExists(nameKey: string, exceptId?: string): Promise<boolean>;
  createSupplier(data: SupplierWrite & { code: string; nameKey: string }): Promise<SupplierRecord>;
  updateSupplier(id: string, data: Partial<SupplierWrite> & { nameKey?: string; isActive?: boolean }): Promise<SupplierRecord>;
  supplierStats(id: string): Promise<SupplierStats>;

  // purchase orders
  po(id: string): Promise<PoRecord | null>;
  /** SELECT … FOR UPDATE on the PO row and its lines (sorted), then loads it. */
  lockPo(id: string): Promise<PoRecord | null>;
  listPos(q: ListQuery<PoFilters>, scope: { warehouseIds: string[]; today: string }): Promise<{ items: PoRecord[]; total: number }>;
  createPo(data: PoWrite & { draftRef: string; createdById: string }): Promise<string>;
  /** Replaces header and lines (draft / rejected edits). */
  replacePo(id: string, data: PoWrite): Promise<void>;
  /** Amendment: updates header, updates / adds / removes lines by id. */
  amendPo(id: string, header: Partial<PoWrite>, lines: { update: { id: string; qty: string; unitPrice: string; amount: string; note: string | null }[]; add: { productId: string; qty: string; unitPrice: string; amount: string; note: string | null }[]; remove: string[] }): Promise<void>;
  updatePo(id: string, data: Partial<Record<string, unknown>>): Promise<void>;
  updateLineQty(lineId: string, data: { receivedQty?: string; pendingReceiptQty?: string }): Promise<void>;
  addRevision(data: { poId: string; revision: number; changedById: string; reason: string; snapshot: unknown; changes: { text: string; price: boolean }[] }): Promise<void>;
  revisions(poId: string): Promise<RevisionRecord[]>;
  receipts(poId: string): Promise<LinkedReceipt[]>;
  /** The PO's workflow audit rows (create, submit, approve, reject, sent, amend, close, cancel), oldest first. */
  history(poId: string): Promise<HistoryRecord[]>;
  priceHistory(q: ListQuery<PriceHistoryFilters>): Promise<{ items: PriceHistoryRow[]; total: number }>;
  /** The latest approved price of a product from a supplier, in a currency. */
  lastPrice(productId: string, supplierId: string, currency: Currency): Promise<{ unitPrice: string; exchangeRate: string } | null>;
  /** The latest approved exchange rate of a supplier's imported POs in a currency. */
  lastRate(supplierId: string, currency: Currency): Promise<string | null>;
  overdue(today: string): Promise<PoRecord[]>;

  // attachments (generic Attachment table, entityType "PurchaseOrder")
  attachments(poId: string): Promise<AttachmentRecord[]>;
  attachment(id: string): Promise<AttachmentRecord | null>;
  addAttachment(data: Omit<AttachmentRecord, "id" | "createdAt" | "uploadedBy"> & { uploadedById: string }): Promise<AttachmentRecord>;
  deleteAttachment(id: string): Promise<void>;
}

export interface PurchasingUnitOfWork {
  store: PurchasingStore;
  transaction<T>(fn: (store: PurchasingStore) => Promise<T>): Promise<T>;
}

/* ─────────────── other ports ─────────────── */

export interface LowStockSuggestion {
  productId: string;
  suggestedQty: string;
  shortBy: string;
}

/** Stock data purchasing needs (implemented with the inventory module). */
export interface StockDirectory {
  /** Low-stock suggestions for the products (only those below their minimum). */
  lowStock(productIds: string[], warehouseId: string | null): Promise<LowStockSuggestion[]>;
}

export type PoEvent = "submitted" | "approved" | "rejected" | "received" | "fully_received";

/** Notifications (notifications module), sent after commit; implementations swallow errors. */
export interface PurchasingNotifier {
  po(event: PoEvent, po: PoRecord, ctx: { actorId: string; receipt?: { id: string; number: string | null } }): Promise<void>;
  /** The daily overdue digest: emails per recipient; returns how many were queued. */
  overdueDigest(pos: PoRecord[], today: string): Promise<number>;
}

/** PDF rendering and supplier email go through the worker. */
export interface PoDocumentQueue {
  enqueue(job: { purchaseOrderId: string; userId: string; userName: string; showPrices: boolean; email?: { to: string; cc: string | null; message: string | null } }): Promise<{ jobId: string }>;
}

export interface FileStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Uint8Array; contentType: string } | null>;
  delete(keys: string[]): Promise<void>;
}

export const noNotifier: PurchasingNotifier = { po: async () => undefined, overdueDigest: async () => 0 };
