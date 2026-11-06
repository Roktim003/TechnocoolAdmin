/**
 * Browser-side form checks. They mirror the server's Zod rules (src/shared/money, module dto.ts)
 * so the user sees every problem at once before anything is sent; the server stays the authority.
 *
 * Pattern (see EntryForm / ProjectForm):
 *   const problems = check(f);                        // Record<field, message>
 *   const errors = { ...serverErrors, ...(attempt ? problems : {}) };
 *   on submit: setAttempt(true); if (Object.keys(problems).length) { scroll to top; return; }
 *   show <FormProblems problems={…} /> at the top, and `error={errors.x}` on each field.
 */

export type Problems = Record<string, string>;

/** What a numeric / phone field lets the user type (see TextField `kind`). */
export type InputKind = "money" | "qty" | "rate" | "integer" | "percent" | "phone";

const DECIMALS: Record<Exclude<InputKind, "phone" | "integer">, number> = { money: 2, qty: 3, rate: 4, percent: 2 };

/**
 * Strips what can't be part of the value while typing: letters in amounts, a second decimal point,
 * too many decimals; anything but digits + - ( ) space in phone numbers.
 */
export function sanitize(kind: InputKind, raw: string): string {
  if (kind === "phone") return raw.replace(/[^\d+\-() ]/g, "").slice(0, 30);
  let s = raw.replace(/,/g, "").replace(kind === "integer" ? /[^\d]/g : /[^\d.]/g, "");
  if (kind === "integer") return s.slice(0, 12);
  const dot = s.indexOf(".");
  if (dot >= 0) {
    const int = s.slice(0, dot);
    const frac = s.slice(dot + 1).replace(/\./g, "").slice(0, DECIMALS[kind]);
    s = `${int}.${frac}`;
  }
  return s;
}

export const INPUT_MODE: Record<InputKind, "decimal" | "numeric" | "tel"> = { money: "decimal", qty: "decimal", rate: "decimal", percent: "decimal", integer: "numeric", phone: "tel" };

// ── Rules: each returns a message, or undefined when the value is fine. Empty optional values pass. ──

const blank = (v: string | null | undefined) => !v || !v.trim();

export const rules = {
  required: (v: string | null | undefined, what = "this") => (blank(v) ? `Enter ${what}.` : undefined),
  chosen: (v: string | null | undefined, what = "an option") => (blank(v) ? `Choose ${what}.` : undefined),
  maxLength: (v: string | null | undefined, max: number) => (v && v.trim().length > max ? `Keep it to ${max} characters or fewer.` : undefined),

  email: (v: string | null | undefined) => (blank(v) ? undefined : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v!.trim()) ? (v!.trim().length > 200 ? "Keep it to 200 characters or fewer." : undefined) : "Enter a valid email, e.g. name@company.com."),

  /** 6–15 digits, optional leading +, separators - ( ) and spaces. */
  phone: (v: string | null | undefined, max = 30) => {
    if (blank(v)) return undefined;
    const s = v!.trim();
    if (s.length > max) return `Keep it to ${max} characters or fewer.`;
    if (!/^\+?[\d\-() ]+$/.test(s)) return "Use digits only (+, -, spaces and brackets are fine).";
    const digits = s.replace(/\D/g, "").length;
    return digits < 6 || digits > 15 ? "Enter a valid phone number, e.g. 01711-000000." : undefined;
  },

  /** ≥ 0, up to 12 digits and 2 decimals (MoneySchema). */
  money: (v: string | null | undefined, opts: { positive?: boolean } = {}) => {
    if (blank(v)) return undefined;
    const s = v!.trim().replace(/,/g, "");
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) return "Enter an amount, e.g. 1500 or 1500.50 (at most 2 decimals).";
    return opts.positive && !/[1-9]/.test(s) ? "Enter an amount greater than 0." : undefined;
  },

  /** ≥ 0, up to 3 decimals (QuantitySchema). */
  qty: (v: string | null | undefined, opts: { positive?: boolean; whole?: boolean } = {}) => {
    if (blank(v)) return undefined;
    const s = v!.trim().replace(/,/g, "");
    if (!/^\d{1,11}(\.\d{1,3})?$/.test(s)) return "Enter a number, e.g. 5 or 2.5 (at most 3 decimals).";
    if (opts.whole && s.includes(".") && /[1-9]/.test(s.split(".")[1]!)) return "Enter a whole number.";
    return opts.positive && !/[1-9]/.test(s) ? "Enter a number greater than 0." : undefined;
  },

  /** Exchange rates / unit costs with up to 4 decimals (Price4Schema: 10 digits before the point). */
  rate: (v: string | null | undefined, opts: { positive?: boolean } = {}) => {
    if (blank(v)) return undefined;
    const s = v!.trim().replace(/,/g, "");
    if (!/^\d{1,10}(\.\d{1,4})?$/.test(s)) return "Enter a number with at most 4 decimals.";
    return opts.positive && !/[1-9]/.test(s) ? "Enter a number greater than 0." : undefined;
  },

  integer: (v: string | null | undefined, opts: { min?: number; max?: number } = {}) => {
    if (blank(v)) return undefined;
    if (!/^\d+$/.test(v!.trim())) return "Enter a whole number.";
    const n = Number(v);
    if (opts.min !== undefined && n < opts.min) return `Enter ${opts.min} or more.`;
    if (opts.max !== undefined && n > opts.max) return `Enter ${opts.max} or less.`;
    return undefined;
  },

  percent: (v: string | null | undefined) => {
    if (blank(v)) return undefined;
    const s = v!.trim();
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(s) || Number(s) > 100) return "Enter a percentage from 0 to 100.";
    return undefined;
  },

  /** "YYYY-MM-DD" (or "YYYY-MM") strings compare correctly as text. */
  notBefore: (later: string | null | undefined, earlier: string | null | undefined, msg = "This date can't be before the start date.") => (later && earlier && later < earlier ? msg : undefined),
  notAfter: (v: string | null | undefined, max: string, msg = "This date can't be in the future.") => (v && v > max ? msg : undefined),
};

/** Builds a Problems object from [field, message | undefined] pairs, keeping the first message per field. */
export function collect(...pairs: [string, string | undefined][]): Problems {
  const out: Problems = {};
  for (const [k, m] of pairs) if (m && !out[k]) out[k] = m;
  return out;
}

/** Scrolls to the top of the page (or the open modal body) so the summary is visible. */
export function revealProblems(container?: HTMLElement | null) {
  if (container) container.scrollTo({ top: 0, behavior: "smooth" });
  else window.scrollTo({ top: 0, behavior: "smooth" });
}
