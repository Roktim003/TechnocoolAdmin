/**
 * Asia/Dhaka calendar maths for reports and schedules. Dhaka is UTC+06:00 all year (no DST),
 * so local time = UTC + 6 h exactly.
 */

const OFFSET_MS = 6 * 3600_000;
const DAY_MS = 24 * 3600_000;

export const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export interface ScheduleTiming {
  frequency: Frequency;
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek?: number | null;
  /** 1–31; anything past the month's last day (e.g. 31) means the last day. */
  dayOfMonth?: number | null;
  /** HH:mm, Asia/Dhaka. */
  time: string;
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const pad = (n: number) => String(n).padStart(2, "0");
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** "YYYY-MM-DD" of `at` in Asia/Dhaka. */
export function dhakaDate(at: Date = new Date()): string {
  return new Date(at.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** Adds days to a "YYYY-MM-DD" date. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both "YYYY-MM-DD"). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Start (00:00) or end (23:59:59.999) of a Dhaka calendar day as a UTC instant. */
export function dhakaDayBound(date: string, bound: "start" | "end"): Date {
  const start = Date.parse(`${date}T00:00:00Z`) - OFFSET_MS;
  return new Date(bound === "start" ? start : start + DAY_MS - 1);
}

/** Relative dates allowed in report filters (resolved at run time, so a schedule always covers a fresh period). */
export const DATE_TOKENS = {
  today: "Today",
  yesterday: "Yesterday",
  "-7d": "7 days ago",
  "-30d": "30 days ago",
  "-90d": "90 days ago",
  weekStart: "Start of this week (Sunday)",
  lastWeekStart: "Start of last week",
  lastWeekEnd: "End of last week",
  monthStart: "Start of this month",
  lastMonthStart: "Start of last month",
  lastMonthEnd: "End of last month",
  yearStart: "Start of this year",
} as const;
export type DateToken = keyof typeof DATE_TOKENS;

export const isDateToken = (v: string): v is DateToken => Object.prototype.hasOwnProperty.call(DATE_TOKENS, v);

/** Resolves a relative date token (or passes a YYYY-MM-DD date through). Returns null for anything else. */
export function resolveDate(value: string, now: Date = new Date()): string | null {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? null : v;
  if (!isDateToken(v)) return null;
  const today = dhakaDate(now);
  const [y, m] = today.split("-").map(Number) as [number, number];
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  switch (v) {
    case "today":
      return today;
    case "yesterday":
      return addDays(today, -1);
    case "-7d":
      return addDays(today, -7);
    case "-30d":
      return addDays(today, -30);
    case "-90d":
      return addDays(today, -90);
    case "weekStart":
      return addDays(today, -dow);
    case "lastWeekStart":
      return addDays(today, -dow - 7);
    case "lastWeekEnd":
      return addDays(today, -dow - 1);
    case "monthStart":
      return `${y}-${pad(m)}-01`;
    case "lastMonthStart":
      return m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01`;
    case "lastMonthEnd":
      return addDays(`${y}-${pad(m)}-01`, -1);
    case "yearStart":
      return `${y}-01-01`;
  }
}

/** True when the Dhaka-local calendar day matches the schedule's day rule. */
function dayMatches(t: ScheduleTiming, y: number, m: number, d: number, dow: number): boolean {
  if (t.frequency === "DAILY") return true;
  if (t.frequency === "WEEKLY") return dow === t.dayOfWeek;
  return d === Math.min(t.dayOfMonth ?? 1, lastDayOf(y, m));
}

/**
 * The first run strictly after `after`: the schedule's time on the next matching day in
 * Asia/Dhaka. Monthly on the 29th–31st falls back to the last day in shorter months.
 */
export function nextRunAt(t: ScheduleTiming, after: Date = new Date()): Date {
  const [hh, mm] = t.time.split(":").map(Number) as [number, number];
  const local = new Date(after.getTime() + OFFSET_MS);
  for (let i = 0; i < 400; i++) {
    const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + i));
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth();
    const d = day.getUTCDate();
    if (!dayMatches(t, y, m, d, day.getUTCDay())) continue;
    const at = new Date(Date.UTC(y, m, d, hh, mm) - OFFSET_MS);
    if (at.getTime() > after.getTime()) return at;
  }
  throw new Error("No next run within 400 days.");
}

/** "9:00 AM" from "09:00". */
export function formatTime12(time: string): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** "Daily · 9:00 AM", "Weekly · Sunday 9:00 AM", "Monthly · 15th 9:00 AM", "Monthly · last day 6:00 PM". */
export function describeSchedule(t: ScheduleTiming): string {
  const time = formatTime12(t.time);
  if (t.frequency === "DAILY") return `Daily · ${time}`;
  if (t.frequency === "WEEKLY") return `Weekly · ${WEEKDAYS[t.dayOfWeek ?? 0]} ${time}`;
  return `Monthly · ${t.dayOfMonth === 31 ? "last day" : ordinal(t.dayOfMonth ?? 1)} ${time}`;
}
