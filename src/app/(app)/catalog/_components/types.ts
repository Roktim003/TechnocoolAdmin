export type { CatalogDto, CategoryDto, ImportJobDto, PhotoDto, ProductDto, ProductSummaryDto, UnitDto } from "@/modules/catalog/application/dto";

export interface CatalogCaps {
  userId: string;
  /** catalog ≥ CREATE */
  canCreate: boolean;
  /** catalog = FULL */
  canManage: boolean;
  /** role flag seeCost */
  seeCost: boolean;
}

export const STATUS_LABEL = { ACTIVE: "Active", DISCONTINUED: "Discontinued" } as const;
export const SOURCE_LABEL = { IMPORTED: "Imported", LOCAL: "Local" } as const;
