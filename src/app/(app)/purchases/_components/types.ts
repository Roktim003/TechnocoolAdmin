import type { TagKind } from "@/components/ui/Tag";
import { PO_STATUS_LABEL, PO_STATUSES, type PoStatus } from "@/modules/purchasing/domain/types";
import type { toPoDetailDto, toPoDto, toPriceHistoryDto, toReceivableDto, toReceivableSummaryDto, toSupplierDetailDto, toSupplierDto } from "@/modules/purchasing/interface/mappers";

export { PO_STATUS_LABEL, PO_STATUSES, type PoStatus };

export type PoDto = ReturnType<typeof toPoDto>;
export type PoDetailDto = ReturnType<typeof toPoDetailDto>;
export type PoLineDto = PoDto["lines"][number];
export type SupplierDto = ReturnType<typeof toSupplierDto>;
export type SupplierDetailDto = ReturnType<typeof toSupplierDetailDto>;
export type ReceivableDto = ReturnType<typeof toReceivableDto>;
export type ReceivableSummaryDto = ReturnType<typeof toReceivableSummaryDto>;
export type PriceHistoryDto = ReturnType<typeof toPriceHistoryDto>;

export interface PurchasesCaps {
  userId: string;
  /** purchasing ≥ CREATE */
  canCreate: boolean;
  /** purchasing ≥ APPROVE */
  canApprove: boolean;
  /** purchasing = FULL */
  canFull: boolean;
  /** inventory ≥ CREATE (may receive goods against a PO) */
  canReceive: boolean;
  seeCost: boolean;
  warehouseIds: string[];
}

export const PO_STATUS_TAG: Record<PoStatus, TagKind> = {
  DRAFT: "gray",
  PENDING_APPROVAL: "yellow",
  REJECTED: "red",
  APPROVED: "blue",
  SENT: "purple",
  PARTLY_RECEIVED: "yellow",
  FULLY_RECEIVED: "green",
  CLOSED: "gray",
  CANCELLED: "gray",
};

export const CURRENCIES = ["BDT", "USD", "EUR", "CNY", "MYR", "THB"] as const;
