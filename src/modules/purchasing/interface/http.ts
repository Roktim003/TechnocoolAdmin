import { NotFoundError, ValidationError } from "@/shared/errors/app-error";
import { authedRoute, type AuthedContext, type BaseContext } from "@/shared/http/route";
import { pageMeta } from "@/shared/pagination/list-query";
import { requireAnyPermission } from "@/shared/rbac/guards";
import { todayInDhaka } from "@/modules/inventory/domain/numbering";
import type { Principal } from "@/shared/auth/principal";
import { UuidSchema, type z } from "@/shared/validation/zod";
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
  PriceHistoryQuerySchema,
  ReceivableListQuerySchema,
  SupplierListQuerySchema,
  UpdatePoSchema,
  UpdatePurchasingSettingsSchema,
  UpdateSupplierSchema,
} from "../application/dto";
import type { PurchasingActor } from "../application/ports";
import { purchasing } from "./container";
import { toPoAttachmentDto, toPoDetailDto, toPoDto, toPriceHistoryDto, toReceivableDto, toReceivableSummaryDto, toSupplierDetailDto, toSupplierDto } from "./mappers";

/* Thin HTTP adapters: parse + validate → call the service → map. */

const VIEW = { permission: ["purchasing", "VIEW"] } as const;
const CREATE = { permission: ["purchasing", "CREATE"] } as const;
const FULL = { permission: ["purchasing", "FULL"] } as const;
/** Workflow POSTs: Idempotency-Key is mandatory (a retry can never submit / approve twice). */
const ACTION = (level: "CREATE" | "APPROVE" | "FULL") => ({ permission: ["purchasing", level] as const, idempotent: "required" as const });
/** Suppliers are read by GRN screens too (inventory). */
const SUPPLIER_READERS = [["purchasing", "VIEW"], ["inventory", "VIEW"]] as const;
/** Receiving against a PO is an inventory action (a Store Manager has purchasing NONE). */
const RECEIVERS = [["purchasing", "VIEW"], ["inventory", "CREATE"]] as const;

type IdParams = { id: string };

/** The purchasing actor for a principal (API requests and server-rendered pages). */
export function purchasingActor(p: Principal, ip: string | null = null, requestId: string | null = null): PurchasingActor {
  return { actorId: p.userId, name: p.name, ip, requestId, level: p.permissions.purchasing, inventoryLevel: p.permissions.inventory, warehouseIds: p.warehouseIds, canSeeCost: p.flags.seeCost };
}
const actorOf = (ctx: AuthedContext<unknown>) => purchasingActor(ctx.principal, ctx.ip, ctx.requestId);

function uuid(value: string | undefined, entity: string): string {
  const parsed = UuidSchema.safeParse(value);
  if (!parsed.success) throw new NotFoundError(entity);
  return parsed.data;
}
const id = (ctx: BaseContext<IdParams>, entity = "Purchase order") => uuid(ctx.params.id, entity);
async function optionalBody<S extends z.ZodTypeAny>(ctx: BaseContext<unknown>, schema: S): Promise<z.output<S>> {
  return (await ctx.text()).trim() ? ctx.body(schema) : schema.parse({});
}

const o = () => purchasing().orders;
const today = () => todayInDhaka();
const poDto = (ctx: AuthedContext<unknown>, po: Parameters<typeof toPoDto>[0]) => toPoDto(po, actorOf(ctx), today());
const detail = async (ctx: AuthedContext<unknown>, poId: string) => toPoDetailDto(await o().detail(actorOf(ctx), poId), actorOf(ctx));

/* ─────────────── suppliers ─────────────── */

export const supplierHandlers = {
  list: authedRoute({}, async (ctx) => {
    requireAnyPermission(ctx.principal, SUPPLIER_READERS);
    const query = ctx.query(SupplierListQuerySchema);
    const { items, total } = await purchasing().suppliers.list(query);
    return { data: items.map(toSupplierDto), meta: pageMeta(total, query.page, query.pageSize) };
  }),
  create: authedRoute(FULL, async (ctx) => {
    const s = await purchasing().suppliers.create(actorOf(ctx), await ctx.body(CreateSupplierSchema));
    return { status: 201, data: toSupplierDto(s), headers: { Location: `/api/v1/suppliers/${s.id}` } };
  }),
  get: authedRoute<IdParams>({}, async (ctx) => {
    requireAnyPermission(ctx.principal, SUPPLIER_READERS);
    const r = await purchasing().suppliers.detail(id(ctx, "Supplier"));
    return { data: toSupplierDetailDto(r.supplier, r.stats, actorOf(ctx)) };
  }),
  update: authedRoute<IdParams>(FULL, async (ctx) => {
    const supplierId = id(ctx, "Supplier");
    return { data: toSupplierDto(await purchasing().suppliers.update(actorOf(ctx), supplierId, await ctx.body(UpdateSupplierSchema))) };
  }),
  deactivate: authedRoute<IdParams>(FULL, async (ctx) => ({ data: toSupplierDto(await purchasing().suppliers.deactivate(actorOf(ctx), id(ctx, "Supplier"))) })),
  purchaseOrders: authedRoute<IdParams>(VIEW, async (ctx) => {
    const supplierId = id(ctx, "Supplier");
    await purchasing().suppliers.get(supplierId);
    const query = ctx.query(PoListQuerySchema);
    const { items, total } = await o().list(actorOf(ctx), { ...query, filters: { ...query.filters, supplierId } });
    return { data: items.map((p) => poDto(ctx, p)), meta: pageMeta(total, query.page, query.pageSize) };
  }),
  priceHistory: authedRoute<IdParams>(VIEW, async (ctx) => {
    const supplierId = id(ctx, "Supplier");
    await purchasing().suppliers.get(supplierId);
    const query = ctx.query(PriceHistoryQuerySchema);
    const { items, total } = await o().priceHistory(actorOf(ctx), { ...query, filters: { ...query.filters, supplierId } });
    return { data: items.map(toPriceHistoryDto), meta: pageMeta(total, query.page, query.pageSize) };
  }),
};

/** GET products/:id/price-history: seeCost, and purchasing or catalog VIEW (product page). */
export const productPriceHistory = authedRoute<IdParams>({}, async (ctx) => {
  requireAnyPermission(ctx.principal, [
    ["purchasing", "VIEW"],
    ["catalog", "VIEW"],
  ]);
  const productId = id(ctx, "Product");
  const query = ctx.query(PriceHistoryQuerySchema);
  const { items, total } = await o().priceHistory(actorOf(ctx), { ...query, filters: { ...query.filters, productId } });
  return { data: items.map(toPriceHistoryDto), meta: pageMeta(total, query.page, query.pageSize) };
});

/* ─────────────── purchase orders ─────────────── */

export const poHandlers = {
  list: authedRoute(VIEW, async (ctx) => {
    const query = ctx.query(PoListQuerySchema);
    const { items, total } = await o().list(actorOf(ctx), query);
    return { data: items.map((p) => poDto(ctx, p)), meta: pageMeta(total, query.page, query.pageSize) };
  }),

  create: authedRoute(ACTION("CREATE"), async (ctx) => {
    const po = await o().create(actorOf(ctx), await ctx.body(CreatePoSchema));
    return { status: 201, data: await detail(ctx, po.id), headers: { Location: `/api/v1/purchase-orders/${po.id}` } };
  }),

  calculate: authedRoute({ ...CREATE, idempotent: false }, async (ctx) => {
    const r = await o().calculate(actorOf(ctx), await ctx.body(CalculatePoSchema));
    const a = actorOf(ctx);
    return { data: a.canSeeCost ? r : { ...r, lines: r.lines.map(() => ({})), totals: undefined } };
  }),

  get: authedRoute<IdParams>(VIEW, async (ctx) => ({ data: await detail(ctx, id(ctx)) })),

  update: authedRoute<IdParams>(CREATE, async (ctx) => {
    const poId = id(ctx);
    await o().update(actorOf(ctx), poId, await ctx.body(UpdatePoSchema));
    return { data: await detail(ctx, poId) };
  }),

  submit: authedRoute<IdParams>(ACTION("CREATE"), async (ctx) => {
    const poId = id(ctx);
    await o().submit(actorOf(ctx), poId);
    return { data: await detail(ctx, poId) };
  }),
  approve: authedRoute<IdParams>(ACTION("APPROVE"), async (ctx) => {
    const poId = id(ctx);
    await o().approve(actorOf(ctx), poId);
    return { data: await detail(ctx, poId) };
  }),
  reject: authedRoute<IdParams>(ACTION("APPROVE"), async (ctx) => {
    const poId = id(ctx);
    await o().reject(actorOf(ctx), poId, (await ctx.body(PoReasonSchema)).reason);
    return { data: await detail(ctx, poId) };
  }),
  markSent: authedRoute<IdParams>(ACTION("APPROVE"), async (ctx) => {
    const poId = id(ctx);
    const input = await optionalBody(ctx, MarkSentSchema);
    const r = await o().markSent(actorOf(ctx), poId, input);
    return { data: { ...(await detail(ctx, poId)), email: r.email } };
  }),
  close: authedRoute<IdParams>(ACTION("APPROVE"), async (ctx) => {
    const poId = id(ctx);
    await o().close(actorOf(ctx), poId, (await ctx.body(PoReasonSchema)).reason);
    return { data: await detail(ctx, poId) };
  }),
  cancel: authedRoute<IdParams>(ACTION("APPROVE"), async (ctx) => {
    const poId = id(ctx);
    await o().cancel(actorOf(ctx), poId, (await ctx.body(PoReasonSchema)).reason);
    return { data: await detail(ctx, poId) };
  }),
  amend: authedRoute<IdParams>(ACTION("APPROVE"), async (ctx) => {
    const poId = id(ctx);
    await o().amend(actorOf(ctx), poId, await ctx.body(AmendPoSchema));
    return { data: await detail(ctx, poId) };
  }),
  email: authedRoute<IdParams>({ ...ACTION("APPROVE"), rateLimit: "exports" }, async (ctx) => {
    const poId = id(ctx);
    const r = await o().email(actorOf(ctx), poId, await optionalBody(ctx, EmailPoSchema));
    return { status: 202, data: { jobId: r.jobId, to: r.to, status: "queued" }, headers: { Location: `/api/v1/documents/${r.jobId}` } };
  }),
  documents: authedRoute<IdParams>({ ...VIEW, idempotent: false, rateLimit: "exports" }, async (ctx) => {
    const r = await o().document(actorOf(ctx), id(ctx));
    return { status: 202, data: { jobId: r.jobId, kind: "PURCHASE_ORDER", status: "queued" }, headers: { Location: `/api/v1/documents/${r.jobId}` } };
  }),

  fromLowStock: authedRoute(ACTION("CREATE"), async (ctx) => {
    const r = await o().fromLowStock(actorOf(ctx), await ctx.body(FromLowStockSchema));
    return {
      status: 201,
      data: {
        created: r.created.map((p) => poDto(ctx, p)),
        unassigned: r.unassigned.map((u) => ({ product: { id: u.product.id, code: u.product.code, name: u.product.name, unitCode: u.product.unitCode }, suggestedQty: u.suggestedQty })),
        warehouseId: r.warehouseId,
      },
    };
  }),

  /* receiving (GRN form): purchasing VIEW or inventory CREATE */
  receivable: authedRoute<IdParams>({}, async (ctx) => {
    requireAnyPermission(ctx.principal, RECEIVERS);
    return { data: toReceivableDto(await o().receivable(actorOf(ctx), id(ctx)), actorOf(ctx)) };
  }),
  receivableList: authedRoute({}, async (ctx) => {
    requireAnyPermission(ctx.principal, RECEIVERS);
    const query = ctx.query(ReceivableListQuerySchema);
    const { items, total } = await o().receivableList(actorOf(ctx), query);
    return { data: items.map(toReceivableSummaryDto), meta: pageMeta(total, query.page, query.pageSize) };
  }),

  /* attachments */
  listAttachments: authedRoute<IdParams>(VIEW, async (ctx) => ({ data: (await purchasing().attachments.list(actorOf(ctx), id(ctx))).map(toPoAttachmentDto) })),
  addAttachments: authedRoute<IdParams>({ ...CREATE, idempotent: false }, async (ctx) => {
    const poId = id(ctx);
    const form = await ctx.form();
    const files = await Promise.all(
      [...form.getAll("file"), ...form.getAll("files")]
        .filter((v): v is File => typeof v === "object" && v !== null && "arrayBuffer" in v)
        .map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
    );
    const label = typeof form.get("label") === "string" ? String(form.get("label")).slice(0, 100) || null : null;
    return { status: 201, data: (await purchasing().attachments.upload(actorOf(ctx), poId, files, label)).map(toPoAttachmentDto) };
  }),
  attachmentFile: authedRoute<{ id: string; attachmentId: string }>(VIEW, async (ctx) => {
    const f = await purchasing().attachments.file(actorOf(ctx), uuid(ctx.params.id, "Purchase order"), uuid(ctx.params.attachmentId, "Attachment"));
    return { file: { body: f.body, contentType: f.mimeType, filename: f.fileName, inline: true, cacheSeconds: 300 } };
  }),
  removeAttachment: authedRoute<{ id: string; attachmentId: string }>(CREATE, async (ctx) => {
    await purchasing().attachments.remove(actorOf(ctx), uuid(ctx.params.id, "Purchase order"), uuid(ctx.params.attachmentId, "Attachment"));
    return { status: 204 };
  }),
};

/* ─────────────── settings ─────────────── */

export const purchasingSettingsHandlers = {
  get: authedRoute(VIEW, async () => ({ data: await purchasing().uow.store.settings() })),
  update: authedRoute(FULL, async (ctx) => {
    const input = await ctx.body(UpdatePurchasingSettingsSchema);
    if (!Object.keys(input).length) throw new ValidationError("Provide at least one setting.");
    const store = purchasing().uow.store;
    const before = await store.settings();
    const after = await store.updateSettings(Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)));
    await store.audit.record(actorOf(ctx), { action: "purchasing_settings.update", entityType: "PurchasingSettings", entityId: null, before, after });
    return { data: after };
  }),
};
