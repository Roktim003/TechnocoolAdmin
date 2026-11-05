import type { ActorContext, AuditService } from "@/modules/audit/application/audit.service";
import type { ListQuery } from "@/shared/pagination/list-query";
import type { PermissionLevel } from "@/shared/rbac/levels";
import type { OverheadScope, WarehouseCostCategory } from "../domain/types";
import type { WarehouseCostFilters } from "./dto";

export interface OverheadsActor extends ActorContext {
  actorId: string;
  name: string;
  level: PermissionLevel;
  /** overheads ≥ VIEW and seeCost */
  canSee: boolean;
  /** overheads ≥ CREATE and seeCost */
  canEdit: boolean;
  warehouseIds: string[];
}

export interface Ref {
  id: string;
  name: string;
}

export interface WarehouseCostRecord {
  id: string;
  scope: OverheadScope;
  warehouse: { id: string; code: string; name: string } | null;
  category: WarehouseCostCategory;
  month: string;
  amount: string;
  description: string;
  vendorOrPayee: string | null;
  referenceNo: string | null;
  createdBy: Ref;
  updatedBy: Ref | null;
  voidedAt: Date | null;
  voidedBy: Ref | null;
  voidReason: string | null;
  attachmentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WarehouseCostWrite {
  scope: OverheadScope;
  warehouseId: string | null;
  category: WarehouseCostCategory;
  month: string;
  amount: string;
  description: string;
  vendorOrPayee: string | null;
  referenceNo: string | null;
}

export interface AuditRow {
  id: string;
  action: string;
  at: Date;
  by: Ref | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
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

/** Monthly sums of non-voided lines, per warehouse (null = company) and category. */
export interface MonthlyCostRow {
  month: string;
  warehouseId: string | null;
  category: WarehouseCostCategory;
  amount: string;
}

export interface OverheadsStore {
  audit: AuditService;
  list(q: ListQuery<WarehouseCostFilters>, warehouseIds: string[]): Promise<{ items: WarehouseCostRecord[]; total: number; totalAmount: string }>;
  get(id: string): Promise<WarehouseCostRecord | null>;
  lock(id: string): Promise<WarehouseCostRecord | null>;
  create(data: WarehouseCostWrite & { createdById: string }): Promise<string>;
  update(id: string, data: WarehouseCostWrite & { updatedById: string }): Promise<void>;
  void(id: string, data: { voidedById: string; voidReason: string }): Promise<void>;
  auditRows(id: string): Promise<AuditRow[]>;
  warehouse(id: string): Promise<{ id: string; code: string; name: string; isActive: boolean } | null>;
  warehouses(ids: string[]): Promise<{ id: string; code: string; name: string }[]>;
  monthlyCosts(from: string, to: string, warehouseIds: string[]): Promise<MonthlyCostRow[]>;
  /**
   * Average stock value per warehouse and month: the mean of each day's closing stock value
   * (from the stock ledger) over the month's days up to `today`.
   */
  averageStockValues(from: string, to: string, warehouseIds: string[], today: string): Promise<{ month: string; warehouseId: string; averageStockValue: string }[]>;
  attachments(entityId: string): Promise<AttachmentRecord[]>;
  attachment(id: string): Promise<AttachmentRecord | null>;
  addAttachment(data: Omit<AttachmentRecord, "id" | "createdAt" | "uploadedBy"> & { uploadedById: string }): Promise<AttachmentRecord>;
  deleteAttachment(id: string): Promise<void>;
}

export interface OverheadsUnitOfWork {
  store: OverheadsStore;
  transaction<T>(fn: (store: OverheadsStore) => Promise<T>): Promise<T>;
}

export interface FileStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Uint8Array; contentType: string } | null>;
  delete(keys: string[]): Promise<void>;
}
