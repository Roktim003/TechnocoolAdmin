import type { ActorContext, AuditService } from "@/modules/audit/application/audit.service";
import type { InventoryProjectQuery } from "@/modules/inventory/application/ports";
import type { PermissionLevel } from "@/shared/rbac/levels";
import type { CostCategory, ProjectStatus, ProjectType } from "../domain/types";

export type { InventoryProjectQuery };

export interface ProjectsActor extends ActorContext {
  actorId: string;
  name: string;
  /** projects module level */
  level: PermissionLevel;
  inventoryLevel: PermissionLevel;
  purchasingLevel: PermissionLevel;
  warehouseIds: string[];
  canSeeCost: boolean;
  canSeeMargin: boolean;
  /** The built-in Admin role (may undo a close). */
  isAdmin: boolean;
}

export interface Ref {
  id: string;
  name: string;
}

export interface ProjectRecord {
  id: string;
  code: string;
  name: string;
  clientName: string | null;
  clientContactPerson: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  siteAddress: string | null;
  projectType: ProjectType;
  status: ProjectStatus;
  defaultWarehouse: { id: string; code: string; name: string } | null;
  startDate: string | null;
  expectedEndDate: string | null;
  actualEndDate: string | null;
  siteEngineer: (Ref & { email: string | null }) | null;
  siteEngineerName: string | null;
  contractValue: string | null;
  notes: string | null;
  closedAt: Date | null;
  closedBy: Ref | null;
  closeReason: string | null;
  costAlertLevel: number;
  createdBy: Ref | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectWrite {
  name: string;
  clientName: string | null;
  clientContactPerson: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  siteAddress: string | null;
  projectType: ProjectType;
  defaultWarehouseId: string | null;
  startDate: string | null;
  expectedEndDate: string | null;
  siteEngineerUserId: string | null;
  siteEngineerName: string | null;
  contractValue: string | null;
  notes: string | null;
}

export interface CostRecord {
  id: string;
  projectId: string;
  date: string;
  category: CostCategory;
  description: string;
  amount: string;
  vendorOrPayee: string | null;
  referenceNo: string | null;
  createdBy: Ref;
  voidedAt: Date | null;
  voidedBy: Ref | null;
  voidReason: string | null;
  attachmentCount: number;
  createdAt: Date;
}

export interface StatusHistoryRecord {
  id: string;
  fromStatus: ProjectStatus | null;
  toStatus: ProjectStatus;
  changedBy: Ref;
  reason: string | null;
  at: Date;
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

export interface AuditRow {
  id: string;
  action: string;
  at: Date;
  by: Ref | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface ProjectListFilters {
  status?: ProjectStatus;
  projectType?: ProjectType;
  siteEngineerUserId?: string;
  warehouseId?: string;
  active?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface ProjectsStore {
  audit: AuditService;
  /** All matching projects in this order (totals are computed per project; lists are small). */
  listProjects(filters: ProjectListFilters, q: string | undefined, orderBy: { field: string; direction: "asc" | "desc" }[]): Promise<ProjectRecord[]>;
  statusCounts(filters: Omit<ProjectListFilters, "status">, q: string | undefined): Promise<Record<ProjectStatus, number>>;
  project(id: string): Promise<ProjectRecord | null>;
  /** SELECT … FOR UPDATE, then loads it. */
  lockProject(id: string): Promise<ProjectRecord | null>;
  nextNumber(docType: string, fiscalYear: string): Promise<number>;
  peekNumber(docType: string, fiscalYear: string): Promise<number>;
  createProject(data: ProjectWrite & { code: string; status: ProjectStatus; createdById: string }): Promise<string>;
  updateProject(id: string, data: Partial<ProjectWrite & { status: ProjectStatus; actualEndDate: string | null; closedAt: Date | null; closedById: string | null; closeReason: string | null; isActive: boolean; costAlertLevel: number }>): Promise<void>;
  addHistory(data: { projectId: string; fromStatus: ProjectStatus | null; toStatus: ProjectStatus; changedById: string; reason: string | null }): Promise<void>;
  history(projectId: string): Promise<StatusHistoryRecord[]>;
  /** Projects material may be issued to / returned for (options for the stock form). */
  options(statuses: readonly ProjectStatus[], activeOnly: boolean, q?: string): Promise<ProjectRecord[]>;

  costs(projectId: string, filters: { category?: CostCategory; includeVoided: boolean }): Promise<CostRecord[]>;
  cost(id: string): Promise<CostRecord | null>;
  lockCost(id: string): Promise<CostRecord | null>;
  addCost(data: { projectId: string; date: string; category: CostCategory; description: string; amount: string; vendorOrPayee: string | null; referenceNo: string | null; createdById: string }): Promise<string>;
  voidCost(id: string, data: { voidedById: string; voidReason: string }): Promise<void>;
  /** Non-voided cost totals per project and category. */
  costTotals(projectIds: string[]): Promise<Map<string, Record<CostCategory, string>>>;

  attachments(entityType: string, entityId: string): Promise<AttachmentRecord[]>;
  attachmentCounts(entityType: string, entityIds: string[]): Promise<Map<string, number>>;
  attachment(id: string): Promise<AttachmentRecord | null>;
  addAttachment(data: Omit<AttachmentRecord, "id" | "createdAt" | "uploadedBy"> & { uploadedById: string }): Promise<AttachmentRecord>;
  deleteAttachment(id: string): Promise<void>;

  /** Audit rows about the project (its costs are logged against the project too). */
  auditRows(projectId: string, limit: number): Promise<AuditRow[]>;
  user(id: string): Promise<{ id: string; name: string; status: string } | null>;
  /** Active users (site engineer picker). */
  activeUsers(): Promise<Ref[]>;
  warehouse(id: string): Promise<{ id: string; isActive: boolean } | null>;
  fiscalYearStartMonth(): Promise<number>;
}

export interface ProjectsUnitOfWork {
  store: ProjectsStore;
  transaction<T>(fn: (store: ProjectsStore) => Promise<T>): Promise<T>;
}

export interface FileStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Uint8Array; contentType: string } | null>;
  delete(keys: string[]): Promise<void>;
}

/** Notifications (implemented in interface/events.ts). Never throws. */
export interface ProjectsNotifier {
  statusChanged(p: ProjectRecord, from: ProjectStatus, to: ProjectStatus, ctx: { actorId: string; actorName: string; reason: string | null }): Promise<void>;
  costAlert(p: ProjectRecord, threshold: 90 | 100, summary: { totalCost: string; contractValue: string; costUsedPercent: string }): Promise<void>;
}

export const noNotifier: ProjectsNotifier = { statusChanged: async () => undefined, costAlert: async () => undefined };

/** Queues the cost-alert check (after costs, issues, returns, contract changes). Never throws. */
export interface CostAlertQueue {
  enqueue(projectId: string): Promise<void>;
}

export const noAlertQueue: CostAlertQueue = { enqueue: async () => undefined };

export interface CostStatementQueue {
  enqueue(job: { projectId: string; userId: string; userName: string; showMargin: boolean }): Promise<{ jobId: string }>;
}
