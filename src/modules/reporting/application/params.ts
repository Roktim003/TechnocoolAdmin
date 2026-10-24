import { ValidationError, type ErrorDetail } from "@/shared/errors/app-error";
import { formatDateTime } from "@/shared/time/format";
import { DATE_TOKENS, dhakaDayBound, isDateToken, resolveDate } from "../domain/schedule";
import type { ParamDef } from "../domain/types";
import type { FilterLine, Lookups, ParsedParams, WarehouseRef } from "./ports";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRUE = new Set(["true", "1", "yes", "on"]);
const FALSE = new Set(["false", "0", "no", "off"]);

/** Keeps only the keys a report declares, as trimmed non-empty strings (what URLs and schedules store). */
export function cleanParams(defs: ParamDef[], raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of defs) {
    const v = raw[p.key];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) out[p.key] = s.slice(0, 200);
  }
  return out;
}

/**
 * Validates a report's filters. Dates accept YYYY-MM-DD or a relative token ("monthStart",
 * "-7d", …) and become Asia/Dhaka day bounds; ids must be uuids; selects must be listed options.
 */
export function parseParams(defs: ParamDef[], raw: Record<string, string>, now: Date): ParsedParams {
  const out: ParsedParams = {};
  const errors: ErrorDetail[] = [];
  for (const p of defs) {
    const v = raw[p.key];
    if (v === undefined || v === "") continue;
    switch (p.kind) {
      case "dateFrom":
      case "dateTo":
      case "date": {
        const date = resolveDate(v, now);
        if (!date) {
          errors.push({ path: p.key, message: `Expected a date (YYYY-MM-DD) or one of: ${Object.keys(DATE_TOKENS).join(", ")}.` });
          break;
        }
        out[p.key] = p.kind === "date" ? date : dhakaDayBound(date, p.kind === "dateFrom" ? "start" : "end");
        break;
      }
      case "boolean":
        if (TRUE.has(v.toLowerCase())) out[p.key] = true;
        else if (FALSE.has(v.toLowerCase())) out[p.key] = false;
        else errors.push({ path: p.key, message: "Expected true or false." });
        break;
      case "select":
        if (p.options?.some((o) => o.value === v)) out[p.key] = v;
        else errors.push({ path: p.key, message: `Expected one of: ${(p.options ?? []).map((o) => o.value).join(", ")}.` });
        break;
      case "text":
        out[p.key] = v.slice(0, 100);
        break;
      default:
        if (UUID.test(v)) out[p.key] = v.toLowerCase();
        else errors.push({ path: p.key, message: "Expected a valid id." });
    }
  }
  const from = defs.find((d) => d.kind === "dateFrom");
  const to = defs.find((d) => d.kind === "dateTo");
  if (from && to && out[from.key] instanceof Date && out[to.key] instanceof Date && (out[from.key] as Date) > (out[to.key] as Date)) {
    errors.push({ path: to.key, message: "The end date is before the start date." });
  }
  if (errors.length) throw new ValidationError("The report filters are invalid.", errors);
  return out;
}

const LOOKUP_KIND = { catalog: "catalog", category: "category", product: "product", project: "project", supplier: "supplier", customer: "customer", user: "user" } as const;

/** "From: 01 Oct 2026", "Warehouse: Warehouse A"… for file headers and emails (relative dates shown with their value). */
export async function filterLines(defs: ParamDef[], raw: Record<string, string>, parsed: ParsedParams, warehouses: WarehouseRef[], lookups: Lookups): Promise<FilterLine[]> {
  const lines: FilterLine[] = [];
  for (const p of defs) {
    const v = parsed[p.key];
    if (v === undefined) continue;
    let value: string;
    if (v instanceof Date) {
      const day = formatDateTime(v).split(",")[0]!;
      const token = raw[p.key]!;
      value = isDateToken(token) ? `${day} (${DATE_TOKENS[token].toLowerCase()})` : day;
    } else if (p.kind === "date") {
      value = String(v);
    } else if (typeof v === "boolean") {
      value = v ? "Yes" : "No";
    } else if (p.kind === "select") {
      value = p.options?.find((o) => o.value === v)?.label ?? String(v);
    } else if (p.kind === "warehouse") {
      value = warehouses.find((w) => w.id === v)?.name ?? "Unknown warehouse";
    } else if (p.kind in LOOKUP_KIND) {
      value = (await lookups.names(LOOKUP_KIND[p.kind as keyof typeof LOOKUP_KIND], String(v))) ?? "Unknown";
    } else {
      value = `“${String(v)}”`;
    }
    lines.push({ label: p.label, value });
  }
  return lines;
}
