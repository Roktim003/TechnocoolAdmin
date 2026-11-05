import { NotFoundError, ValidationError } from "@/shared/errors/app-error";
import { authedRoute, type AuthedContext, type BaseContext } from "@/shared/http/route";
import { pageMeta } from "@/shared/pagination/list-query";
import { UuidSchema, type z } from "@/shared/validation/zod";
import {
  ApproveSchema,
  AttachmentDocTypeSchema,
  AttachmentListQuerySchema,
  AvailabilityQuerySchema,
  BalanceListQuerySchema,
  CalculateEntrySchema,
  CreateCustomerSchema,
  CreateEntrySchema,
  CustomerListQuerySchema,
  DocumentRequestSchema,
  EntryListQuerySchema,
  ImportShipmentSchema,
  LandedCostSchema,
  MovementListQuerySchema,
  ReasonSchema,
  ReceiveSchema,
  RemoveAttachmentSchema,
  SerialListQuerySchema,
  UpdateCustomerSchema,
  UpdateEntrySchema,
  UpdateSettingsSchema,
} from "../application/dto";
import type { Principal } from "@/shared/auth/principal";
import type { EntryRecord, InventoryActor } from "../application/ports";
import { inventory } from "./container";
import { documentFile, documentStatus, enqueueDocument } from "./documents";
import { groupAttachments, toAttachmentDto, toCalculationDto, toCustomerDto, toEntryDto, toMovementDto } from "./mappers";

/* Thin HTTP adapters: parse + validate → call the service → map. */

const VIEW = { permission: ["inventory", "VIEW"] } as const;
const CREATE = { permission: ["inventory", "CREATE"] } as const;
const FULL = { permission: ["inventory", "FULL"] } as const;
/** Stock-changing endpoints: Idempotency-Key is mandatory. */
const STOCK = (level: "CREATE" | "APPROVE" | "FULL") => ({ permission: ["inventory", level] as const, idempotent: "required" as const });

type IdParams = { id: string };

/** The inventory actor for a principal (API requests and server-rendered pages). */
export function principalActor(p: Principal, ip: string | null = null, requestId: string | null = null): InventoryActor {
  return {
    actorId: p.userId,
    name: p.name,
    ip,
    requestId,
    level: p.permissions.inventory,
    warehouseIds: p.warehouseIds,
    canSeeCost: p.flags.seeCost,
    canSeeProfit: p.flags.seeProfit,
    isAdmin: p.isAdmin,
  };
}

export const actorOf = (ctx: AuthedContext<unknown>): InventoryActor => principalActor(ctx.principal, ctx.ip, ctx.requestId);

function uuid(value: string | undefined, entity: string): string {
  const parsed = UuidSchema.safeParse(value);
  if (!parsed.success) throw new NotFoundError(entity);
  return parsed.data;
}
const id = (ctx: BaseContext<IdParams>, entity = "Stock entry") => uuid(ctx.params.id, entity);

/** Optional JSON body (POST actions without a body are fine). */
async function optionalBody<S extends z.ZodTypeAny>(ctx: BaseContext<unknown>, schema: S): Promise<z.output<S>> {
  return (await ctx.text()).trim() ? ctx.body(schema) : schema.parse({});
}

/**
 * Entry detail. GRN (Imported) also gets its documents checklist, the import document files
 * grouped by document type, and the import warnings. Also used by the server-rendered entry pages.
 */
export async function entryDetail(a: InventoryActor, entryId: string) {
  const e = await inventory().entries.get(a, entryId);
  if (e.type !== "GRN_IMPORT") return toEntryDto(e, a);
  const docs = inventory().importDocs;
  const required = await docs.required();
  const files = await inventory().attachments.list(a, entryId);
  const importWarnings = await docs.warnings(inventory().uow.store, e.importShipment, { id: e.id, currency: e.currency, lines: e.lines });
  return { ...toEntryDto(e, a, { requiredDocs: required }), importDocsRequiredToPost: required, importAttachments: groupAttachments(files), importWarnings };
}

const entry = (ctx: AuthedContext<unknown>, entryId: string) => entryDetail(actorOf(ctx), entryId);

/** One entry after a write: GRN (Imported) gets its documents checklist. */
async function entryDto(e: EntryRecord, a: InventoryActor) {
  return toEntryDto(e, a, e.type === "GRN_IMPORT" ? { requiredDocs: await inventory().importDocs.required() } : {});
}

/* ─────────────── stock entries ─────────────── */

export const entryHandlers = {
  list: authedRoute(VIEW, async (ctx) => {
    const query = ctx.query(EntryListQuerySchema);
    const a = actorOf(ctx);
    const { items, total } = await inventory().entries.list(a, query);
    const requiredDocs = items.some((e) => e.type === "GRN_IMPORT") ? await inventory().importDocs.required() : undefined;
    return { data: items.map((e) => toEntryDto(e, a, { requiredDocs })), meta: pageMeta(total, query.page, query.pageSize) };
  }),

  create: authedRoute(STOCK("CREATE"), async (ctx) => {
    const input = await ctx.body(CreateEntrySchema);
    const a = actorOf(ctx);
    const e = await inventory().entries.create(a, input);
    return { status: 201, data: await entryDto(e, a), headers: { Location: `/api/v1/stock-entries/${e.id}` } };
  }),

  calculate: authedRoute({ ...CREATE, idempotent: false }, async (ctx) => {
    const input = await ctx.body(CalculateEntrySchema);
    const a = actorOf(ctx);
    return { data: toCalculationDto(await inventory().entries.calculate(a, input), a) };
  }),

  get: authedRoute<IdParams>(VIEW, async (ctx) => ({ data: await entry(ctx, id(ctx)) })),

  update: authedRoute<IdParams>(CREATE, async (ctx) => {
    const entryId = id(ctx);
    const a = actorOf(ctx);
    return { data: await entryDto(await inventory().entries.update(a, entryId, await ctx.body(UpdateEntrySchema)), a) };
  }),

  submit: authedRoute<IdParams>(STOCK("CREATE"), async (ctx) => {
    const entryId = id(ctx);
    const body = await optionalBody(ctx, ApproveSchema);
    const a = actorOf(ctx);
    return { data: await entryDto(await inventory().entries.submit(a, entryId, body.confirmBelowCost), a) };
  }),

  post: authedRoute<IdParams>(STOCK("FULL"), async (ctx) => {
    const entryId = id(ctx);
    const body = await optionalBody(ctx, ApproveSchema);
    const a = actorOf(ctx);
    return { data: await entryDto(await inventory().entries.postDraft(a, entryId, body.confirmBelowCost), a) };
  }),

  approve: authedRoute<IdParams>(STOCK("APPROVE"), async (ctx) => {
    const entryId = id(ctx);
    const body = await optionalBody(ctx, ApproveSchema);
    const a = actorOf(ctx);
    return { data: await entryDto(await inventory().entries.approve(a, entryId, body.confirmBelowCost), a) };
  }),

  reject: authedRoute<IdParams>(STOCK("APPROVE"), async (ctx) => {
    const entryId = id(ctx);
    const { reason } = await ctx.body(ReasonSchema);
    const a = actorOf(ctx);
    return { data: await entryDto(await inventory().entries.reject(a, entryId, reason), a) };
  }),

  cancel: authedRoute<IdParams>(CREATE, async (ctx) => {
    const a = actorOf(ctx);
    return { data: await entryDto(await inventory().entries.cancel(a, id(ctx)), a) };
  }),

  reverse: authedRoute<IdParams>(STOCK("FULL"), async (ctx) => {
    const entryId = id(ctx);
    const { reason } = await ctx.body(ReasonSchema);
    const a = actorOf(ctx);
    const r = await inventory().entries.reverse(a, entryId, reason);
    return { data: { original: await entryDto(r.original, a), reversal: await entryDto(r.reversal, a) } };
  }),

  receive: authedRoute<IdParams>(STOCK("CREATE"), async (ctx) => {
    const entryId = id(ctx);
    const input = await ctx.body(ReceiveSchema);
    const a = actorOf(ctx);
    const r = await inventory().entries.receive(a, entryId, input);
    return { data: { entry: toEntryDto(r.entry, a), shortageEntry: r.shortageEntry ? toEntryDto(r.shortageEntry, a) : null } };
  }),

  /** Pending import GRN: landed-cost charges and customs rate (verifier with seeCost). */
  landedCost: authedRoute<IdParams>({ permission: ["inventory", "APPROVE"] }, async (ctx) => {
    const entryId = id(ctx);
    const input = await ctx.body(LandedCostSchema);
    const a = actorOf(ctx);
    return { data: await entryDto(await inventory().entries.updateLandedCost(a, entryId, input), a) };
  }),

  /** GRN (Imported): document details (creator / verifier / FULL rules; never changes stock or costs). */
  importShipment: authedRoute<IdParams>(CREATE, async (ctx) => {
    const entryId = id(ctx);
    const input = await ctx.body(ImportShipmentSchema);
    const a = actorOf(ctx);
    await inventory().importDocs.update(a, entryId, input);
    return { data: await entryDetail(a, entryId) };
  }),

  /* attachments */
  listAttachments: authedRoute<IdParams>(VIEW, async (ctx) => {
    const entryId = id(ctx);
    const { docType } = ctx.query(AttachmentListQuerySchema);
    return { data: (await inventory().attachments.list(actorOf(ctx), entryId, docType)).map(toAttachmentDto) };
  }),

  addAttachments: authedRoute<IdParams>({ permission: ["inventory", "CREATE"], idempotent: false }, async (ctx) => {
    const entryId = id(ctx);
    const form = await ctx.form();
    const files = await Promise.all(
      [...form.getAll("file"), ...form.getAll("files")]
        .filter((v): v is File => typeof v === "object" && v !== null && "arrayBuffer" in v)
        .map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
    );
    const label = typeof form.get("label") === "string" ? String(form.get("label")).slice(0, 100) || null : null;
    const rawDocType = form.get("docType");
    let docType = null;
    if (typeof rawDocType === "string" && rawDocType.trim()) {
      const parsed = AttachmentDocTypeSchema.safeParse(rawDocType);
      if (!parsed.success) throw new ValidationError("Unknown document type.", [{ path: "docType", message: "Use BL, CO, PL, CI, BOE or OTHER.", code: "INVALID_DOC_TYPE" }]);
      docType = parsed.data;
    }
    return { status: 201, data: (await inventory().attachments.upload(actorOf(ctx), entryId, files, label, docType)).map(toAttachmentDto) };
  }),

  /** Streams the file through this authenticated route (never a public URL). ?variant=thumb, ?inline=1. */
  downloadAttachment: authedRoute<{ id: string; attachmentId: string }>(VIEW, async (ctx) => {
    const sp = ctx.req.nextUrl.searchParams;
    const variant = sp.get("variant") === "thumb" ? "thumb" : "original";
    const f = await inventory().attachments.file(actorOf(ctx), uuid(ctx.params.id, "Stock entry"), uuid(ctx.params.attachmentId, "Attachment"), variant);
    return { file: { body: f.body, contentType: f.mimeType, filename: f.fileName, inline: variant === "thumb" || sp.get("inline") === "1", cacheSeconds: 300 } };
  }),

  attachmentFile: authedRoute<{ id: string; attachmentId: string }>(VIEW, async (ctx) => {
    const f = await inventory().attachments.file(actorOf(ctx), uuid(ctx.params.id, "Stock entry"), uuid(ctx.params.attachmentId, "Attachment"));
    return { file: { body: f.body, contentType: f.mimeType, filename: f.fileName, inline: true, cacheSeconds: 300 } };
  }),

  removeAttachment: authedRoute<{ id: string; attachmentId: string }>(CREATE, async (ctx) => {
    const entryId = uuid(ctx.params.id, "Stock entry");
    const attachmentId = uuid(ctx.params.attachmentId, "Attachment");
    // The reason (posted entries) comes as a JSON body or ?reason=.
    const body = await optionalBody(ctx, RemoveAttachmentSchema);
    const reason = body.reason ?? (ctx.req.nextUrl.searchParams.get("reason")?.trim() || null);
    if (reason !== null && reason.length < 3) throw new ValidationError("Give a reason (at least 3 characters).", [{ path: "reason", message: "Give a reason (at least 3 characters)." }]);
    await inventory().attachments.remove(actorOf(ctx), entryId, attachmentId, reason ? reason.slice(0, 500) : null);
    return { status: 204 };
  }),

  /* documents */
  requestDocument: authedRoute<IdParams>({ ...VIEW, idempotent: false }, async (ctx) => {
    const entryId = id(ctx);
    const { kind } = await optionalBody(ctx, DocumentRequestSchema);
    const r = await enqueueDocument(actorOf(ctx), entryId, kind);
    return { status: 202, data: r, headers: { Location: `/api/v1/documents/${r.jobId}` } };
  }),
};

/** Any signed-in user may poll / download the documents they requested (the job is tied to the requester). */
export const documentHandlers = {
  get: authedRoute<{ jobId: string }>({}, async (ctx) => {
    const jobId = uuid(ctx.params.jobId, "Document");
    if (ctx.req.nextUrl.searchParams.get("download") === "1") {
      const f = await documentFile(jobId, ctx.principal.userId);
      return { file: { body: f.body, contentType: "application/pdf", filename: f.fileName, inline: true } };
    }
    return { data: await documentStatus(jobId, ctx.principal.userId) };
  }),
};

/* ─────────────── stock ─────────────── */

const ProductLedgerQuerySchema = MovementListQuerySchema;

export const stockHandlers = {
  balances: authedRoute(VIEW, async (ctx) => {
    const query = ctx.query(BalanceListQuerySchema);
    const { items, total } = await inventory().stock.balances(actorOf(ctx), query);
    return { data: items, meta: pageMeta(total, query.page, query.pageSize) };
  }),

  product: authedRoute<{ productId: string }>(VIEW, async (ctx) => {
    const productId = uuid(ctx.params.productId, "Product");
    const query = ctx.query(ProductLedgerQuerySchema);
    const r = await inventory().stock.productStock(actorOf(ctx), productId, query);
    return {
      data: { product: r.product, level: r.level, inTransit: r.inTransit, movements: r.ledger.items.map(toMovementDto) },
      meta: pageMeta(r.ledger.total, query.page, query.pageSize),
    };
  }),

  availability: authedRoute(VIEW, async (ctx) => {
    const { productId, warehouseId } = ctx.query(AvailabilityQuerySchema);
    return { data: await inventory().stock.availability(actorOf(ctx), productId, warehouseId) };
  }),

  movements: authedRoute(VIEW, async (ctx) => {
    const query = ctx.query(MovementListQuerySchema);
    const { items, total } = await inventory().stock.movements(actorOf(ctx), query);
    return { data: items.map(toMovementDto), meta: pageMeta(total, query.page, query.pageSize) };
  }),
};

export const serialHandlers = {
  list: authedRoute(VIEW, async (ctx) => {
    const query = ctx.query(SerialListQuerySchema);
    const { items, total } = await inventory().stock.listSerials(query);
    return { data: items, meta: pageMeta(total, query.page, query.pageSize) };
  }),
  get: authedRoute<IdParams>(VIEW, async (ctx) => {
    const r = await inventory().stock.serial(id(ctx, "Serial number"));
    return { data: { ...r.serial, history: r.history.map((h) => ({ ...h, at: h.at.toISOString() })) } };
  }),
};

/* ─────────────── masters ─────────────── */

function masterHandlers<C extends z.ZodTypeAny, U extends z.ZodTypeAny, L extends z.ZodTypeAny>(
  entity: string,
  schemas: { list: L; create: C; update: U },
  svc: {
    list: (q: z.output<L>) => Promise<{ items: unknown[]; total: number }>;
    get: (id: string) => Promise<unknown>;
    create: (a: InventoryActor, input: z.output<C>) => Promise<unknown>;
    update: (a: InventoryActor, id: string, input: z.output<U>) => Promise<unknown>;
  },
  map: (x: never) => unknown,
) {
  return {
    list: authedRoute(VIEW, async (ctx) => {
      const query = ctx.query(schemas.list) as { page: number; pageSize: number };
      const { items, total } = await svc.list(query);
      return { data: items.map((x) => map(x as never)), meta: pageMeta(total, query.page, query.pageSize) };
    }),
    create: authedRoute(FULL, async (ctx) => ({ status: 201, data: map((await svc.create(actorOf(ctx), await ctx.body(schemas.create))) as never) })),
    get: authedRoute<IdParams>(VIEW, async (ctx) => ({ data: map((await svc.get(id(ctx, entity))) as never) })),
    update: authedRoute<IdParams>(FULL, async (ctx) => {
      const masterId = id(ctx, entity);
      return { data: map((await svc.update(actorOf(ctx), masterId, await ctx.body(schemas.update))) as never) };
    }),
    deactivate: authedRoute<IdParams>(FULL, async (ctx) => ({ data: map((await svc.update(actorOf(ctx), id(ctx, entity), { isActive: false } as z.output<U>)) as never) })),
  };
}

const m = () => inventory().masters;

export const customerHandlers = masterHandlers(
  "Customer",
  { list: CustomerListQuerySchema, create: CreateCustomerSchema, update: UpdateCustomerSchema },
  { list: (q) => m().listCustomers(q), get: (i) => m().getCustomer(i), create: (a, x) => m().createCustomer(a, x), update: (a, i, x) => m().updateCustomer(a, i, x) },
  toCustomerDto as (x: never) => unknown,
);

/* ─────────────── settings ─────────────── */

export const settingsHandlers = {
  get: authedRoute(FULL, async () => ({ data: await m().settings() })),
  update: authedRoute(FULL, async (ctx) => {
    const input = await ctx.body(UpdateSettingsSchema);
    if (!Object.keys(input).length) throw new ValidationError("Provide at least one setting.");
    return { data: await m().updateSettings(actorOf(ctx), input) };
  }),
};

