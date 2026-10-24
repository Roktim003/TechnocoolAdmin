/**
 * Fiscal year label for a date. With the default start month 7 (July), 2026-07-01 … 2027-06-30
 * is "2627".
 */
export function fiscalYear(date: Date, startMonth = 7): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const start = m >= startMonth ? y : y - 1;
  const two = (n: number) => String(n % 100).padStart(2, "0");
  return startMonth === 1 ? String(start) : `${two(start)}${two(start + 1)}`;
}

/** GRN-I-2627-0001 */
export function formatDocNumber(prefix: string, fy: string, n: number): string {
  return `${prefix}-${fy}-${String(n).padStart(4, "0")}`;
}

/** PRJ-001 */
export function formatProjectCode(n: number): string {
  return `PRJ-${String(n).padStart(3, "0")}`;
}

/** Today's date (YYYY-MM-DD) in Asia/Dhaka. */
export function todayInDhaka(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(now);
}
