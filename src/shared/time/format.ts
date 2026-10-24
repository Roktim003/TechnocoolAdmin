import { APP_TIMEZONE } from "@/shared/config/constants";

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIMEZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "24 Oct 2026, 14:05" in Asia/Dhaka. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return dateTimeFormat.format(typeof value === "string" ? new Date(value) : value);
}

const bdt = new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 });

/** Currency formatting for later modules (৳ BDT). */
export function formatBDT(amount: number): string {
  return bdt.format(amount);
}

const bdtFormat = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * "৳ 1,20,000.00" from a decimal string such as "120000.00". Intl formats numeric strings
 * exactly (no float rounding); Bangladesh uses lakh grouping like en-IN.
 */
export function formatMoney(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return `৳ ${bdtFormat.format(value as unknown as number)}`;
}
