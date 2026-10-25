import { NotFoundError, ValidationError } from "@/shared/errors/app-error";
import { authedRoute, type BaseContext } from "@/shared/http/route";
import { pageMeta } from "@/shared/pagination/list-query";
import { UuidSchema, type z } from "@/shared/validation/zod";
import {
  CountLineSchema,
  CountListQuerySchema,
  CreateCountSchema,
  LowStockQuerySchema,
  RecountSchema,
  SubmitCountSchema,
  UnlockOpeningSchema,
  UpdateAlertSettingsSchema,
  UpdateCountSchema,
} from "../application/dto";
import type { CountRecord } from "../application/count.service";
import type { InventoryActor } from "../application/ports";
import type { OpeningImportRecord } from "../application/opening.service";
import { lowStockWorkbook } from "../infrastructure/stock-excel";
import { inventory } from "./container";
import { enqueueCountSheet } from "./documents";
import { actorOf } from "./http";
import { toCountDto, toCountSummaryDto, toOpeningImportDto, toOpeningWarehouseDto, toVarianceDto } from "./mappers";

/* Stock counts, opening stock, low stock and alert settings: thin HTTP adapters. */

const VIEW = { permission: ["inventory", "VIEW"] } as const;
const CREATE = { permission: ["inventory", "CREATE"] } as const;
const FULL = { permission: ["inventory", "FULL"] } as const;
/** Changes stock or freezes it: the Idempotency-Key header is mandatory. */
const STOCK = (level: "CREATE" | "APPROVE" | "FULL") => ({ permission: ["inventory", level] as const, idempotent: "required" as const });
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function uuid(value: string | undefined, entity: string): string {
  const parsed = UuidSchema.safeParse(value);
  if (!parsed.success) throw new NotFoundError(entity);
  return parsed.data;
}
const countId = (ctx: BaseContext<{ id: string }>) => uuid(ctx.params.id, "Stock count");

async function optionalBody<S extends z.ZodTypeAny>(ctx: BaseContext<unknown>, schema: S): Promise<z.output<S>> {
  return (await ctx.text()).trim() ? ctx.body(schema) : schema.parse({});
}

const countDto = (c: CountRecord, a: InventoryActor) => toCountDto(c, a, inventory().counts.canSeeSystem(a, c));

const stamp = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());

/* ───────────── stock counts ───────────── */

export const countHandlers = {
  list: authedRoute(VIEW, async (ctx) => {
    const query = ctx.query(CountListQuerySchema);
    const { items, total } = await inventory().counts.list(actorOf(ctx), query);
    return { data: items.map(toCountSummaryDto), meta: pageMeta(total, query.page, query.pageSize) };
  }),
  create: authedRoute({ ...CREATE, idempotent: true }, async (ctx) => {
    const a = actorOf(ctx);
    return { status: 201, data: countDto(await inventory().counts.create(a, await ctx.body(CreateCountSchema)), a) };
  }),
  get: authedRoute<{ id: string }>(VIEW, async (ctx) => {
    const a = actorOf(ctx);
    return { data: countDto(await inventory().counts.get(a, countId(ctx)), a) };
  }),
  update: authedRoute<{ id: string }>(CREATE, async (ctx) => {
    const a = actorOf(ctx);
    const id = countId(ctx);
    return { data: countDto(await inventory().counts.update(a, id, await ctx.body(UpdateCountSchema)), a) };
  }),
  start: authedRoute<{ id: string }>(STOCK("CREATE"), async (ctx) => {
    const a = actorOf(ctx);
    return { data: countDto(await inventory().counts.start(a, countId(ctx)), a) };
  }),
  countLine: authedRoute<{ id: string; lineId: string }>(CREATE, async (ctx) => {
    const a = actorOf(ctx);
    const id = countId(ctx);
    const lineId = uuid(ctx.params.lineId, "Count line");
    const c = await inventory().counts.countLine(a, id, lineId, await ctx.body(CountLineSchema));
    return { data: countDto(c, a) };
  }),
  submit: authedRoute<{ id: string }>(STOCK("CREATE"), async (ctx) => {
    const a = actorOf(ctx);
    const id = countId(ctx);
    return { data: countDto(await inventory().counts.submit(a, id, await optionalBody(ctx, SubmitCountSchema)), a) };
  }),
  approve: authedRoute<{ id: string }>(STOCK("APPROVE"), async (ctx) => {
    const a = actorOf(ctx);
    return { data: countDto(await inventory().counts.approve(a, countId(ctx)), a) };
  }),
  requestRecount: authedRoute<{ id: string }>(STOCK("APPROVE"), async (ctx) => {
    const a = actorOf(ctx);
    const id = countId(ctx);
    const { lineIds } = await ctx.body(RecountSchema);
    return { data: countDto(await inventory().counts.requestRecount(a, id, lineIds), a) };
  }),
  cancel: authedRoute<{ id: string }>(STOCK("CREATE"), async (ctx) => {
    const a = actorOf(ctx);
    return { data: countDto(await inventory().counts.cancel(a, countId(ctx)), a) };
  }),
  variance: authedRoute<{ id: string }>(VIEW, async (ctx) => {
    const a = actorOf(ctx);
    return { data: toVarianceDto(await inventory().counts.variance(a, countId(ctx)), a) };
  }),
  sheet: authedRoute<{ id: string }>(VIEW, async (ctx) => {
    const r = await enqueueCountSheet(actorOf(ctx), countId(ctx));
    return { status: 202, data: r, headers: { Location: `/api/v1/documents/${r.jobId}` } };
  }),
};

/* ───────────── opening stock ───────────── */

async function openingDto(r: OpeningImportRecord) {
  const store = inventory().uow.store;
  const entries = [];
  for (const id of r.entryIds) {
    const e = await store.entry(id);
    if (e) entries.push({ id: e.id, number: e.number, warehouse: e.warehouse.code });
  }
  return toOpeningImportDto(r, entries);
}

export const openingHandlers = {
  template: authedRoute(FULL, async (ctx) => {
    const bytes = await inventory().openings.template(actorOf(ctx));
    return { file: { body: bytes, contentType: XLSX, filename: "stockbook-opening-stock-template.xlsx" } };
  }),
  list: authedRoute(FULL, async (ctx) => ({ data: await Promise.all((await inventory().openings.recent(actorOf(ctx))).map(openingDto)) })),
  upload: authedRoute({ ...FULL, idempotent: false }, async (ctx) => {
    const form = await ctx.form();
    const file = form.get("file");
    if (!file || typeof file === "string") throw new ValidationError("Choose the .xlsx file to upload.", [{ path: "file", message: "Choose a file." }]);
    const r = await inventory().openings.upload(actorOf(ctx), { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    return { status: 202, data: await openingDto(r), headers: { Location: `/api/v1/opening-stock/imports/${r.id}` } };
  }),
  get: authedRoute<{ id: string }>(FULL, async (ctx) => ({ data: await openingDto(await inventory().openings.get(actorOf(ctx), uuid(ctx.params.id, "Opening import"))) })),
  commit: authedRoute<{ id: string }>(STOCK("FULL"), async (ctx) => {
    const r = await inventory().openings.commit(actorOf(ctx), uuid(ctx.params.id, "Opening import"));
    return { data: { ...(await openingDto(r.import)), alreadyCommitted: r.alreadyCommitted } };
  }),
  warehouses: authedRoute(FULL, async (ctx) => ({ data: (await inventory().openings.warehouses(actorOf(ctx))).map(toOpeningWarehouseDto) })),
  lock: authedRoute<{ id: string }>({ ...FULL, idempotent: true }, async (ctx) => ({ data: toOpeningWarehouseDto(await inventory().openings.lock(actorOf(ctx), uuid(ctx.params.id, "Warehouse"))) })),
  unlock: authedRoute<{ id: string }>({ ...FULL, idempotent: true }, async (ctx) => {
    const id = uuid(ctx.params.id, "Warehouse");
    const { reason } = await ctx.body(UnlockOpeningSchema);
    return { data: toOpeningWarehouseDto(await inventory().openings.unlock(actorOf(ctx), id, reason)) };
  }),
};

/* ───────────── low stock & alert settings ───────────── */

function sortRows<T extends { shortBy: string; product: { code: string; name: string } }>(rows: T[], sort: { field: string; direction: "asc" | "desc" }[]): T[] {
  const s = sort[0] ?? { field: "shortBy", direction: "desc" };
  const dir = s.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const c = s.field === "shortBy" ? Number(a.shortBy) - Number(b.shortBy) : (s.field === "name" ? a.product.name : a.product.code).localeCompare(s.field === "name" ? b.product.name : b.product.code);
    return c * dir || a.product.code.localeCompare(b.product.code);
  });
}

export const lowStockHandlers = {
  list: authedRoute(VIEW, async (ctx) => {
    const query = ctx.query(LowStockQuerySchema);
    const rows = sortRows(await inventory().alerts.lowStock(actorOf(ctx), { ...query.filters, q: query.q }), query.sort);
    return { data: rows.slice(query.skip, query.skip + query.take), meta: pageMeta(rows.length, query.page, query.pageSize) };
  }),
  export: authedRoute({ ...VIEW, rateLimit: "exports" }, async (ctx) => {
    const query = ctx.query(LowStockQuerySchema);
    const a = actorOf(ctx);
    const rows = sortRows(await inventory().alerts.lowStock(a, { ...query.filters, q: query.q }), query.sort);
    const codes = (await inventory().masters.warehouses()).filter((w) => a.warehouseIds.includes(w.id)).map((w) => w.code);
    return { file: { body: await lowStockWorkbook(rows, codes), contentType: XLSX, filename: `low-stock-${stamp()}.xlsx` } };
  }),
};

export const alertSettingsHandlers = {
  get: authedRoute(FULL, async () => ({ data: await inventory().alerts.settings() })),
  update: authedRoute(FULL, async (ctx) => ({ data: await inventory().alerts.updateSettings(actorOf(ctx), await ctx.body(UpdateAlertSettingsSchema)) })),
};
