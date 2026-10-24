import { describe, expect, it } from "vitest";
import { describeSchedule, dhakaDayBound, nextRunAt, resolveDate } from "@/modules/reporting/domain/schedule";
import { summarizeChanges } from "@/modules/reporting/domain/changes";
import { chartVisible, intersectFlags, stripRow, visibleColumns } from "@/modules/reporting/domain/visibility";
import { formatBdt, formatCell } from "@/modules/reporting/domain/format";
import { covers } from "@/modules/reporting/application/schedule.service";
import type { ColumnDef } from "@/modules/reporting/domain/types";

/** Dhaka wall-clock time → UTC instant (UTC+6, no DST). */
const dhaka = (s: string) => new Date(`${s}+06:00`);
const iso = (d: Date) => new Date(d.getTime() + 6 * 3600_000).toISOString().slice(0, 16).replace("T", " ");

describe("nextRunAt (Asia/Dhaka)", () => {
  it("daily: later today, else tomorrow; strictly after", () => {
    const t = { frequency: "DAILY" as const, time: "09:00" };
    expect(iso(nextRunAt(t, dhaka("2026-10-24T08:59:00")))).toBe("2026-10-24 09:00");
    expect(iso(nextRunAt(t, dhaka("2026-10-24T09:00:00")))).toBe("2026-10-25 09:00");
    expect(iso(nextRunAt(t, dhaka("2026-12-31T23:30:00")))).toBe("2027-01-01 09:00");
    expect(nextRunAt(t, dhaka("2026-10-24T08:00:00")).toISOString()).toBe("2026-10-24T03:00:00.000Z");
  });

  it("near midnight the Dhaka date is used, not the UTC one", () => {
    // 2026-10-24 23:30 UTC is already 25 Oct 05:30 in Dhaka.
    expect(iso(nextRunAt({ frequency: "DAILY", time: "06:00" }, new Date("2026-10-24T23:30:00Z")))).toBe("2026-10-25 06:00");
  });

  it("weekly on a weekday", () => {
    const sunday = { frequency: "WEEKLY" as const, dayOfWeek: 0, time: "09:00" };
    expect(iso(nextRunAt(sunday, dhaka("2026-10-24T12:00:00")))).toBe("2026-10-25 09:00"); // Saturday → Sunday
    expect(iso(nextRunAt(sunday, dhaka("2026-10-25T09:00:00")))).toBe("2026-11-01 09:00");
    expect(iso(nextRunAt({ ...sunday, dayOfWeek: 6 }, dhaka("2026-10-24T08:00:00")))).toBe("2026-10-24 09:00");
  });

  it("monthly on a day; 31 = the last day of every month", () => {
    const m15 = { frequency: "MONTHLY" as const, dayOfMonth: 15, time: "18:30" };
    expect(iso(nextRunAt(m15, dhaka("2026-10-24T00:00:00")))).toBe("2026-11-15 18:30");
    const last = { frequency: "MONTHLY" as const, dayOfMonth: 31, time: "09:00" };
    expect(iso(nextRunAt(last, dhaka("2026-10-24T00:00:00")))).toBe("2026-10-31 09:00");
    expect(iso(nextRunAt(last, dhaka("2026-10-31T09:00:00")))).toBe("2026-11-30 09:00");
    expect(iso(nextRunAt(last, dhaka("2027-02-01T00:00:00")))).toBe("2027-02-28 09:00");
    expect(iso(nextRunAt(last, dhaka("2028-02-01T00:00:00")))).toBe("2028-02-29 09:00"); // leap year
    expect(iso(nextRunAt({ ...last, dayOfMonth: 30 }, dhaka("2027-02-01T00:00:00")))).toBe("2027-02-28 09:00");
  });

  it("describes schedules for people", () => {
    expect(describeSchedule({ frequency: "DAILY", time: "09:00" })).toBe("Daily · 9:00 AM");
    expect(describeSchedule({ frequency: "WEEKLY", dayOfWeek: 0, time: "09:00" })).toBe("Weekly · Sunday 9:00 AM");
    expect(describeSchedule({ frequency: "MONTHLY", dayOfMonth: 1, time: "18:00" })).toBe("Monthly · 1st 6:00 PM");
    expect(describeSchedule({ frequency: "MONTHLY", dayOfMonth: 31, time: "00:15" })).toBe("Monthly · last day 12:15 AM");
  });
});

describe("relative dates", () => {
  const now = dhaka("2026-10-24T10:00:00"); // a Saturday
  it("resolves tokens in Dhaka", () => {
    expect(resolveDate("today", now)).toBe("2026-10-24");
    expect(resolveDate("monthStart", now)).toBe("2026-10-01");
    expect(resolveDate("lastMonthStart", now)).toBe("2026-09-01");
    expect(resolveDate("lastMonthEnd", now)).toBe("2026-09-30");
    expect(resolveDate("weekStart", now)).toBe("2026-10-18");
    expect(resolveDate("-7d", now)).toBe("2026-10-17");
    expect(resolveDate("2026-13-01", now)).toBeNull();
    expect(resolveDate("soon", now)).toBeNull();
    expect(resolveDate("lastMonthStart", dhaka("2026-01-05T10:00:00"))).toBe("2025-12-01");
  });
  it("day bounds are Dhaka midnight", () => {
    expect(dhakaDayBound("2026-10-24", "start").toISOString()).toBe("2026-10-23T18:00:00.000Z");
    expect(dhakaDayBound("2026-10-24", "end").toISOString()).toBe("2026-10-24T17:59:59.999Z");
  });
});

describe("visibility", () => {
  const cols: ColumnDef[] = [
    { key: "name", label: "Name", type: "text", align: "start", requires: "none", link: true },
    { key: "cost", label: "Cost", type: "money", align: "end", requires: "seeCost" },
    { key: "profit", label: "Profit", type: "money", align: "end", requires: "seeProfit" },
    { key: "margin", label: "Margin", type: "money", align: "end", requires: "seeMargin" },
  ];
  const accounts = { seeCost: true, seeProfit: true, seeMargin: false };
  it("columns by flag; rows keep only visible keys", () => {
    expect(visibleColumns(cols, accounts).map((c) => c.key)).toEqual(["name", "cost", "profit"]);
    const row = stripRow({ name: "X", cost: "1", profit: "2", margin: "3", secret: "s", _links: { name: "/x", margin: "/m" } }, visibleColumns(cols, accounts));
    expect(row).toEqual({ name: "X", cost: "1", profit: "2", _links: { name: "/x" } });
  });
  it("charts need their flag; audiences intersect", () => {
    const chart = { type: "bar" as const, title: "T", valueType: "money" as const, requires: "seeMargin" as const, points: [] };
    expect(chartVisible(chart, accounts)).toBeNull();
    expect(chartVisible({ ...chart, requires: "seeProfit" }, accounts)).not.toBeNull();
    expect(intersectFlags(accounts, { seeCost: false, seeProfit: true, seeMargin: true })).toEqual({ seeCost: false, seeProfit: true, seeMargin: false });
  });
  it("a file is downloadable only by someone who sees at least its audience", () => {
    const v = { userId: "u", name: "U", isAdmin: false, permissions: {} as never, flags: accounts, warehouseIds: ["a", "b"] };
    expect(covers(v, { flags: { seeCost: true, seeProfit: false, seeMargin: false }, warehouseIds: ["a"] })).toBe(true);
    expect(covers(v, { flags: { seeCost: true, seeProfit: true, seeMargin: true }, warehouseIds: ["a"] })).toBe(false);
    expect(covers(v, { flags: { seeCost: false, seeProfit: false, seeMargin: false }, warehouseIds: ["a", "c"] })).toBe(false);
  });
  it("audit change summaries never show hidden fields", () => {
    const s = summarizeChanges({ status: "DRAFT", unitCostBdt: "100" }, { status: "POSTED", unitCostBdt: "120" }, new Set(["unitCostBdt"]));
    expect(s).toContain("status");
    expect(s).not.toContain("unitCostBdt");
    expect(s).not.toContain("120");
  });
});

describe("formatting", () => {
  it("BDT with thousand separators", () => {
    expect(formatBdt("1234567.5")).toBe("৳ 12,34,567.50");
    expect(formatCell({ key: "q", label: "Q", type: "number", align: "end", requires: "none", decimals: 3 }, "12.500")).toBe("12.5");
    expect(formatCell({ key: "d", label: "D", type: "date", align: "start", requires: "none", withTime: true }, "2026-10-24T03:05:00.000Z")).toBe("24 Oct 2026, 09:05");
  });
});
