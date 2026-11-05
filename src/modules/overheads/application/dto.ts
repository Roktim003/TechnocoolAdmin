import { z, emptyToUndefined } from "@/shared/validation/zod";
import { listQuerySchema } from "@/shared/pagination/list-query";
import { MoneySchema } from "@/shared/money/money";
import { booleanLike, text, upper } from "@/modules/inventory/application/dto";
import { OVERHEAD_SCOPES, WAREHOUSE_COST_CATEGORIES } from "../domain/types";
import { monthOf } from "../domain/rules";

export const ScopeSchema = z.preprocess(upper, z.enum(OVERHEAD_SCOPES)).openapi({ type: "string", enum: [...OVERHEAD_SCOPES] });
export const CategorySchema = z.preprocess(upper, z.enum(WAREHOUSE_COST_CATEGORIES)).openapi({ type: "string", enum: [...WAREHOUSE_COST_CATEGORIES] });

/** "YYYY-MM" (or a date in that month) → the first day of the month. */
export const MonthSchema = z
  .string()
  .transform((v, ctx) => {
    const m = monthOf(v);
    if (!m) {
      ctx.addIssue({ code: "custom", message: "Use a month like 2026-11." });
      return z.NEVER;
    }
    return m;
  })
  .openapi({ type: "string", example: "2026-11", description: "YYYY-MM (stored as the first day of the month)" });

const Amount = MoneySchema.refine((v) => Number(v) > 0, "Enter an amount above 0.");
const Reason = z.string().trim().min(3, "Give a reason (at least 3 characters).").max(500);
const Description = z.string().trim().min(1, "Describe the cost.").max(300);
const nullableUuid = z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable().optional());

export const CreateWarehouseCostSchema = z
  .object({
    scope: ScopeSchema.openapi({ description: "WAREHOUSE: store charge / holding (warehouseId required). COMPANY: established cost (no warehouse)." }),
    warehouseId: nullableUuid,
    category: CategorySchema,
    month: MonthSchema,
    amount: Amount,
    description: Description,
    vendorOrPayee: text(150),
    referenceNo: text(100),
  })
  .strict()
  .openapi("CreateWarehouseCostRequest");
export type CreateWarehouseCostInput = z.infer<typeof CreateWarehouseCostSchema>;

/** Omitted fields keep their value; scope and category must still agree. */
export const UpdateWarehouseCostSchema = z
  .object({
    scope: ScopeSchema.optional(),
    warehouseId: nullableUuid,
    category: CategorySchema.optional(),
    month: MonthSchema.optional(),
    amount: Amount.optional(),
    description: Description.optional(),
    vendorOrPayee: text(150),
    referenceNo: text(100),
    reason: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), Reason.optional()).openapi({ type: "string", description: "Why it changed (kept in the history)" }),
  })
  .strict()
  .openapi("UpdateWarehouseCostRequest");
export type UpdateWarehouseCostInput = z.infer<typeof UpdateWarehouseCostSchema>;

export const VoidWarehouseCostSchema = z.object({ reason: Reason }).strict().openapi("VoidWarehouseCostRequest");

export const WarehouseCostListQuerySchema = listQuerySchema({
  sortFields: ["month", "amount", "createdAt", "category"],
  defaultSort: "-month",
  filters: {
    scope: emptyToUndefined(ScopeSchema),
    warehouseId: emptyToUndefined(z.string().uuid()),
    category: emptyToUndefined(CategorySchema),
    monthFrom: emptyToUndefined(MonthSchema),
    monthTo: emptyToUndefined(MonthSchema),
    includeVoided: emptyToUndefined(booleanLike).openapi({ type: "boolean" }),
  },
});
export type WarehouseCostFilters = {
  scope?: "WAREHOUSE" | "COMPANY";
  warehouseId?: string;
  category?: "STORE_CHARGE" | "HOLDING" | "ESTABLISHMENT";
  monthFrom?: string;
  monthTo?: string;
  includeVoided?: boolean;
};

export const SummaryQuerySchema = z
  .object({
    monthFrom: emptyToUndefined(MonthSchema).openapi({ description: "Default: 5 months before monthTo" }),
    monthTo: emptyToUndefined(MonthSchema).openapi({ description: "Default: this month" }),
  })
  .strict();
