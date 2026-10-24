import { z, emptyToUndefined } from "@/shared/validation/zod";
import { listQuerySchema } from "@/shared/pagination/list-query";
import { MoneySchema, QuantitySchema } from "@/shared/money/money";
import { DateRangeFilters } from "@/shared/time/dates";
import { CURRENCIES, ENTRY_TYPES, USER_ENTRY_TYPES } from "../domain/types";

/* ───────────────────────────── helpers ───────────────────────────── */

export const text = (max: number) =>
  z.preprocess((v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v), z.string().max(max, `At most ${max} characters.`).nullable().optional());
export const nullableId = z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable().optional());
export const upper = (v: unknown) => (typeof v === "string" ? v.trim().toUpperCase() : v);
export const booleanLike = z.preprocess((v) => (v === "true" || v === "1" ? true : v === "false" || v === "0" ? false : v), z.boolean());

export const PositiveQty = QuantitySchema.refine((v) => /[1-9]/.test(v), { message: "Quantity must be greater than 0." });
/** Unit prices allow 4 decimals (foreign-currency costs). */
export const Price4Schema = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : v.trim().replace(/,/g, "");
    if (!/^\d{1,10}(\.\d{1,4})?$/.test(s)) {
      ctx.addIssue({ code: "custom", message: "Enter an amount ≥ 0 with at most 4 decimals." });
      return z.NEVER;
    }
    return s;
  })
  .openapi({ type: "string", example: "1250.50" });
export const RateSchema = Price4Schema.refine((v) => /[1-9]/.test(v), { message: "Exchange rate must be greater than 0." }).openapi({ type: "string", example: "122.50" });
export const PercentSchema = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const s = String(v).trim();
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(s) || Number(s) > 100) {
      ctx.addIssue({ code: "custom", message: "Enter a percentage between 0 and 100." });
      return z.NEVER;
    }
    return s;
  })
  .openapi({ type: "string", example: "15" });
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.").refine((s) => !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()), "Invalid date.");

export const EntryTypeSchema = z.enum(ENTRY_TYPES).openapi("StockEntryType");
export const UserEntryTypeSchema = z.enum(USER_ENTRY_TYPES as [string, ...string[]]);
export const EntryStatusSchema = z.enum(["DRAFT", "PENDING", "POSTED", "REJECTED", "CANCELLED", "REVERSED", "DISPATCHED", "RECEIVED"]).openapi("StockEntryStatus");
export const ConditionSchema = z.preprocess(upper, z.enum(["GOOD", "DAMAGED"])).openapi({ type: "string", enum: ["GOOD", "DAMAGED"] });
export const CurrencySchema = z.preprocess(upper, z.enum(["BDT", "USD", "EUR", "CNY", "MYR", "THB"])).openapi({ type: "string", enum: CURRENCIES });
export const ProjectStatusSchema = z.preprocess(upper, z.enum(["PLANNING", "RUNNING", "ON_HOLD", "COMPLETED", "CLOSED"])).openapi({ type: "string", enum: ["PLANNING", "RUNNING", "ON_HOLD", "COMPLETED", "CLOSED"] });

/* ───────────────────────────── entries ───────────────────────────── */

export const LineInputSchema = z
  .object({
    productId: z.string().uuid(),
    qty: PositiveQty,
    unitPrice: Price4Schema.optional().openapi({ description: "Foreign cost (imports), BDT cost (local GRN / opening), selling price (sales; defaults to the product's selling price). Ignored for other types." }),
    condition: ConditionSchema.optional().openapi({ description: "Returns from site: condition of the returned goods. Write-offs / returns to supplier: which balance to take from." }),
    originalLineId: nullableId,
    purchaseOrderLineId: nullableId.openapi({ description: "GRNs against a PO: the PO line (matched by product when omitted)" }),
    serials: z.array(z.string().trim().min(1).max(100)).max(1000).optional().openapi({ description: "Required (exactly qty) for serial-tracked products" }),
    note: text(500),
  })
  .strict();

export const ChargeInputSchema = z
  .object({
    type: z.preprocess(upper, z.enum(["CUSTOMS_DUTY", "AIT", "IMPORT_VAT", "FREIGHT", "INSURANCE", "CNF", "OTHER"])),
    mode: z.preprocess(upper, z.enum(["PERCENT_OF_GOODS", "AMOUNT_BDT"])),
    value: Price4Schema,
    includeInCost: z.boolean().default(true),
    label: text(100),
  })
  .strict();

const entryShape = {
  type: UserEntryTypeSchema.openapi({ type: "string", enum: USER_ENTRY_TYPES }),
  entryDate: IsoDate.optional().openapi({ description: "Defaults to today (Asia/Dhaka). Can't be in the future." }),
  warehouseId: z.string().uuid().openapi({ description: "The warehouse (the 'from' warehouse for transfers)" }),
  toWarehouseId: nullableId,
  supplierId: nullableId,
  customerId: nullableId,
  projectId: nullableId,
  originalEntryId: nullableId.openapi({ description: "Returns from site: the issue. Returns to supplier: the GRN." }),
  purchaseOrderId: nullableId.openapi({
    description:
      "GRNs only: receive against an approved purchase order. Supplier and GRN type must match the PO, products must be on it, quantities can't exceed what is still to be received (422 OVER_RECEIPT). Unit prices and currency come from the PO server-side (client prices are ignored); imports take the PO exchange rate unless a user with seeCost sends one (customs rate).",
  }),
  poNumberText: text(100),
  supplierInvoiceNo: text(100),
  lcNo: text(100),
  billOfEntryNo: text(100),
  challanNo: text(100),
  siteAddress: text(300),
  receivedBy: text(100),
  vehicle: text(100),
  reason: text(300),
  description: text(2000),
  customerPhone: text(30),
  customerAddress: text(300),
  notes: text(2000),
  currency: CurrencySchema.optional(),
  exchangeRate: RateSchema.optional(),
  discountAmount: MoneySchema.optional(),
  vatPercent: PercentSchema.optional().openapi({ description: "Sales only. Defaults to the inventory setting." }),
  lines: z.array(LineInputSchema).max(200).default([]),
  charges: z.array(ChargeInputSchema).max(20).default([]).openapi({ description: "Imports only: landed-cost charges" }),
  confirmBelowCost: z.boolean().optional().openapi({ description: "Admin only: allow a sale priced below average cost" }),
};

export const CreateEntrySchema = z
  .object({ action: z.enum(["draft", "submit", "post"]).openapi({ description: "draft: save only. submit: send for verification (reserves stock). post: post immediately (inventory FULL)." }), ...entryShape })
  .strict()
  .openapi("CreateStockEntryRequest");
export const UpdateEntrySchema = z.object(entryShape).strict().openapi("UpdateStockEntryRequest");
export const CalculateEntrySchema = z.object(entryShape).strict().openapi("CalculateStockEntryRequest");

export const ReasonSchema = z.object({ reason: z.string().trim().min(3, "Give a reason (at least 3 characters).").max(500) }).strict().openapi("ReasonRequest");
export const ApproveSchema = z.object({ confirmBelowCost: z.boolean().optional() }).strict().openapi("ApproveRequest");
export const ReceiveSchema = z
  .object({
    lines: z
      .array(
        z
          .object({
            lineId: z.string().uuid(),
            receivedQty: QuantitySchema,
            receivedSerials: z.array(z.string().trim().min(1).max(100)).optional().openapi({ description: "Serial-tracked lines with a shortage: the serials that arrived" }),
          })
          .strict(),
      )
      .min(1),
    notes: text(500),
  })
  .strict()
  .openapi("ReceiveTransferRequest");

export const EntryFilterShape = {
  type: emptyToUndefined(z.preprocess(upper, EntryTypeSchema)),
  status: emptyToUndefined(z.preprocess(upper, EntryStatusSchema)),
  warehouseId: emptyToUndefined(z.string().uuid()),
  projectId: emptyToUndefined(z.string().uuid()),
  customerId: emptyToUndefined(z.string().uuid()),
  supplierId: emptyToUndefined(z.string().uuid()),
  productId: emptyToUndefined(z.string().uuid()),
  createdById: emptyToUndefined(z.string().uuid()),
  purchaseOrderId: emptyToUndefined(z.string().uuid()),
  dateFrom: DateRangeFilters.from,
  dateTo: DateRangeFilters.to,
  awaitingMyApproval: emptyToUndefined(booleanLike).openapi({ type: "boolean", description: "Pending entries I can verify (in my warehouses, not created by me)" }),
  awaitingMyReceipt: emptyToUndefined(booleanLike).openapi({ type: "boolean", description: "Dispatched transfers to my warehouses" }),
};
export const EntryListQuerySchema = listQuerySchema({ sortFields: ["entryDate", "createdAt", "number"], defaultSort: "-createdAt", filters: EntryFilterShape });
export type EntryFilters = {
  type?: string;
  status?: string;
  warehouseId?: string;
  projectId?: string;
  customerId?: string;
  supplierId?: string;
  productId?: string;
  createdById?: string;
  purchaseOrderId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  awaitingMyApproval?: boolean;
  awaitingMyReceipt?: boolean;
};

/* ───────────────────────────── stock ───────────────────────────── */

export const BalanceListQuerySchema = listQuerySchema({
  sortFields: ["code", "name", "total"],
  defaultSort: "code",
  filters: {
    productId: emptyToUndefined(z.string().uuid()),
    catalogId: emptyToUndefined(z.string().uuid()),
    categoryId: emptyToUndefined(z.string().uuid()),
    warehouseId: emptyToUndefined(z.string().uuid()),
    condition: emptyToUndefined(ConditionSchema),
    belowMinimum: emptyToUndefined(booleanLike).openapi({ type: "boolean" }),
    inStock: emptyToUndefined(booleanLike).openapi({ type: "boolean", description: "Only products with stock (on hand, damaged or in transit)" }),
  },
});
export type BalanceFilters = { productId?: string; catalogId?: string; categoryId?: string; warehouseId?: string; condition?: "GOOD" | "DAMAGED"; belowMinimum?: boolean; inStock?: boolean };

export const MovementListQuerySchema = listQuerySchema({
  sortFields: ["postedAt"],
  defaultSort: "-postedAt",
  filters: {
    productId: emptyToUndefined(z.string().uuid()),
    warehouseId: emptyToUndefined(z.string().uuid()),
    entryId: emptyToUndefined(z.string().uuid()),
    type: emptyToUndefined(z.preprocess(upper, EntryTypeSchema)),
    dateFrom: DateRangeFilters.from,
    dateTo: DateRangeFilters.to,
  },
});
export type MovementFilters = { productId?: string; warehouseId?: string; entryId?: string; type?: string; dateFrom?: Date; dateTo?: Date };

export const AvailabilityQuerySchema = z.object({ productId: z.string().uuid(), warehouseId: z.string().uuid() });

export const SerialListQuerySchema = listQuerySchema({
  sortFields: ["serial", "updatedAt"],
  defaultSort: "serial",
  filters: {
    productId: emptyToUndefined(z.string().uuid()),
    warehouseId: emptyToUndefined(z.string().uuid()),
    status: emptyToUndefined(z.preprocess(upper, z.enum(["IN_STOCK", "RESERVED", "IN_TRANSIT", "ISSUED", "SOLD", "RETURNED_TO_SUPPLIER", "WRITTEN_OFF", "DAMAGED"]))),
  },
});
export type SerialFilters = { productId?: string; warehouseId?: string; status?: string };

/* ───────────────────────────── masters ───────────────────────────── */

export const MasterFilterShape = { active: emptyToUndefined(booleanLike).openapi({ type: "boolean", description: "true: active only, false: inactive only" }) };
export type MasterFilters = { active?: boolean; status?: string };

export const CustomerListQuerySchema = listQuerySchema({ sortFields: ["name", "createdAt"], defaultSort: "name", filters: MasterFilterShape });

export const Name = z.string().trim().min(1, "Name is required.").max(150);
export const Email = z.preprocess((v) => (v === "" ? null : v), z.string().trim().email("Enter a valid email.").max(200).nullable().optional());

const customerShape = { name: Name, contactPerson: text(100), phone: text(30), email: Email, address: text(300) };
export const CreateCustomerSchema = z.object(customerShape).strict().openapi("CreateCustomerRequest");
export const UpdateCustomerSchema = z.object({ ...customerShape, name: Name.optional(), isActive: z.boolean().optional() }).strict().openapi("UpdateCustomerRequest");

export const UpdateSettingsSchema = z
  .object({
    defaultSalesVatPercent: PercentSchema.optional(),
    adminWriteOffNeedsApproval: z.boolean().optional(),
    allowAdminBelowCostSale: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one setting." })
  .openapi("UpdateInventorySettingsRequest");

/** A verifier with seeCost sets the landed-cost charges / exchange rate of a pending import GRN. */
export const LandedCostSchema = z
  .object({
    exchangeRate: RateSchema.optional().openapi({ description: "Customs rate (BDT per unit of the GRN currency)" }),
    charges: z.array(ChargeInputSchema).max(20).openapi({ description: "Replaces all landed-cost charges" }),
  })
  .strict()
  .openapi("LandedCostRequest");
export type LandedCostInput = z.infer<typeof LandedCostSchema>;

export const DocumentRequestSchema = z
  .object({ kind: z.enum(["GRN", "DELIVERY_CHALLAN", "SALES_INVOICE", "RETURN_NOTE", "WRITE_OFF_NOTE", "TRANSFER_CHALLAN", "REVERSAL_NOTE", "ADJUSTMENT_NOTE"]).optional().openapi({ description: "Defaults by entry type (a sale can also print a delivery challan)" }) })
  .strict()
  .openapi("DocumentRequest");
export type DocumentKind = NonNullable<z.infer<typeof DocumentRequestSchema>["kind"]>;

export type CreateEntryInput = z.infer<typeof CreateEntrySchema>;
export type EntryInput = z.infer<typeof UpdateEntrySchema>;
export type ReceiveInput = z.infer<typeof ReceiveSchema>;

/* ───────────────────────────── stock counts ───────────────────────────── */

export const CountScopeSchema = z.preprocess(upper, z.enum(["ALL", "CATALOG", "CATEGORY", "SELECTED_PRODUCTS"])).openapi({ type: "string", enum: ["ALL", "CATALOG", "CATEGORY", "SELECTED_PRODUCTS"] });
export const CountStatusSchema = z.enum(["DRAFT", "COUNTING", "SUBMITTED", "APPROVED", "CANCELLED"]).openapi("StockCountStatus");

export const CreateCountSchema = z
  .object({
    warehouseId: z.string().uuid(),
    scope: CountScopeSchema,
    scopeIds: z.array(z.string().uuid()).max(5000).optional().openapi({ description: "Catalog, category or product ids (not for ALL)" }),
    blindCount: z.boolean().optional().openapi({ description: "Counters can't see the system quantity" }),
    notes: text(1000),
  })
  .strict()
  .openapi("CreateStockCountRequest");

export const UpdateCountSchema = z
  .object({ scope: CountScopeSchema.optional(), scopeIds: z.array(z.string().uuid()).max(5000).optional(), blindCount: z.boolean().optional(), notes: text(1000) })
  .strict()
  .openapi("UpdateStockCountRequest");

export const CountLineSchema = z
  .object({
    countedQty: QuantitySchema.nullable().optional().openapi({ type: "string", example: "12", description: "Untracked products. Tracked products: the number of serials" }),
    serials: z.array(z.string().trim().min(1).max(100)).max(2000).optional().openapi({ description: "Tracked products: the serials found" }),
    notCounted: z.boolean().optional().openapi({ description: 'Mark "not counted = 0"' }),
    note: text(500),
  })
  .strict()
  .openapi("CountLineRequest");

export const SubmitCountSchema = z.object({ markUncountedAsZero: z.boolean().optional().openapi({ description: 'Mark every line without a count as "not counted = 0"' }) }).strict().openapi("SubmitStockCountRequest");
export const RecountSchema = z.object({ lineIds: z.array(z.string().uuid()).min(1).max(5000), note: text(500) }).strict().openapi("RequestRecountRequest");

export const CountListQuerySchema = listQuerySchema({
  sortFields: ["createdAt", "number", "startedAt"],
  defaultSort: "-createdAt",
  filters: {
    status: emptyToUndefined(z.preprocess(upper, CountStatusSchema)),
    warehouseId: emptyToUndefined(z.string().uuid()),
    active: emptyToUndefined(booleanLike).openapi({ type: "boolean", description: "COUNTING or SUBMITTED only" }),
  },
});

/* ───────────────────────────── opening stock, low stock, alerts ───────────────────────────── */

export const UnlockOpeningSchema = ReasonSchema;

export const LowStockQuerySchema = listQuerySchema({
  sortFields: ["shortBy", "code", "name"],
  defaultSort: "-shortBy",
  filters: {
    catalogId: emptyToUndefined(z.string().uuid()),
    categoryId: emptyToUndefined(z.string().uuid()),
    warehouseId: emptyToUndefined(z.string().uuid()).openapi({ description: "Use only this warehouse's available quantity" }),
  },
});

export const UpdateAlertSettingsSchema = z
  .object({
    lowStockRoleIds: z.array(z.string().uuid()).max(50).optional(),
    digestEnabled: z.boolean().optional(),
    digestTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (24-hour), e.g. 09:00.")
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one setting." })
  .openapi("UpdateAlertSettingsRequest");
