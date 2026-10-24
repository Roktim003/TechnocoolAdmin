import { z, emptyToUndefined } from "@/shared/validation/zod";

/** Asia/Dhaka is UTC+06:00 all year (no DST). */
const DHAKA_OFFSET = "+06:00";
const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseBound(raw: string, bound: "start" | "end"): Date {
  const iso = BARE_DATE.test(raw) ? `${raw}T${bound === "start" ? "00:00:00.000" : "23:59:59.999"}${DHAKA_OFFSET}` : raw;
  return new Date(iso);
}

const dateBound = (bound: "start" | "end") =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      const d = parseBound(v, bound);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: "custom", message: "Expected an ISO date (YYYY-MM-DD) or date-time." });
        return z.NEVER;
      }
      return d;
    });

/** Query filters `from` / `to`. A bare date means the whole day in Asia/Dhaka. */
export const DateRangeFilters = {
  from: emptyToUndefined(dateBound("start")).openapi({ description: "Inclusive start: YYYY-MM-DD (start of day, Asia/Dhaka) or ISO date-time", example: "2026-10-01" }),
  to: emptyToUndefined(dateBound("end")).openapi({ description: "Inclusive end: YYYY-MM-DD (end of day, Asia/Dhaka) or ISO date-time", example: "2026-10-31" }),
};

export function dateRangeWhere(from?: Date, to?: Date): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
}
