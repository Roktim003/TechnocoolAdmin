import { z } from "@/shared/validation/zod";

/**
 * Money is handled as normalised decimal strings ("85000.00") in the application layer and
 * as Prisma Decimal in the database — never as JS floats. All amounts are BDT.
 */
export type Money = string;

const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

/** "85000" → "85000.00", "12.5" → "12.50". Input must already match MONEY_PATTERN. */
export function normalizeMoney(value: string): Money {
  const [int, frac = ""] = value.split(".");
  return `${BigInt(int!).toString()}.${frac.padEnd(2, "0")}`;
}

/** Accepts a non-negative amount as a string or number with up to 2 decimals (max 12 integer digits). */
export const MoneySchema = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : v.trim().replace(/,/g, "");
    if (!MONEY_PATTERN.test(s)) {
      ctx.addIssue({ code: "custom", message: "Enter an amount ≥ 0 with at most 2 decimals." });
      return z.NEVER;
    }
    return normalizeMoney(s);
  })
  .openapi({ type: "string", example: "85000.00", description: "BDT, decimal string with up to 2 decimals" });

/** Same rules for quantities (e.g. min stock level, conversion factor) with up to 3 decimals. */
const QTY_PATTERN = /^\d{1,11}(\.\d{1,3})?$/;

export const QuantitySchema = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : v.trim().replace(/,/g, "");
    if (!QTY_PATTERN.test(s)) {
      ctx.addIssue({ code: "custom", message: "Enter a number ≥ 0 with at most 3 decimals." });
      return z.NEVER;
    }
    const [int, frac = ""] = s.split(".");
    return frac ? `${BigInt(int!).toString()}.${frac}` : BigInt(int!).toString();
  })
  .openapi({ type: "string", example: "50", description: "Decimal string with up to 3 decimals" });
