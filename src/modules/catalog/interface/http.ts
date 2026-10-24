import { NotFoundError, ValidationError } from "@/shared/errors/app-error";
import { authedRoute, type AuthedContext, type BaseContext } from "@/shared/http/route";
import { pageMeta, listQuerySchema } from "@/shared/pagination/list-query";
import { UuidSchema } from "@/shared/validation/zod";
import {
  CheckCodeQuerySchema,
  CreateCatalogSchema,
  CreateCategorySchema,
  CreateProductSchema,
  CreateUnitSchema,
  ImportModeSchema,
  PhotoVariantQuerySchema,
  ProductListQuerySchema,
  UpdateCatalogSchema,
  UpdateCategorySchema,
  UpdatePhotoSchema,
  UpdateProductSchema,
  UpdateUnitSchema,
} from "../application/dto";
import type { CatalogActor } from "../application/ports";
import type { UploadedFile } from "../application/photo.service";
import { toAuditLogDto } from "@/modules/audit/interface/http";
import { catalog } from "./container";
import { enqueueImport, importJobStatus } from "./import-jobs";
import { toCatalogDto, toCategoryDto, toPhotoDto, toProductDto, toProductSummaryDto, toUnitDto } from "./mappers";

/* Thin HTTP adapters: parse + validate → call the service → map. */

const VIEW = { permission: ["catalog", "VIEW"] } as const;
const CREATE = { permission: ["catalog", "CREATE"] } as const;
const FULL = { permission: ["catalog", "FULL"] } as const;
/** Multipart bodies are not hashed for Idempotency-Key. */
const FULL_MULTIPART = { permission: ["catalog", "FULL"], idempotent: false } as const;

type IdParams = { id: string };
type PhotoParams = { id: string; photoId: string };

function actor(ctx: AuthedContext<unknown>): CatalogActor {
  return {
    actorId: ctx.principal.userId,
    ip: ctx.ip,
    requestId: ctx.requestId,
    level: ctx.principal.permissions.catalog,
    canSeeCost: ctx.principal.flags.seeCost,
  };
}

function uuidParam(value: string | undefined, entity: string): string {
  const parsed = UuidSchema.safeParse(value);
  if (!parsed.success) throw new NotFoundError(entity);
  return parsed.data;
}

const id = (ctx: BaseContext<IdParams>, entity: string) => uuidParam(ctx.params.id, entity);

async function filesFrom(form: FormData, field: string[]): Promise<UploadedFile[]> {
  const entries = field.flatMap((f) => form.getAll(f)).filter((v): v is File => typeof v === "object" && v !== null && "arrayBuffer" in v);
  return Promise.all(entries.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
}

/** Dhaka-local timestamp for download names: 20261024-1530. */
function stamp(): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}`;
}

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const HistoryQuerySchema = listQuerySchema({ sortFields: ["createdAt"], defaultSort: "-createdAt", filters: {} });

export const productHandlers = {
  list: authedRoute(VIEW, async (ctx) => {
    const query = ctx.query(ProductListQuerySchema);
    const { items, total } = await catalog().products.list(query);
    return { data: items.map(toProductSummaryDto), meta: pageMeta(total, query.page, query.pageSize) };
  }),

  create: authedRoute(CREATE, async (ctx) => {
    const input = await ctx.body(CreateProductSchema);
    const p = await catalog().products.create(actor(ctx), input);
    return { status: 201, data: toProductDto(p), headers: { Location: `/api/v1/products/${p.id}` } };
  }),

  get: authedRoute<IdParams>(VIEW, async (ctx) => ({ data: toProductDto(await catalog().products.get(id(ctx, "Product"))) })),

  update: authedRoute<IdParams>(FULL, async (ctx) => {
    const productId = id(ctx, "Product");
    const input = await ctx.body(UpdateProductSchema);
    return { data: toProductDto(await catalog().products.update(actor(ctx), productId, input)) };
  }),

  discontinue: authedRoute<IdParams>(FULL, async (ctx) => ({ data: toProductDto(await catalog().products.discontinue(actor(ctx), id(ctx, "Product"))) })),

  reactivate: authedRoute<IdParams>(FULL, async (ctx) => ({ data: toProductDto(await catalog().products.reactivate(actor(ctx), id(ctx, "Product"))) })),

  byCode: authedRoute<{ code: string }>(VIEW, async (ctx) => ({ data: toProductDto(await catalog().products.getByCode(decodeURIComponent(ctx.params.code))) })),

  byBarcode: authedRoute<{ barcode: string }>(VIEW, async (ctx) => ({ data: toProductDto(await catalog().products.getByBarcode(decodeURIComponent(ctx.params.barcode))) })),

  checkCode: authedRoute(VIEW, async (ctx) => {
    const { code } = ctx.query(CheckCodeQuerySchema);
    return { data: await catalog().products.checkCode(code) };
  }),

  history: authedRoute<IdParams>(VIEW, async (ctx) => {
    const query = ctx.query(HistoryQuerySchema);
    const { items, total } = await catalog().products.history(id(ctx, "Product"), query.page, query.pageSize);
    return { data: items.map(toAuditLogDto), meta: pageMeta(total, query.page, query.pageSize) };
  }),

  export: authedRoute(FULL, async (ctx) => {
    const query = ctx.query(ProductListQuerySchema);
    const bytes = await catalog().imports.export(actor(ctx), { filters: query.filters, q: query.q, sort: query.sort });
    return { file: { body: bytes, contentType: XLSX, filename: `products-${stamp()}.xlsx` } };
  }),

  importTemplate: authedRoute(FULL, async (ctx) => {
    const bytes = await catalog().imports.template(actor(ctx));
    return { file: { body: bytes, contentType: XLSX, filename: "stockbook-product-import-template.xlsx" } };
  }),

  import: authedRoute(FULL_MULTIPART, async (ctx) => {
    const form = await ctx.form();
    const [file] = await filesFrom(form, ["file"]);
    if (!file) throw new ValidationError("Attach the .xlsx file as 'file'.", [{ path: "file", message: "Choose a file to import." }]);
    const mode = ImportModeSchema.parse(form.get("mode") ?? "validate");
    const jobId = await enqueueImport(actor(ctx), file, mode);
    return { status: 202, data: { jobId, mode, status: "queued" }, headers: { Location: `/api/v1/products/import/${jobId}` } };
  }),

  importStatus: authedRoute<{ jobId: string }>(FULL, async (ctx) => {
    const jobId = uuidParam(ctx.params.jobId, "Import job");
    return { data: await importJobStatus(jobId, ctx.principal.userId) };
  }),
};

export const photoHandlers = {
  upload: authedRoute<IdParams>({ permission: ["catalog", "CREATE"], idempotent: false }, async (ctx) => {
    const productId = id(ctx, "Product");
    const files = await filesFrom(await ctx.form(), ["file", "files"]);
    const photos = await catalog().photos.upload(actor(ctx), productId, files);
    return { status: 201, data: photos.map(toPhotoDto) };
  }),

  update: authedRoute<PhotoParams>(CREATE, async (ctx) => {
    const productId = id(ctx, "Product");
    const photoId = uuidParam(ctx.params.photoId, "Photo");
    const input = await ctx.body(UpdatePhotoSchema);
    return { data: (await catalog().photos.update(actor(ctx), productId, photoId, input)).map(toPhotoDto) };
  }),

  remove: authedRoute<PhotoParams>(CREATE, async (ctx) => {
    await catalog().photos.remove(actor(ctx), id(ctx, "Product"), uuidParam(ctx.params.photoId, "Photo"));
    return { status: 204 };
  }),

  /** Authenticated image proxy: the bucket is never public. */
  file: authedRoute<PhotoParams>(VIEW, async (ctx) => {
    const { variant } = ctx.query(PhotoVariantQuerySchema);
    const f = await catalog().photos.file(id(ctx, "Product"), uuidParam(ctx.params.photoId, "Photo"), variant);
    return { file: { body: f.body, contentType: f.contentType, filename: f.fileName, inline: true, cacheSeconds: 300 } };
  }),
};

export const referenceHandlers = {
  listCatalogs: authedRoute(VIEW, async () => ({ data: (await catalog().references.listCatalogs()).map(toCatalogDto) })),
  createCatalog: authedRoute(FULL, async (ctx) => {
    const c = await catalog().references.createCatalog(actor(ctx), await ctx.body(CreateCatalogSchema));
    return { status: 201, data: toCatalogDto(c) };
  }),
  updateCatalog: authedRoute<IdParams>(FULL, async (ctx) => {
    const catalogId = id(ctx, "Catalog");
    return { data: toCatalogDto(await catalog().references.updateCatalog(actor(ctx), catalogId, await ctx.body(UpdateCatalogSchema))) };
  }),
  deleteCatalog: authedRoute<IdParams>(FULL, async (ctx) => {
    await catalog().references.deleteCatalog(actor(ctx), id(ctx, "Catalog"));
    return { status: 204 };
  }),

  listCategories: authedRoute(VIEW, async () => ({ data: (await catalog().references.listCategories()).map(toCategoryDto) })),
  createCategory: authedRoute(FULL, async (ctx) => {
    const c = await catalog().references.createCategory(actor(ctx), await ctx.body(CreateCategorySchema));
    return { status: 201, data: toCategoryDto(c) };
  }),
  updateCategory: authedRoute<IdParams>(FULL, async (ctx) => {
    const categoryId = id(ctx, "Category");
    return { data: toCategoryDto(await catalog().references.updateCategory(actor(ctx), categoryId, await ctx.body(UpdateCategorySchema))) };
  }),
  deleteCategory: authedRoute<IdParams>(FULL, async (ctx) => {
    await catalog().references.deleteCategory(actor(ctx), id(ctx, "Category"));
    return { status: 204 };
  }),

  listUnits: authedRoute(VIEW, async () => ({ data: (await catalog().references.listUnits()).map(toUnitDto) })),
  createUnit: authedRoute(FULL, async (ctx) => {
    const u = await catalog().references.createUnit(actor(ctx), await ctx.body(CreateUnitSchema));
    return { status: 201, data: toUnitDto(u) };
  }),
  updateUnit: authedRoute<IdParams>(FULL, async (ctx) => {
    const unitId = id(ctx, "Unit");
    return { data: toUnitDto(await catalog().references.updateUnit(actor(ctx), unitId, await ctx.body(UpdateUnitSchema))) };
  }),
};

