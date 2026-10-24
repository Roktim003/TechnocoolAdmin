import type { TagKind } from "@/components/ui/Tag";

export type CountStatus = "DRAFT" | "COUNTING" | "SUBMITTED" | "APPROVED" | "CANCELLED";

export const COUNT_STATUS_LABEL: Record<CountStatus, string> = { DRAFT: "Draft", COUNTING: "Counting", SUBMITTED: "Waiting for approval", APPROVED: "Approved", CANCELLED: "Cancelled" };
export const COUNT_STATUS_TAG: Record<CountStatus, TagKind> = { DRAFT: "blue", COUNTING: "purple", SUBMITTED: "yellow", APPROVED: "green", CANCELLED: "gray" };
export const SCOPE_LABEL: Record<string, string> = { ALL: "Whole warehouse", CATALOG: "By brand", CATEGORY: "By category", SELECTED_PRODUCTS: "Selected products" };

export interface CountLineDto {
  id: string;
  product: { id: string; code: string; name: string; unitCode: string; barcode: string | null; model: string | null; trackSerial: boolean };
  condition: "GOOD" | "DAMAGED";
  systemQty?: string | null;
  variance?: string | null;
  countedQty: string | null;
  notCounted: boolean;
  countedBy: { id: string; name: string } | null;
  countedAt: string | null;
  recountRequested: boolean;
  note: string | null;
  serials: { serial: string; result?: "FOUND" | "MISSING" | "UNEXPECTED" }[];
}

export interface CountDto {
  id: string;
  number: string;
  warehouse: { id: string; code: string; name: string };
  scope: string;
  scopeIds: string[];
  blindCount: boolean;
  systemVisible: boolean;
  status: CountStatus;
  notes: string | null;
  createdBy: { id: string; name: string };
  submittedBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  adjustmentEntry: { id: string; number: string | null } | null;
  startedAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  progress: { total: number; counted: number; recount: number };
  lines: CountLineDto[];
  actions: { edit: boolean; start: boolean; count: boolean; submit: boolean; approve: boolean; requestRecount: boolean; cancel: boolean; printSheet: boolean };
}

export interface CountSummaryDto {
  id: string;
  number: string;
  warehouse: { id: string; code: string; name: string };
  scope: string;
  blindCount: boolean;
  status: CountStatus;
  createdBy: { id: string; name: string };
  startedAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  progress: { total: number; counted: number };
  adjustmentEntry: { id: string; number: string | null } | null;
}

export interface VarianceDto {
  systemVisible: boolean;
  progress: { total: number; counted: number };
  totals: { linesWithVariance: number | null; gainQty?: string; lossQty?: string; gainValue?: string; lossValue?: string; netValue?: string };
  lines: {
    lineId: string;
    product: CountLineDto["product"];
    condition: "GOOD" | "DAMAGED";
    systemQty: string | null;
    countedQty: string | null;
    notCounted: boolean;
    variance: string | null;
    varianceValue?: string;
    missingSerials: string[];
    unexpectedSerials: string[];
    recountRequested: boolean;
    countedBy: { name: string } | null;
  }[];
}
