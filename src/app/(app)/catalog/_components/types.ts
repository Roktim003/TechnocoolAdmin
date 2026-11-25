export type { CatalogDto, CategoryDto, ImportJobDto, PhotoDto, ProductDto, ProductSummaryDto, UnitDto } from "@/modules/catalog/application/dto";

export interface CatalogCaps {
  userId: string;
  /** catalog ≥ CREATE */
  canCreate: boolean;
  /** catalog = FULL */
  canManage: boolean;
  /** role flag seeCost */
  seeCost: boolean;
  /** inventory = FULL and seeCost: may post opening stock with a new product (it needs a unit cost). */
  canAddOpeningStock: boolean;
  /** inventory ≥ VIEW: the product page shows its stock per warehouse. */
  canSeeStock: boolean;
  /** inventory ≥ CREATE: may create stock entries. */
  canAddStock: boolean;
}

export const STATUS_LABEL = { ACTIVE: "Active", DISCONTINUED: "Discontinued" } as const;
export const SOURCE_LABEL = { IMPORTED: "Imported", LOCAL: "Local" } as const;
