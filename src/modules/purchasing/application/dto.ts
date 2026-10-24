import { z, emptyToUndefined } from "@/shared/validation/zod";
import { listQuerySchema } from "@/shared/pagination/list-query";
import { MoneySchema } from "@/shared/money/money";
import { DateRangeFilters } from "@/shared/time/dates";
import { booleanLike, CurrencySchema, Email, IsoDate, Name, nullableId, PercentSchema, PositiveQty, Price4Schema, RateSchema, text, upper } from "@/modules/inventory/application/dto";
import { PO_STATUSES } from "../domain/types";

export const PoStatusSchema = z.enum(PO_STATUSES).openapi("PurchaseOrderStatus");
export const PoTypeSchema = z.enum(["LOCAL", "IMPORTED"]).openapi("PurchaseOrderType");
const SupplierTypeSchema = z.preprocess(upper, z.enum(["LOCAL", "FOREIGN"])).openapi({ type: "string", enum: ["LOCAL", "FOREIGN"] });

/* ───────────────────────────── suppliers ───────────────────────────── */

export const SupplierListQuerySchema = listQuerySchema({
  sortFields: ["name", "code", "createdAt"],
  defaultSort: "name",
  filters: {
    type: emptyToUndefined(SupplierTypeSchema),
    isActive: emptyToUndefined(booleanLike).openapi({ type: "boolean", description: "true: active only, false: inactive only" }),
    active: emptyToUndefined(booleanLike).openapi({ type: "boolean", description: "Alias of isActive (Module 2)" }),
    brand: emptyToUndefined(z.string().trim().max(100)).openapi({ description: "Matches 'brands supplied'" }),
  },
});
export type SupplierFilters = { type?: "LOCAL" | "FOREIGN"; isActive?: boolean; active?: boolean; brand?: string };

const supplierFields = {
  contactPerson: text(100),
  phone: text(30),
  email: Email,
  address: text(300),
  brandsSupplied: text(300).openapi({ example: "LG, Daikin" }),
  paymentTermsNote: text(500).openapi({ example: "30 days after delivery" }),
  notes: text(2000),
};

export const CreateSupplierSchema = z
  .object({
    name: Name,
    type: SupplierTypeSchema.default("LOCAL"),
    defaultCurrency: CurrencySchema.optional(),
    currency: CurrencySchema.optional().openapi({ description: "Deprecated alias of defaultCurrency (Module 2)" }),
    ...supplierFields,
  })
  .strict()
  .openapi("CreateSupplierRequest");

export const UpdateSupplierSchema = z
  .object({
    name: Name.optional(),
    type: SupplierTypeSchema.optional(),
    defaultCurrency: CurrencySchema.optional(),
    currency: CurrencySchema.optional().openapi({ description: "Deprecated alias of defaultCurrency" }),
    ...supplierFields,
    isActive: z.boolean().optional(),
  })
  .strict()
  .openapi("UpdateSupplierRequest");

export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof UpdateSupplierSchema>;

/* ───────────────────────────── purchase orders ───────────────────────────── */

export const PoLineInputSchema = z
  .object({
    id: nullableId.openapi({ description: "Amendments: the existing line (omit for a new line)" }),
    productId: z.string().uuid(),
    qty: PositiveQty,
    unitPrice: Price4Schema.openapi({ description: "In the PO currency. Must be > 0 to submit or approve." }),
    note: text(500),
  })
  .strict();

const poShape = {
  supplierId: z.string().uuid(),
  poDate: IsoDate.optional().openapi({ description: "Defaults to today (Asia/Dhaka)" }),
  expectedDeliveryDate: emptyToUndefined(IsoDate).openapi({ type: "string", example: "2026-11-15" }),
  deliverToWarehouseId: z.string().uuid(),
  projectId: nullableId,
  supplierQuoteRef: text(100),
  exchangeRate: RateSchema.optional().openapi({ description: "Imported POs: required to submit / approve (indicative BDT per unit)" }),
  discountAmount: MoneySchema.optional().openapi({ description: "Local POs only" }),
  vatPercent: PercentSchema.optional().openapi({ description: "Local POs only (defaults to the purchasing setting)" }),
  terms: text(5000),
  notes: text(2000),
  lines: z.array(PoLineInputSchema).max(200).default([]),
};

export const CreatePoSchema = z
  .object({
    action: z.enum(["draft", "submit", "approve"]).openapi({ description: "draft: save. submit: send for approval (number assigned). approve: Save & approve (purchasing APPROVE; own PO only with FULL)." }),
    ...poShape,
  })
  .strict()
  .openapi("CreatePurchaseOrderRequest");
export const UpdatePoSchema = z.object(poShape).strict().openapi("UpdatePurchaseOrderRequest");
export const CalculatePoSchema = z
  .object({ ...poShape, supplierId: z.string().uuid(), deliverToWarehouseId: z.string().uuid().optional() })
  .strict()
  .openapi("CalculatePurchaseOrderRequest");

export type CreatePoInput = z.infer<typeof CreatePoSchema>;
export type PoInput = z.infer<typeof UpdatePoSchema>;
export type CalculatePoInput = z.infer<typeof CalculatePoSchema>;

export const PoReasonSchema = z.object({ reason: z.string().trim().min(3, "Give a reason (at least 3 characters).").max(500) }).strict().openapi("PurchaseOrderReasonRequest");

export const AmendPoSchema = z
  .object({
    reason: z.string().trim().min(3, "Give a reason (at least 3 characters).").max(500),
    expectedDeliveryDate: z.preprocess((v) => (v === "" ? null : v), IsoDate.nullable().optional()),
    exchangeRate: RateSchema.optional(),
    discountAmount: MoneySchema.optional(),
    vatPercent: PercentSchema.optional(),
    lines: z.array(PoLineInputSchema).min(1).max(200).optional().openapi({ description: "The full new list of lines (existing ones by id). Omit to keep the lines." }),
  })
  .strict()
  .openapi("AmendPurchaseOrderRequest");
export type AmendPoInput = z.infer<typeof AmendPoSchema>;

export const MarkSentSchema = z
  .object({
    emailSupplier: z.boolean().optional().openapi({ description: "Also email the PO PDF to the supplier" }),
    to: z.string().trim().email().max(200).optional(),
    message: text(2000),
  })
  .strict()
  .openapi("MarkSentRequest");

export const EmailPoSchema = z
  .object({
    to: z.string().trim().email("Enter a valid email.").max(200).optional().openapi({ description: "Defaults to the supplier's email" }),
    cc: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().email("Enter a valid email.").max(200).optional()),
    message: text(2000),
  })
  .strict()
  .openapi("EmailPurchaseOrderRequest");
export type EmailPoInput = z.infer<typeof EmailPoSchema>;

export const FromLowStockSchema = z
  .object({
    productIds: z.array(z.string().uuid()).min(1).max(200),
    warehouseId: nullableId.openapi({ description: "Deliver-to warehouse (default: your first warehouse)" }),
  })
  .strict()
  .openapi("PurchaseOrdersFromLowStockRequest");

export const PoFilterShape = {
  status: emptyToUndefined(z.preprocess(upper, PoStatusSchema)),
  supplierId: emptyToUndefined(z.string().uuid()),
  type: emptyToUndefined(z.preprocess(upper, PoTypeSchema)),
  warehouseId: emptyToUndefined(z.string().uuid()),
  projectId: emptyToUndefined(z.string().uuid()),
  productId: emptyToUndefined(z.string().uuid()),
  overdue: emptyToUndefined(booleanLike).openapi({ type: "boolean", description: "Expected delivery before today and still approved / sent / partly received" }),
  receivable: emptyToUndefined(booleanLike).openapi({ type: "boolean", description: "Approved, sent or partly received" }),
  dateFrom: DateRangeFilters.from,
  dateTo: DateRangeFilters.to,
};
export const PoListQuerySchema = listQuerySchema({ sortFields: ["poDate", "number", "createdAt", "expectedDeliveryDate", "total"], defaultSort: "-createdAt", filters: PoFilterShape });
export type PoFilters = {
  status?: string;
  supplierId?: string;
  type?: string;
  warehouseId?: string;
  projectId?: string;
  productId?: string;
  overdue?: boolean;
  receivable?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
};

export const ReceivableListQuerySchema = listQuerySchema({
  sortFields: ["poDate", "number"],
  defaultSort: "-poDate",
  filters: { warehouseId: emptyToUndefined(z.string().uuid()), supplierId: emptyToUndefined(z.string().uuid()), type: emptyToUndefined(z.preprocess(upper, PoTypeSchema)) },
});

export const PriceHistoryQuerySchema = listQuerySchema({ sortFields: ["poDate"], defaultSort: "-poDate", filters: { productId: emptyToUndefined(z.string().uuid()), supplierId: emptyToUndefined(z.string().uuid()) } });
export type PriceHistoryFilters = { productId?: string; supplierId?: string };

export const UpdatePurchasingSettingsSchema = z
  .object({ defaultTerms: text(5000), defaultVatPercent: PercentSchema.optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one setting." })
  .openapi("UpdatePurchasingSettingsRequest");
