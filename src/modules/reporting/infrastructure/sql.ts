import { Prisma } from "@prisma/client";
import { prisma, type Db } from "@/shared/db/prisma";
import type { SortField } from "@/shared/pagination/list-query";
import { ReportErrors } from "../domain/errors";

/**
 * Report queries run in a READ ONLY transaction with a statement timeout: reporting can't change
 * business data even by mistake, and a runaway query is cancelled with a clear error.
 */

const DEFAULT_TIMEOUT_MS = Number(process.env.REPORT_QUERY_TIMEOUT_MS ?? 30_000);
let timeoutMs = DEFAULT_TIMEOUT_MS;
/** Tests shorten the timeout to prove the error path (null restores the default). */
export function setQueryTimeoutMs(ms: number | null) {
  timeoutMs = ms ?? DEFAULT_TIMEOUT_MS;
}

const isTimeout = (err: unknown) => {
  const e = err as { code?: string; meta?: { code?: string; message?: string }; message?: string };
  return e?.meta?.code === "57014" || /statement timeout|canceling statement/i.test(`${e?.meta?.message ?? ""} ${e?.message ?? ""}`);
};

export async function readOnly<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${Math.max(1, Math.floor(timeoutMs))}`);
        return fn(tx);
      },
      { timeout: timeoutMs + 5_000, maxWait: 10_000, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  } catch (err) {
    if (isTimeout(err)) throw ReportErrors.timeout(Math.round(timeoutMs / 1000));
    throw err;
  }
}

export const sql = Prisma.sql;
export const join = Prisma.join;
export const raw = Prisma.raw;
export const empty = Prisma.empty;
export type Sql = Prisma.Sql;

/** A uuid[] parameter, for `= ANY(...)` (an empty array matches nothing). */
export const uuidArray = (ids: string[]) => sql`${ids}::uuid[]`;

/** ILIKE pattern with %, _ and \ escaped. */
export const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** AND of the non-empty conditions (TRUE when there are none). */
export function where(conds: (Sql | null | undefined | false)[]): Sql {
  const list = conds.filter((c): c is Sql => !!c);
  return list.length ? join(list, " AND ") : sql`TRUE`;
}

/** ORDER BY from parsed sort fields, mapped to SQL expressions, with a stable tiebreak. */
export function orderBy(sort: SortField[], map: Record<string, Sql>, tiebreak: Sql): Sql {
  const parts = sort.filter((s) => map[s.field]).map((s) => (s.direction === "desc" ? sql`${map[s.field]!} DESC NULLS LAST` : sql`${map[s.field]!} ASC NULLS LAST`));
  return join([...parts, tiebreak], ", ");
}

type DecimalLike = Prisma.Decimal | string | number | bigint | null | undefined;

/** Decimal → fixed string ("1234.50"); null stays null. */
export function fixed(v: DecimalLike, places: number): string | null {
  if (v === null || v === undefined) return null;
  return new Prisma.Decimal(typeof v === "bigint" ? v.toString() : v).toFixed(places);
}
export const money = (v: DecimalLike) => fixed(v, 2);
export const qty = (v: DecimalLike) => fixed(v, 3);
export const zeroMoney = (v: DecimalLike) => fixed(v ?? 0, 2)!;
export const zeroQty = (v: DecimalLike) => fixed(v ?? 0, 3)!;
export const int = (v: DecimalLike) => (v === null || v === undefined ? 0 : Number(v));

/** "YYYY-MM-DD" of a Date column (Postgres DATE values arrive as UTC midnight). */
export const isoDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** The Asia/Dhaka calendar date of a timestamp column. */
export const dhakaDay = (col: Sql) => sql`(${col} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Dhaka')::date`;
