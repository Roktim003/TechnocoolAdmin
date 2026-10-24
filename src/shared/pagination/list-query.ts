import { z } from "@/shared/validation/zod";

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export interface SortField {
  field: string;
  direction: "asc" | "desc";
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListQuery<F> {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  sort: SortField[];
  q?: string;
  filters: F;
}

/** Parses "name,-createdAt" into sort fields, rejecting fields not in `allowed`. */
export function parseSort(raw: string | undefined, allowed: readonly string[], fallback: string): SortField[] {
  const spec = raw?.trim() ? raw : fallback;
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const direction = s.startsWith("-") ? "desc" : "asc";
      const field = s.replace(/^[-+]/, "");
      if (!allowed.includes(field)) {
        throw new z.ZodError([{ code: "custom", path: ["sort"], message: `Cannot sort by '${field}'. Allowed: ${allowed.join(", ")}.` }]);
      }
      return { field, direction } as SortField;
    });
}

/**
 * Builds a Zod schema for list endpoints: `page`, `pageSize` (≤ 100), `sort`, `q` and the
 * module-specific `filters`. The same schema documents the query string in OpenAPI.
 */
export function listQuerySchema<S extends z.ZodRawShape>(opts: { sortFields: readonly string[]; defaultSort: string; filters: S }) {
  return z
    .object({
      page: z.coerce.number().int().min(1).default(1).openapi({ description: "1-based page number", example: 1 }),
      pageSize: z.coerce
        .number()
        .int()
        .min(1)
        .max(MAX_PAGE_SIZE)
        .default(DEFAULT_PAGE_SIZE)
        .openapi({ description: `Items per page (max ${MAX_PAGE_SIZE})`, example: DEFAULT_PAGE_SIZE }),
      sort: z
        .string()
        .optional()
        .openapi({ description: `Comma-separated fields, '-' prefix for descending. Allowed: ${opts.sortFields.join(", ")}`, example: opts.defaultSort }),
      q: z.string().trim().max(200).optional().openapi({ description: "Free-text search" }),
      ...opts.filters,
    })
    .transform((v) => {
      const { page, pageSize, sort, q, ...filters } = v as { page: number; pageSize: number; sort?: string; q?: string } & Record<string, unknown>;
      const result: ListQuery<z.infer<z.ZodObject<S>>> = {
        page,
        pageSize,
        skip: (page - 1) * pageSize,
        take: pageSize,
        sort: parseSort(sort, opts.sortFields, opts.defaultSort),
        q: q || undefined,
        filters: filters as z.infer<z.ZodObject<S>>,
      };
      return result;
    });
}

export function pageMeta(total: number, page: number, pageSize: number): PageMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Converts parsed sort fields to a Prisma `orderBy` array, mapping API field names to columns. */
export function toOrderBy(sort: SortField[], map: Record<string, (dir: "asc" | "desc") => Record<string, unknown>> = {}) {
  return sort.map((s) => (map[s.field] ? map[s.field]!(s.direction) : { [s.field]: s.direction }));
}

export const PageMetaSchema = z
  .object({ page: z.number().int(), pageSize: z.number().int(), total: z.number().int(), totalPages: z.number().int() })
  .openapi("PageMeta");
