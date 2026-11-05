import { z } from "@/shared/validation/zod";
import { AUTHENTICATED, dataOf, errors, IdempotencyHeaders, IdParams, json, listOf, registry } from "@/shared/openapi/registry";
import {
  ApproveSchema,
  AvailabilityQuerySchema,
  BalanceListQuerySchema,
  CalculateEntrySchema,
  CreateCustomerSchema,
  CreateEntrySchema,
  CustomerListQuerySchema,
  AttachmentDocTypeSchema,
  DocumentRequestSchema,
  EntryListQuerySchema,
  ImportDocTypeSchema,
  ImportShipmentSchema,
  RemoveAttachmentSchema,
  LandedCostSchema,
  EntryStatusSchema,
  EntryTypeSchema,
  MovementListQuerySchema,
  ReasonSchema,
  ReceiveSchema,
  SerialListQuerySchema,
  UpdateCustomerSchema,
  UpdateEntrySchema,
  UpdateSettingsSchema,
} from "../application/dto";

const body = (schema: z.ZodTypeAny) => ({ body: { required: true, content: { "application/json": { schema } } } });
const optionalBody = (schema: z.ZodTypeAny) => ({ body: { required: false, content: { "application/json": { schema } } } });
const multipart = (schema: z.ZodTypeAny) => ({ body: { required: true, content: { "multipart/form-data": { schema } } } });
const binaryFile = z.string().openapi({ type: "string", format: "binary" });
const file = (type: string, description: string) => ({ description, content: { [type]: { schema: binaryFile } } });

/** Stock-changing POSTs: the key is mandatory (400 IDEMPOTENCY_KEY_REQUIRED without it). */
const RequiredKey = z.object({ "idempotency-key": z.string().min(8).max(128).openapi({ description: "Required. A unique key per user action; a replay of the same key + body returns the first response." }) });

const VIEW = "Requires `inventory` ≥ VIEW.";
const CREATE = "Requires `inventory` ≥ CREATE.";
const APPROVE = "Requires `inventory` ≥ APPROVE.";
const FULL = "Requires `inventory` = FULL.";
const SCOPE = "Only entries in the caller's warehouses are visible (403 otherwise).";
const COST =
  "Cost fields (`unitCostBdt`, `landedUnitCost`, `costAmount`, `costTotal`, `avgCost`, `stockValue`, `valueChange`…) are removed unless the role has `seeCost`; " +
  "on entries priced at cost (every type except SALE) `unitPrice`, `amount`, `subtotal`, `grandTotal` and charge amounts are removed too. `profit` needs `seeProfit`.";
const STOCK_WRITE = "Changes stock: `Idempotency-Key` header required.";
const tags = ["Stock"];
const masterTags = ["Masters"];

function path(method: "get" | "post" | "patch" | "put" | "delete", p: string, summary: string, description: string, extra: Record<string, unknown>, t = tags) {
  registry.registerPath({ method, path: p, tags: t, summary, description, security: AUTHENTICATED, ...extra } as Parameters<typeof registry.registerPath>[0]);
}

/* ── response schemas ── */

const Qty = z.string().openapi({ example: "10.000" });
const Money = z.string().openapi({ example: "12500.00" });
const Cost4 = z.string().openapi({ example: "1250.0000" });
const Ref = z.object({ id: z.string().uuid(), name: z.string() });
const WarehouseRef = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() });
const EntryRef = z.object({ id: z.string().uuid(), number: z.string().nullable(), type: EntryTypeSchema }).nullable();

const EntryLineDto = z.object({
  id: z.string().uuid(),
  lineNo: z.number().int(),
  product: z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), unitCode: z.string(), trackSerial: z.boolean() }),
  qty: Qty,
  unitPrice: z.string().optional().openapi({ description: "Foreign/BDT cost, or selling price for sales" }),
  amount: Money.optional(),
  unitCostBdt: Cost4.optional(),
  landedUnitCost: Cost4.nullable().optional(),
  costAmount: Money.optional(),
  condition: z.enum(["GOOD", "DAMAGED"]),
  originalLineId: z.string().uuid().nullable(),
  receivedQty: Qty.nullable(),
  countryOfOrigin: z.string().nullable().optional().openapi({ description: "GRN (Imported) lines only" }),
  note: z.string().nullable(),
  serials: z.array(z.object({ serial: z.string(), received: z.boolean().nullable() })),
});

const ImportShipmentDto = z
  .object({
    blNo: z.string().nullable(),
    blDate: z.string().nullable().openapi({ format: "date" }),
    shippingLine: z.string().nullable(),
    vesselVoyage: z.string().nullable(),
    portOfLoading: z.string().nullable(),
    portOfDischarge: z.string().nullable(),
    containerNumbers: z.array(z.string()),
    coNo: z.string().nullable(),
    coDate: z.string().nullable(),
    countryOfOrigin: z.string().nullable(),
    coIssuingAuthority: z.string().nullable(),
    plNo: z.string().nullable(),
    plDate: z.string().nullable(),
    packageCount: z.number().int().nullable(),
    grossWeightKg: z.string().nullable(),
    netWeightKg: z.string().nullable(),
    ciNo: z.string().nullable(),
    ciDate: z.string().nullable(),
    ciCurrency: z.string().nullable(),
    ciValue: Money.nullable().optional().openapi({ description: "Removed without seeCost" }),
    incoterm: z.string().nullable(),
    boeNo: z.string().nullable(),
    boeDate: z.string().nullable(),
    customsStation: z.string().nullable(),
  })
  .nullable();
const ChecklistDto = z.array(
  z.object({ docType: ImportDocTypeSchema, label: z.string(), numberFilled: z.boolean(), fileCount: z.number().int(), required: z.boolean(), complete: z.boolean().openapi({ description: "Number filled and at least one file" }) }),
);
const WarningDto = z.object({
  code: z.string(),
  message: z.string(),
  line: z.number().int().nullable(),
  link: z.object({ entryId: z.string().uuid(), number: z.string().nullable(), href: z.string() }).optional().openapi({ description: "Duplicate BL / CI / B/E no.: the other GRN (Imported)" }),
});

const EntryDto = registry.register(
  "StockEntry",
  z.object({
    id: z.string().uuid(),
    number: z.string().nullable().openapi({ example: "GRN-I-2627-0001", description: "Assigned on submit/post; gap-free per type and fiscal year" }),
    draftRef: z.string(),
    displayNumber: z.string(),
    type: EntryTypeSchema,
    typeLabel: z.string(),
    direction: z.enum(["IN", "OUT", "MOVE", "INVERSE"]),
    status: EntryStatusSchema,
    entryDate: z.string().openapi({ format: "date" }),
    warehouse: WarehouseRef,
    toWarehouse: WarehouseRef.nullable(),
    supplier: Ref.nullable(),
    customer: Ref.nullable(),
    project: z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), status: z.string() }).nullable(),
    originalEntry: EntryRef,
    reversalOf: EntryRef,
    reversedBy: EntryRef,
    relatedEntry: EntryRef,
    relatedEntries: z.array(z.object({ id: z.string().uuid(), number: z.string().nullable(), type: EntryTypeSchema, status: EntryStatusSchema })),
    references: z.record(z.string().nullable()),
    notes: z.string().nullable(),
    currency: z.string(),
    exchangeRate: z.string(),
    discountAmount: Money,
    vatPercent: z.string(),
    vatAmount: Money,
    subtotal: Money.optional(),
    grandTotal: Money.optional(),
    costTotal: Money.optional(),
    profit: Money.optional(),
    belowCostConfirmed: z.boolean(),
    itemCount: z.number().int(),
    totalQty: Qty,
    lines: z.array(EntryLineDto),
    charges: z.array(z.object({ id: z.string().uuid(), type: z.string(), mode: z.string(), includeInCost: z.boolean(), label: z.string().nullable(), value: z.string().optional(), amountBdt: Money.optional() })),
    attachmentCount: z.number().int(),
    importShipment: ImportShipmentDto.optional().openapi({ description: "GRN (Imported) only: the shipment documents" }),
    importDocFileCount: z.number().int().optional().openapi({ description: "GRN (Imported): files attached to its import documents" }),
    documentsChecklist: ChecklistDto.optional().openapi({ description: "GRN (Imported): per document, number filled, file count, required, complete" }),
    importDocsRequiredToPost: z.array(ImportDocTypeSchema).optional().openapi({ description: "Detail only (GRN Imported)" }),
    importAttachments: z.record(z.array(z.record(z.unknown()))).optional().openapi({ description: "Detail only (GRN Imported): Attachment objects grouped by docType (BL, CO, PL, CI, BOE, OTHER)" }),
    importWarnings: z.array(WarningDto).optional().openapi({ description: "Detail only (GRN Imported)" }),
    createdBy: Ref,
    verifiedBy: Ref.nullable(),
    receivedByUser: Ref.nullable(),
    rejectionReason: z.string().nullable(),
    reversalReason: z.string().nullable(),
    submittedAt: z.string().nullable(),
    verifiedAt: z.string().nullable(),
    postedAt: z.string().nullable(),
    dispatchedAt: z.string().nullable(),
    receivedAt: z.string().nullable(),
    cancelledAt: z.string().nullable(),
    reversedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    timeline: z.array(z.object({ event: z.string(), at: z.string(), by: z.string().nullable(), note: z.string().nullable().optional() })),
    actions: z.record(z.boolean()).openapi({ description: "What the caller may do: edit, submit, post, approve, reject, cancel, reverse, receive" }),
  }),
);

const CalculationDto = registry.register(
  "StockEntryCalculation",
  z.object({
    type: EntryTypeSchema,
    nextNumber: z.string().openapi({ description: "The number this entry would get if posted now (not reserved)" }),
    postingMode: z.enum(["POSTED_IMMEDIATELY", "DISPATCHED_IMMEDIATELY", "PENDING_VERIFICATION"]),
    lines: z.array(z.object({ productId: z.string().uuid(), qty: Qty, available: Qty.nullable(), insufficient: z.boolean(), unitPrice: z.string().optional(), amount: Money.optional(), unitCostBdt: Cost4.optional(), landedUnitCost: Cost4.nullable().optional(), costAmount: Money.optional(), belowCost: z.boolean() }).passthrough()),
    charges: z.array(z.object({ amountBdt: Money.optional() }).passthrough()),
    totals: z.object({ goodsTotal: Money, subtotal: Money.optional(), discountAmount: Money, netAmount: Money, vatPercent: z.string(), vatAmount: Money, grandTotal: Money.optional(), costTotal: Money.optional(), profit: Money.optional() }).passthrough(),
    warnings: z.array(WarningDto).openapi({
      description:
        "Includes, for GRN (Imported): IMPORT_DOCS_MISSING, CI_CURRENCY_MISMATCH, CI_VALUE_MISMATCH (> 1 %), PL_NET_ABOVE_GROSS, BOE_BEFORE_BL, DUPLICATE_BL / DUPLICATE_CI / DUPLICATE_BOE (with a link). Never blocking.",
    }),
    documentsChecklist: ChecklistDto.optional().openapi({ description: "GRN (Imported) only" }),
  }),
);

const MovementDto = registry.register(
  "StockMovement",
  z.object({
    id: z.string().uuid(),
    seq: z.string(),
    postedAt: z.string(),
    entry: EntryRef,
    product: z.object({ id: z.string().uuid(), code: z.string(), name: z.string() }),
    warehouse: WarehouseRef,
    condition: z.enum(["GOOD", "DAMAGED"]),
    qtyChange: Qty,
    unitCost: Cost4.optional(),
    valueChange: Money.optional(),
    balanceAfter: Qty,
    avgCostAfter: Cost4.optional(),
  }),
);

const StockLevelDto = registry.register(
  "StockLevel",
  z.object({
    product: z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), unitCode: z.string(), minStockLevel: z.string().nullable(), trackSerial: z.boolean(), status: z.string(), catalogName: z.string(), categoryName: z.string() }),
    warehouses: z.array(z.object({ warehouseId: z.string().uuid(), code: z.string(), good: Qty, damaged: Qty, reserved: Qty })),
    good: Qty,
    damaged: Qty,
    reserved: Qty,
    inTransit: Qty,
    avgCost: Cost4.optional(),
    stockValue: Money.optional(),
  }),
);

const AvailabilityDto = z.object({ onHand: Qty, reserved: Qty, available: Qty, damaged: Qty, avgCost: Cost4.optional() });

const SerialDto = registry.register(
  "SerialNumber",
  z.object({
    id: z.string().uuid(),
    productId: z.string().uuid(),
    serial: z.string(),
    status: z.enum(["IN_STOCK", "RESERVED", "IN_TRANSIT", "ISSUED", "SOLD", "RETURNED_TO_SUPPLIER", "WRITTEN_OFF", "DAMAGED"]),
    productCode: z.string(),
    productName: z.string(),
    warehouseCode: z.string().nullable(),
    projectCode: z.string().nullable(),
    customerName: z.string().nullable(),
  }),
);

const AttachmentDto = registry.register(
  "Attachment",
  z.object({
    id: z.string().uuid(),
    fileName: z.string(),
    mimeType: z.string(),
    size: z.number().int(),
    label: z.string().nullable(),
    docType: AttachmentDocTypeSchema.nullable().openapi({ description: "Import document type; null for ordinary attachments" }),
    uploadedBy: Ref.nullable(),
    createdAt: z.string(),
    uploadedAt: z.string(),
    url: z.string(),
    downloadUrl: z.string().openapi({ description: "Authenticated download; ?inline=1 to view" }),
    thumbnailUrl: z.string().nullable().openapi({ description: "Images only (WebP, 400 px)" }),
  }),
);

const DocumentJobDto = registry.register(
  "DocumentJob",
  z.object({
    jobId: z.string().uuid(),
    kind: z.string(),
    entryId: z.string().uuid().optional(),
    countId: z.string().uuid().optional(),
    purchaseOrderId: z.string().uuid().nullable().optional(),
    status: z.enum(["queued", "processing", "completed", "failed"]),
    fileName: z.string().nullable().optional(),
    downloadUrl: z.string().nullable().optional(),
    failedReason: z.string().nullable().optional(),
  }),
);

const Timestamps = { isActive: z.boolean(), createdAt: z.string(), updatedAt: z.string() };
const CustomerDto = registry.register("Customer", z.object({ id: z.string().uuid(), name: z.string(), contactPerson: z.string().nullable(), phone: z.string().nullable(), email: z.string().nullable(), address: z.string().nullable(), ...Timestamps }));
const SettingsDto = registry.register(
  "InventorySettings",
  z.object({ defaultSalesVatPercent: z.string(), adminWriteOffNeedsApproval: z.boolean(), allowAdminBelowCostSale: z.boolean(), fiscalYearStartMonth: z.number().int(), importDocsRequiredToPost: z.array(ImportDocTypeSchema) }),
);

/* ── stock entries ── */

path("get", "/stock-entries", "List stock entries", `${VIEW} ${SCOPE} Filters: type, status, warehouse, party, product, dates, \`awaitingMyApproval\`, \`awaitingMyReceipt\`, and the import documents: \`blNo\`, \`ciNo\`, \`boeNo\`, \`containerNo\`, \`countryOfOrigin\`. \`q\` also matches BL, CI, B/E, CO and PL numbers and container numbers. ${COST}`, {
  request: { query: EntryListQuerySchema.innerType() },
  responses: { 200: json(listOf(EntryDto)), ...errors(400, 401, 403) },
});

path(
  "post",
  "/stock-entries",
  "Create a stock entry",
  `${CREATE} \`action\`: draft (save), submit (→ PENDING, reserves stock for OUT/transfer), post (FULL only; posts immediately). Opening stock is FULL only. ${STOCK_WRITE} ${COST}`,
  { request: { headers: RequiredKey, ...body(CreateEntrySchema) }, responses: { 201: json(dataOf(EntryDto), "Created"), ...errors(400, 401, 403, 404, 409, 422) } },
);

path("post", "/stock-entries/calculate", "Preview an entry's totals and costs (saves nothing)", `${CREATE} Same calculation the posting engine uses. Includes availability and warnings. ${COST}`, {
  request: body(CalculateEntrySchema),
  responses: { 200: json(dataOf(CalculationDto)), ...errors(400, 401, 403, 422) },
});

path("get", "/stock-entries/{id}", "Get a stock entry", `${VIEW} ${SCOPE} Includes lines, charges, serials, timeline and allowed actions. ${COST}`, {
  request: { params: IdParams },
  responses: { 200: json(dataOf(EntryDto)), ...errors(401, 403, 404) },
});

path("patch", "/stock-entries/{id}", "Edit a draft or rejected entry", `${CREATE} Creator only.`, {
  request: { params: IdParams, ...body(UpdateEntrySchema) },
  responses: { 200: json(dataOf(EntryDto)), ...errors(400, 401, 403, 404, 422) },
});

for (const [action, summary, level, extra, req] of [
  ["submit", "Submit for verification", CREATE, "Creator only. → PENDING; OUT and transfer entries reserve their stock and serials.", optionalBody(ApproveSchema)],
  ["post", "Post a draft or rejected entry directly", FULL, "Write-offs need verification when the setting is on (422 APPROVAL_REQUIRED). GRN (Imported): 422 IMPORT_DOCS_MISSING until every required document has a number and a file.", optionalBody(ApproveSchema)],
  ["approve", "Approve (verify) a pending entry", APPROVE, "Not the creator; warehouse in scope. Posts it (transfers become DISPATCHED). GRN (Imported): 422 IMPORT_DOCS_MISSING until every required document has a number and a file.", optionalBody(ApproveSchema)],
  ["reject", "Reject a pending entry", APPROVE, "Reason required; releases the reservation. The creator can edit and resubmit.", body(ReasonSchema)],
  ["cancel", "Cancel a draft, pending or rejected entry", CREATE, "Creator or FULL. Releases any reservation.", {}],
] as const) {
  path("post", `/stock-entries/{id}/${action}`, summary, `${level} ${extra} ${STOCK_WRITE}`, {
    request: { params: IdParams, headers: RequiredKey, ...req },
    responses: { 200: json(dataOf(EntryDto)), ...errors(400, 401, 403, 404, 409, 422) },
  });
}

path(
  "post",
  "/stock-entries/{id}/reverse",
  "Reverse a posted entry",
  `${FULL} Reason required. Creates a REVERSAL entry that undoes the stock and cost exactly. Refused (422) if stock would go negative, serials have moved on, or later entries depend on it. ${STOCK_WRITE}`,
  {
    request: { params: IdParams, headers: RequiredKey, ...body(ReasonSchema) },
    responses: { 200: json(dataOf(z.object({ original: EntryDto, reversal: EntryDto }))), ...errors(400, 401, 403, 404, 409, 422) },
  },
);

path(
  "post",
  "/stock-entries/{id}/receive",
  "Receive a dispatched transfer",
  `${CREATE} Destination warehouse in scope. A shortfall is booked to DAMAGED stock at the destination with a PENDING write-off for verification. ${STOCK_WRITE}`,
  {
    request: { params: IdParams, headers: RequiredKey, ...body(ReceiveSchema) },
    responses: { 200: json(dataOf(z.object({ entry: EntryDto, shortageEntry: EntryDto.nullable() }))), ...errors(400, 401, 403, 404, 409, 422) },
  },
);

path(
  "put",
  "/stock-entries/{id}/landed-cost",
  "Set landed-cost charges / customs rate of a pending import GRN",
  "Requires `inventory` ≥ APPROVE **and** the `seeCost` flag (warehouse in scope). Only for PENDING `GRN_IMPORT` entries, before approval: replaces the charges, optionally sets `exchangeRate`, recomputes costs. Audit-logged (`stock_entry.landed_cost`).",
  { request: { params: IdParams, ...body(LandedCostSchema) }, responses: { 200: json(dataOf(EntryDto)), ...errors(400, 401, 403, 404, 422) } },
);

/* ── import documents (GRN Imported) ── */

path(
  "patch",
  "/stock-entries/{id}/import-shipment",
  "Edit the import document details of a GRN (Imported)",
  "Requires `inventory` ≥ CREATE. GRN (Imported) only (400 otherwise). The creator while DRAFT / PENDING / REJECTED, a verifier (APPROVE, warehouse in scope) on a PENDING entry, inventory FULL at any time (also after posting). Replaces all document fields. `ciValue` needs seeCost (kept otherwise). Audit-logged with before / after; never changes stock or costs.",
  { request: { params: IdParams, ...body(ImportShipmentSchema) }, responses: { 200: json(dataOf(EntryDto)), ...errors(400, 401, 403, 404, 422) } },
);

/* ── attachments & documents ── */

path("get", "/stock-entries/{id}/attachments", "List an entry's attachments", `${VIEW} Filter \`docType\` (BL, CO, PL, CI, BOE, OTHER).`, {
  request: { params: IdParams, query: z.object({ docType: AttachmentDocTypeSchema.optional() }) },
  responses: { 200: json(dataOf(z.array(AttachmentDto))), ...errors(401, 403, 404) },
});

path(
  "post",
  "/stock-entries/{id}/attachments",
  "Upload attachments or import document files",
  `${CREATE} multipart/form-data. Field \`file\` (repeatable; \`files\` also accepted), optional \`label\` and \`docType\`. Works with the bearer token (mobile apps, e.g. a phone photo).

**Without docType** (ordinary attachments): PDF, JPG, PNG or WebP detected from content; ≤ 10 MB each, ≤ 20 per entry.

**With docType** (GRN Imported only, 400 otherwise): PDF, JPG or PNG detected from the content (magic bytes, not the name); ≤ 10 MB each; ≤ 10 files per document type. File names are sanitised; files are stored privately under imports/{entryId}/{docType}/. Images get a thumbnail. Allowed: the creator while DRAFT / PENDING / REJECTED, a verifier on a PENDING entry, inventory FULL at any time. Audit-logged.`,
  {
  request: { params: IdParams, ...multipart(z.object({ file: z.array(binaryFile), label: z.string().optional(), docType: AttachmentDocTypeSchema.optional() })) },
  responses: { 201: json(dataOf(z.array(AttachmentDto)), "Uploaded"), ...errors(400, 401, 403, 404, 422) },
});

const AttachmentParams = z.object({ id: z.string().uuid(), attachmentId: z.string().uuid() });
path("get", "/stock-entries/{id}/attachments/{attachmentId}", "Download an attachment", VIEW, {
  request: { params: AttachmentParams },
  responses: { 200: file("application/octet-stream", "The file"), ...errors(401, 403, 404) },
});
path("get", "/stock-entries/{id}/attachments/{attachmentId}/download", "Download or view an attachment", `${VIEW} ${SCOPE} Streamed through this authenticated route (never a public link). \`?inline=1\` to view in the browser, \`?variant=thumb\` for an image's thumbnail.`, {
  request: { params: AttachmentParams, query: z.object({ inline: z.enum(["1"]).optional(), variant: z.enum(["thumb"]).optional() }) },
  responses: { 200: file("application/octet-stream", "The file (PDF, JPG, PNG; thumbnails are WebP)"), ...errors(401, 403, 404) },
});
path("delete", "/stock-entries/{id}/attachments/{attachmentId}", "Remove an attachment", `${CREATE} Import document files: the uploader while the entry is not posted; inventory FULL at any time, and a \`reason\` (JSON body or ?reason=) is required once the entry is posted. Audit-logged.`, {
  request: { params: AttachmentParams, ...optionalBody(RemoveAttachmentSchema) },
  responses: { 204: { description: "Removed" }, ...errors(400, 401, 403, 404) },
});

path("post", "/stock-entries/{id}/documents", "Queue a printable PDF", `${VIEW} GRN, challan, invoice, return/write-off/transfer/reversal note. Rendered by the worker; poll the returned job. Cost columns follow the caller's seeCost.`, {
  request: { params: IdParams, ...optionalBody(DocumentRequestSchema) },
  responses: { 202: json(dataOf(DocumentJobDto), "Queued"), ...errors(401, 403, 404, 422) },
});

path("get", "/documents/{jobId}", "Document job status, or the PDF with ?download=1", "Only the user who requested it.", {
  request: { params: z.object({ jobId: z.string().uuid() }), query: z.object({ download: z.enum(["1"]).optional() }) },
  responses: { 200: { description: "Job status (JSON) or the PDF", content: { "application/json": { schema: dataOf(DocumentJobDto) }, "application/pdf": { schema: binaryFile } } }, ...errors(401, 404, 422) },
});

/* ── stock levels ── */

path("get", "/stock/balances", "Stock levels by product", `${VIEW} Good, damaged, reserved and in-transit quantities per warehouse in scope. ${COST}`, {
  request: { query: BalanceListQuerySchema.innerType() },
  responses: { 200: json(listOf(StockLevelDto)), ...errors(400, 401, 403) },
});

path("get", "/stock/products/{productId}", "A product's stock card and ledger", `${VIEW} ${COST}`, {
  request: { params: z.object({ productId: z.string().uuid() }), query: MovementListQuerySchema.innerType() },
  responses: { 200: json(z.object({ data: z.object({ product: z.record(z.unknown()), level: StockLevelDto, inTransit: z.array(z.record(z.unknown())), movements: z.array(MovementDto) }), meta: z.record(z.unknown()) })), ...errors(401, 403, 404) },
});

path("get", "/stock/availability", "Available quantity of a product in a warehouse", `${VIEW} available = on hand − reserved (GOOD). ${COST}`, {
  request: { query: AvailabilityQuerySchema },
  responses: { 200: json(dataOf(AvailabilityDto)), ...errors(400, 401, 403) },
});

path("get", "/stock/movements", "Stock ledger (append-only movements)", `${VIEW} ${COST}`, {
  request: { query: MovementListQuerySchema.innerType() },
  responses: { 200: json(listOf(MovementDto)), ...errors(400, 401, 403) },
});

path("get", "/serials", "List serial numbers", `${VIEW} Search \`q\` by serial.`, {
  request: { query: SerialListQuerySchema.innerType() },
  responses: { 200: json(listOf(SerialDto)), ...errors(400, 401, 403) },
});

path("get", "/serials/{id}", "A serial number and its history", VIEW, {
  request: { params: IdParams },
  responses: { 200: json(dataOf(SerialDto.extend({ history: z.array(z.record(z.unknown())) }))), ...errors(401, 403, 404) },
});

/* ── masters ── */

for (const [p, name, Dto, List, Create, Update, extra] of [
  ["customers", "customer", CustomerDto, CustomerListQuerySchema, CreateCustomerSchema, UpdateCustomerSchema, ""],
] as const) {
  path("get", `/${p}`, `List ${p}`, `${VIEW} Filter \`active\`.`, { request: { query: List.innerType() }, responses: { 200: json(listOf(Dto)), ...errors(400, 401, 403) } }, masterTags);
  path("post", `/${p}`, `Create a ${name}`, `${FULL}${extra}`, { request: { headers: IdempotencyHeaders, ...body(Create) }, responses: { 201: json(dataOf(Dto), "Created"), ...errors(400, 401, 403, 409) } }, masterTags);
  path("get", `/${p}/{id}`, `Get a ${name}`, VIEW, { request: { params: IdParams }, responses: { 200: json(dataOf(Dto)), ...errors(401, 403, 404) } }, masterTags);
  path("patch", `/${p}/{id}`, `Update a ${name}`, FULL, { request: { params: IdParams, ...body(Update) }, responses: { 200: json(dataOf(Dto)), ...errors(400, 401, 403, 404, 409) } }, masterTags);
  path("post", `/${p}/{id}/deactivate`, `Deactivate a ${name}`, `${FULL} Never deleted; inactive records can't be picked on new entries.`, { request: { params: IdParams, headers: IdempotencyHeaders }, responses: { 200: json(dataOf(Dto)), ...errors(401, 403, 404) } }, masterTags);
}

path("get", "/inventory-settings", "Inventory settings", FULL, { responses: { 200: json(dataOf(SettingsDto)), ...errors(401, 403) } });
path("patch", "/inventory-settings", "Update inventory settings", `${FULL} Audit-logged.`, {
  request: body(UpdateSettingsSchema),
  responses: { 200: json(dataOf(SettingsDto)), ...errors(400, 401, 403) },
});
