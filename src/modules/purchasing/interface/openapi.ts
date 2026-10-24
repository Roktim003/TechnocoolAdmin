import { z } from "@/shared/validation/zod";
import { AUTHENTICATED, dataOf, errors, IdempotencyHeaders, IdParams, json, listOf, registry } from "@/shared/openapi/registry";
import {
  AmendPoSchema,
  CalculatePoSchema,
  CreatePoSchema,
  CreateSupplierSchema,
  EmailPoSchema,
  FromLowStockSchema,
  MarkSentSchema,
  PoListQuerySchema,
  PoReasonSchema,
  PoStatusSchema,
  PoTypeSchema,
  PriceHistoryQuerySchema,
  ReceivableListQuerySchema,
  SupplierListQuerySchema,
  UpdatePoSchema,
  UpdatePurchasingSettingsSchema,
  UpdateSupplierSchema,
} from "../application/dto";

const body = (schema: z.ZodTypeAny) => ({ body: { required: true, content: { "application/json": { schema } } } });
const optionalBody = (schema: z.ZodTypeAny) => ({ body: { required: false, content: { "application/json": { schema } } } });
const RequiredKey = z.object({ "idempotency-key": z.string().min(8).max(128).openapi({ description: "Required. A unique key per user action; a replay returns the first response." }) });

const VIEW = "Requires `purchasing` ≥ VIEW. Only POs delivering to the caller's warehouses are visible.";
const CREATE = "Requires `purchasing` ≥ CREATE.";
const APPROVE = "Requires `purchasing` ≥ APPROVE (deliver-to warehouse in scope).";
const FULL = "Requires `purchasing` = FULL.";
const KEY = "`Idempotency-Key` header required.";
const COST = "Unit prices, amounts and totals (`unitPrice`, `amount`, `subtotal`, `discountAmount`, `vatAmount`, `total`, `totalBdt`) are only returned with `seeCost`.";

function path(method: "get" | "post" | "patch" | "delete", p: string, summary: string, description: string, extra: Record<string, unknown>, tags = ["Purchase orders"]) {
  registry.registerPath({ method, path: p, tags, summary, description, security: AUTHENTICATED, ...extra } as Parameters<typeof registry.registerPath>[0]);
}

const Ref = z.object({ id: z.string().uuid(), name: z.string() });
const Qty = z.string().openapi({ example: "12.000" });
const Price = z.string().openapi({ example: "1150.0000" });
const Money = z.string().openapi({ example: "6900.00" });

const SupplierDto = registry.register(
  "Supplier",
  z.object({
    id: z.string().uuid(),
    code: z.string().openapi({ example: "SUP-001" }),
    name: z.string(),
    type: z.enum(["LOCAL", "FOREIGN"]),
    defaultCurrency: z.string().openapi({ example: "USD" }),
    currency: z.string().openapi({ description: "Deprecated alias of defaultCurrency" }),
    contactPerson: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    address: z.string().nullable(),
    brandsSupplied: z.string().nullable(),
    paymentTermsNote: z.string().nullable(),
    notes: z.string().nullable(),
    isActive: z.boolean(),
    openPoCount: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
);
const SupplierDetailDto = registry.register(
  "SupplierDetail",
  SupplierDto.extend({
    stats: z.object({ openPoCount: z.number().int(), poCount: z.number().int(), lastPurchaseDate: z.string().nullable(), productCount: z.number().int(), totalOrderedBdt: Money.optional().openapi({ description: "Only with seeCost" }) }),
  }),
);

const PoLineDto = z.object({
  id: z.string().uuid(),
  lineNo: z.number().int(),
  product: z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), unitCode: z.string(), status: z.string(), trackSerial: z.boolean() }),
  qty: Qty,
  receivedQty: Qty,
  pendingReceiptQty: Qty.openapi({ description: "In GRNs submitted but not yet posted" }),
  remainingQty: Qty.openapi({ description: "qty − received − pending (0 once closed / cancelled)" }),
  unitPrice: Price.optional().openapi({ description: "PO currency. Only with seeCost" }),
  amount: Money.optional().openapi({ description: "Only with seeCost" }),
  note: z.string().nullable(),
});

const PoDto = registry.register(
  "PurchaseOrder",
  z.object({
    id: z.string().uuid(),
    number: z.string().nullable().openapi({ example: "PO-2627-0001", description: "Assigned on submit / approve" }),
    draftRef: z.string(),
    displayNumber: z.string(),
    type: PoTypeSchema,
    status: PoStatusSchema,
    statusLabel: z.string(),
    revision: z.number().int(),
    supplier: z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), type: z.enum(["LOCAL", "FOREIGN"]), email: z.string().nullable(), isActive: z.boolean() }),
    currency: z.string(),
    exchangeRate: z.string().openapi({ description: "BDT per unit (1 for local POs; 0 = not entered yet on an imported draft)" }),
    poDate: z.string(),
    expectedDeliveryDate: z.string().nullable(),
    overdue: z.boolean(),
    deliverTo: z.object({ id: z.string().uuid(), code: z.string(), name: z.string() }),
    project: z.object({ id: z.string().uuid(), code: z.string(), name: z.string() }).nullable(),
    supplierQuoteRef: z.string().nullable(),
    vatPercent: z.string(),
    discountAmount: Money.optional(),
    subtotal: Money.optional(),
    vatAmount: Money.optional(),
    total: Money.optional().openapi({ description: "PO currency" }),
    totalBdt: Money.optional().openapi({ description: "BDT equivalent (imports: at the PO rate)" }),
    terms: z.string().nullable(),
    notes: z.string().nullable(),
    progress: z.object({ orderedQty: Qty, receivedQty: Qty, pendingQty: Qty, percent: z.number().int() }),
    lines: z.array(PoLineDto),
    attachmentCount: z.number().int(),
    createdBy: Ref,
    approvedBy: Ref.nullable(),
    rejectedBy: Ref.nullable(),
    rejectionReason: z.string().nullable(),
    closedReason: z.string().nullable(),
    cancelledReason: z.string().nullable(),
    submittedAt: z.string().nullable(),
    approvedAt: z.string().nullable(),
    sentAt: z.string().nullable(),
    actions: z.record(z.boolean()),
  }),
);

const PoDetailDto = registry.register(
  "PurchaseOrderDetail",
  PoDto.extend({
    receipts: z.array(z.object({ id: z.string().uuid(), number: z.string().nullable(), displayNumber: z.string(), type: z.string(), status: z.string(), entryDate: z.string(), totalQty: Qty, createdBy: Ref })).openapi({ description: "Linked GRNs" }),
    revisions: z.array(z.object({ id: z.string().uuid(), revision: z.number().int(), changedBy: Ref, reason: z.string(), changes: z.array(z.string()), createdAt: z.string(), snapshot: z.unknown().optional().openapi({ description: "The PO before the change (only with seeCost)" }) })),
    attachments: z.array(z.object({ id: z.string().uuid(), fileName: z.string(), mimeType: z.string(), size: z.number().int(), label: z.string().nullable(), url: z.string() })),
    timeline: z.array(z.object({ event: z.string(), at: z.string(), by: z.string().nullable(), note: z.string().nullable().optional(), link: z.string().optional() })),
  }),
);

const ReceivableDto = registry.register(
  "PurchaseOrderReceivable",
  z.object({
    purchaseOrderId: z.string().uuid(),
    number: z.string().nullable(),
    status: PoStatusSchema,
    receivable: z.boolean(),
    grnType: z.enum(["GRN_LOCAL", "GRN_IMPORT"]),
    warehouse: z.object({ id: z.string().uuid(), code: z.string(), name: z.string() }),
    supplier: z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), type: z.string() }),
    currency: z.string(),
    exchangeRate: z.string(),
    lines: z.array(z.object({ purchaseOrderLineId: z.string().uuid(), product: PoLineDto.shape.product, orderedQty: Qty, receivedQty: Qty, pendingReceiptQty: Qty, remainingQty: Qty, unitPrice: Price.optional().openapi({ description: "Only with seeCost" }) })),
  }),
);

const PriceHistoryDto = registry.register(
  "PriceHistoryRow",
  z.object({
    poId: z.string().uuid(),
    poNumber: z.string().nullable(),
    poDate: z.string(),
    status: PoStatusSchema,
    supplier: z.object({ id: z.string().uuid(), code: z.string(), name: z.string() }),
    product: z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), unitCode: z.string() }),
    currency: z.string(),
    qty: Qty,
    unitPrice: Price,
    exchangeRate: z.string(),
    unitPriceBdt: Price.openapi({ description: "unitPrice × exchangeRate" }),
  }),
);

const DocumentJob = z.object({ jobId: z.string().uuid(), status: z.literal("queued"), kind: z.string().optional(), to: z.string().optional() });

/* ── suppliers ── */
const ST = ["Suppliers"];
path("get", "/suppliers", "List suppliers", "Requires `purchasing` ≥ VIEW **or** `inventory` ≥ VIEW (GRN screens). Filters: `q`, `type`, `isActive` (alias `active`), `brand`.", { request: { query: SupplierListQuerySchema.innerType() }, responses: { 200: json(listOf(SupplierDto)), ...errors(400, 401, 403) } }, ST);
path("post", "/suppliers", "Create a supplier", `${FULL} The code (SUP-001…) is assigned automatically. Names are unique (case-insensitive).`, { request: { headers: IdempotencyHeaders, ...body(CreateSupplierSchema) }, responses: { 201: json(dataOf(SupplierDto), "Created"), ...errors(400, 401, 403, 409) } }, ST);
path("get", "/suppliers/{id}", "Get a supplier", "Purchasing or inventory VIEW. Includes open PO count, last purchase date and (with seeCost) the ordered value.", { request: { params: IdParams }, responses: { 200: json(dataOf(SupplierDetailDto)), ...errors(401, 403, 404) } }, ST);
path("patch", "/suppliers/{id}", "Update a supplier", `${FULL} \`isActive: true\` reactivates.`, { request: { params: IdParams, ...body(UpdateSupplierSchema) }, responses: { 200: json(dataOf(SupplierDto)), ...errors(400, 401, 403, 404, 409) } }, ST);
path("post", "/suppliers/{id}/deactivate", "Deactivate a supplier", `${FULL} Never deleted; inactive suppliers can't get new POs or GRNs.`, { request: { params: IdParams, headers: IdempotencyHeaders }, responses: { 200: json(dataOf(SupplierDto)), ...errors(401, 403, 404) } }, ST);
path("get", "/suppliers/{id}/purchase-orders", "A supplier's purchase orders", `${VIEW} Same filters as /purchase-orders. ${COST}`, { request: { params: IdParams, query: PoListQuerySchema.innerType() }, responses: { 200: json(listOf(PoDto)), ...errors(400, 401, 403, 404) } }, ST);
path("get", "/suppliers/{id}/price-history", "A supplier's price history", `${VIEW} and \`seeCost\` (403 otherwise). PO lines of approved POs, newest first.`, { request: { params: IdParams, query: PriceHistoryQuerySchema.innerType() }, responses: { 200: json(listOf(PriceHistoryDto)), ...errors(400, 401, 403, 404) } }, ST);
path("get", "/products/{id}/price-history", "A product's purchase price history", "Requires `seeCost` and `purchasing` or `catalog` ≥ VIEW. PO lines of approved POs (date, PO, supplier, currency, unit price, BDT equivalent), newest first.", { request: { params: IdParams, query: PriceHistoryQuerySchema.innerType() }, responses: { 200: json(listOf(PriceHistoryDto)), ...errors(400, 401, 403) } }, ["Catalog", "Suppliers"]);

/* ── purchase orders ── */
path(
  "get",
  "/purchase-orders",
  "List purchase orders",
  `${VIEW} Filters: status, supplierId, type, warehouseId, projectId, productId, \`overdue=true\` (expected date before today, Asia/Dhaka, and still approved / sent / partly received), dateFrom / dateTo (PO date), \`q\` (number, quotation ref, supplier). ${COST}`,
  { request: { query: PoListQuerySchema.innerType() }, responses: { 200: json(listOf(PoDto)), ...errors(400, 401, 403) } },
);
path(
  "post",
  "/purchase-orders",
  "Create a purchase order",
  `${CREATE} \`action\`: draft, submit (→ PENDING_APPROVAL, number PO-{FY}-0001 assigned, approvers notified) or approve (Save & approve: purchasing APPROVE; approving your own PO needs FULL). Supplier must be active; its type fixes the PO type (LOCAL / IMPORTED) and the currency. Products must be ACTIVE and appear once; qty > 0; unit price > 0 to submit / approve. Local: discount + VAT %. Imported: exchange rate required to submit / approve, no VAT / discount. ${KEY} ${COST}`,
  { request: { headers: RequiredKey, ...body(CreatePoSchema) }, responses: { 201: json(dataOf(PoDetailDto), "Created"), ...errors(400, 401, 403, 404, 409, 422) } },
);
path("post", "/purchase-orders/calculate", "Calculate PO totals without saving", `${CREATE} Line amounts, subtotal, discount, VAT, total and BDT equivalent; the next PO number; warnings. Totals only with seeCost.`, { request: body(CalculatePoSchema), responses: { 200: json(dataOf(z.record(z.unknown()))), ...errors(400, 401, 403) } });
path("get", "/purchase-orders/{id}", "Get a purchase order", `${VIEW} Lines with ordered / received / pending / remaining, linked GRNs, revisions, timeline, attachments. ${COST}`, { request: { params: IdParams }, responses: { 200: json(dataOf(PoDetailDto)), ...errors(401, 403, 404) } });
path("patch", "/purchase-orders/{id}", "Edit a draft or rejected PO", `${CREATE} Creator (or FULL). Replaces header and lines. A supplier change must keep the PO type.`, { request: { params: IdParams, ...body(UpdatePoSchema) }, responses: { 200: json(dataOf(PoDetailDto)), ...errors(400, 401, 403, 404, 422) } });
const act = (p: string, summary: string, desc: string, schema?: z.ZodTypeAny, optional = false) =>
  path("post", `/purchase-orders/{id}/${p}`, summary, `${desc} ${KEY}`, {
    request: { params: IdParams, headers: RequiredKey, ...(schema ? (optional ? optionalBody(schema) : body(schema)) : {}) },
    responses: { 200: json(dataOf(PoDetailDto)), ...errors(400, 401, 403, 404, 409, 422) },
  });
act("submit", "Submit for approval", `${CREATE} DRAFT / REJECTED → PENDING_APPROVAL (creator or FULL). Notifies users with purchasing ≥ APPROVE.`);
act("approve", "Approve", `${APPROVE} PENDING_APPROVAL (or a draft: Save & approve) → APPROVED. Only FULL users may approve their own PO. Notifies the creator.`);
act("reject", "Reject", `${APPROVE} PENDING_APPROVAL → REJECTED with a reason; the creator can edit and resubmit.`, PoReasonSchema);
act("mark-sent", "Mark sent", `${APPROVE} APPROVED → SENT (records sentAt). \`emailSupplier: true\` also emails the PDF to the supplier.`, MarkSentSchema, true);
act("close", "Close (accept a short delivery)", `${APPROVE} Only PARTLY_RECEIVED with nothing pending → CLOSED with a reason. Remaining quantities can no longer be received.`, PoReasonSchema);
act("cancel", "Cancel", `${APPROVE} Only when nothing was received or is pending (draft / pending approval / rejected / approved / sent). Reason required.`, PoReasonSchema);
act("amend", "Amend an approved PO", `${APPROVE} APPROVED / SENT / PARTLY_RECEIVED: change quantities, prices, lines, expected date (rate / discount / VAT). Saves a revision snapshot with the reason and increments \`revision\`. A line can't go below received + pending (422 AMEND_BELOW_RECEIVED).`, AmendPoSchema);
path("post", "/purchase-orders/{id}/email", "Email the PO to the supplier", `${APPROVE} Queues the PDF (worker) and an email with it attached to the supplier's address (or \`to\`), via the email queue; logged in EmailLog and the audit log. ${KEY}`, {
  request: { params: IdParams, headers: RequiredKey, ...optionalBody(EmailPoSchema) },
  responses: { 202: json(dataOf(DocumentJob), "Queued"), ...errors(400, 401, 403, 404, 422) },
});
path("post", "/purchase-orders/{id}/documents", "Queue the PO PDF", `${VIEW} Rendered by the worker (company header, supplier block, lines, totals, terms, signature lines). Poll and download with GET /documents/{jobId} (\`?download=1\`). Prices only with seeCost.`, {
  request: { params: IdParams },
  responses: { 202: json(dataOf(DocumentJob), "Queued"), ...errors(401, 403, 404, 422) },
});
path("get", "/purchase-orders/{id}/receivable", "What a GRN can still receive", "Requires `purchasing` ≥ VIEW **or** `inventory` ≥ CREATE (a Store Manager receiving goods), deliver-to warehouse in scope. Remaining quantities, GRN type, warehouse, supplier, currency and rate; unit prices only with seeCost.", {
  request: { params: IdParams },
  responses: { 200: json(dataOf(ReceivableDto)), ...errors(401, 403, 404) },
});
path("get", "/purchase-orders/receivable", "Purchase orders open for receiving", "Purchasing VIEW or inventory CREATE. Approved / sent / partly received POs delivering to your warehouses (no prices).", {
  request: { query: ReceivableListQuerySchema.innerType() },
  responses: { 200: json(listOf(z.record(z.unknown()))), ...errors(400, 401, 403) },
});
path("post", "/purchase-orders/from-low-stock", "Create POs from low-stock products", `${CREATE} One DRAFT PO per default supplier, with the suggested reorder quantity and the last approved price. Products without a default supplier are returned in \`unassigned\` (for the new-PO form). ${KEY}`, {
  request: { headers: RequiredKey, ...body(FromLowStockSchema) },
  responses: { 201: json(dataOf(z.object({ created: z.array(PoDto), unassigned: z.array(z.record(z.unknown())), warehouseId: z.string().uuid() })), "Created"), ...errors(400, 401, 403, 422) },
});
path("get", "/purchase-orders/{id}/attachments", "List a PO's attachments", VIEW, { request: { params: IdParams }, responses: { 200: json(dataOf(z.array(z.record(z.unknown())))), ...errors(401, 403, 404) } });
path("post", "/purchase-orders/{id}/attachments", "Attach files (quotation, proforma invoice)", `${CREATE} multipart/form-data \`file\` (PDF, JPG, PNG, WebP; ≤ 10 MB; ≤ 20 per PO) and optional \`label\`.`, {
  request: { params: IdParams, body: { required: true, content: { "multipart/form-data": { schema: z.object({ file: z.string().openapi({ type: "string", format: "binary" }), label: z.string().optional() }) } } } },
  responses: { 201: json(dataOf(z.array(z.record(z.unknown()))), "Created"), ...errors(400, 401, 403, 404, 422) },
});
path("delete", "/purchase-orders/{id}/attachments/{attachmentId}", "Remove an attachment", "Uploader or purchasing FULL.", {
  request: { params: z.object({ id: z.string().uuid(), attachmentId: z.string().uuid() }) },
  responses: { 204: { description: "Removed" }, ...errors(401, 403, 404) },
});

/* ── settings ── */
path("get", "/purchasing-settings", "Purchasing settings", "Requires `purchasing` ≥ VIEW.", { responses: { 200: json(dataOf(z.object({ defaultTerms: z.string().nullable(), defaultVatPercent: z.string() }))), ...errors(401, 403) } }, ["Purchase orders"]);
path("patch", "/purchasing-settings", "Update purchasing settings", `${FULL} Default PO terms and VAT %. Audit-logged.`, { request: body(UpdatePurchasingSettingsSchema), responses: { 200: json(dataOf(z.object({ defaultTerms: z.string().nullable(), defaultVatPercent: z.string() }))), ...errors(400, 401, 403) } }, ["Purchase orders"]);
