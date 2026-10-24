import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { z } from "@/shared/validation/zod";
import { listQuerySchema, pageMeta, parseSort, toOrderBy } from "@/shared/pagination/list-query";
import { assertSameOrigin } from "@/shared/auth/csrf";
import { DateRangeFilters } from "@/shared/time/dates";
import { requestHash } from "@/shared/idempotency/idempotency";
import { sanitizeSnapshot } from "@/modules/audit/application/audit.service";

describe("list query parsing", () => {
  const schema = listQuerySchema({ sortFields: ["name", "createdAt"], defaultSort: "name", filters: { status: z.enum(["active", "disabled"]).optional() } });

  it("applies defaults", () => {
    expect(schema.parse({})).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20, sort: [{ field: "name", direction: "asc" }], q: undefined, filters: {} });
  });

  it("parses page, size, multi-field sort, search and filters", () => {
    const q = schema.parse({ page: "3", pageSize: "10", sort: "name,-createdAt", q: " pump ", status: "active" });
    expect(q).toMatchObject({ page: 3, pageSize: 10, skip: 20, take: 10, q: "pump", filters: { status: "active" } });
    expect(q.sort).toEqual([
      { field: "name", direction: "asc" },
      { field: "createdAt", direction: "desc" },
    ]);
  });

  it("caps pageSize at 100 and rejects bad input", () => {
    expect(() => schema.parse({ pageSize: "101" })).toThrow(ZodError);
    expect(() => schema.parse({ page: "0" })).toThrow(ZodError);
    expect(() => schema.parse({ status: "deleted" })).toThrow(ZodError);
    expect(() => parseSort("password", ["name"], "name")).toThrow(/Cannot sort by 'password'/);
  });

  it("builds meta and orderBy", () => {
    expect(pageMeta(41, 2, 20)).toEqual({ page: 2, pageSize: 20, total: 41, totalPages: 3 });
    expect(pageMeta(0, 1, 20).totalPages).toBe(1);
    expect(toOrderBy([{ field: "name", direction: "desc" }])).toEqual([{ name: "desc" }]);
  });
});

describe("CSRF origin check", () => {
  const h = (init: Record<string, string>) => new Headers(init);

  it("allows safe methods without any Origin", () => {
    expect(() => assertSameOrigin("GET", h({}))).not.toThrow();
  });

  it("allows the app origin and the request's own host", () => {
    expect(() => assertSameOrigin("POST", h({ origin: "http://localhost:3000" }))).not.toThrow();
    expect(() => assertSameOrigin("PATCH", h({ referer: "http://localhost:3000/users" }))).not.toThrow();
  });

  it("rejects foreign or missing origins on mutations", () => {
    expect(() => assertSameOrigin("POST", h({ origin: "https://evil.example.com" }))).toThrow(expect.objectContaining({ code: "CSRF_REJECTED" }));
    expect(() => assertSameOrigin("DELETE", h({}))).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => assertSameOrigin("POST", h({ origin: "http://localhost:3000.evil.com" }))).toThrow();
  });
});

describe("date range filters (Asia/Dhaka)", () => {
  const schema = z.object(DateRangeFilters);

  it("expands bare dates to the whole Dhaka day", () => {
    const { from, to } = schema.parse({ from: "2026-10-24", to: "2026-10-24" });
    expect(from!.toISOString()).toBe("2026-10-23T18:00:00.000Z");
    expect(to!.toISOString()).toBe("2026-10-24T17:59:59.999Z");
  });

  it("accepts full ISO timestamps and blanks", () => {
    expect(schema.parse({ from: "2026-10-24T10:00:00Z" }).from!.toISOString()).toBe("2026-10-24T10:00:00.000Z");
    expect(schema.parse({ from: "" })).toEqual({});
    expect(() => schema.parse({ from: "yesterday" })).toThrow(ZodError);
  });
});

describe("idempotency request hash", () => {
  it("differs by method, path and body", () => {
    const base = requestHash("POST", "/a", "{}");
    expect(requestHash("post", "/a", "{}")).toBe(base);
    expect(requestHash("POST", "/b", "{}")).not.toBe(base);
    expect(requestHash("POST", "/a", '{"x":1}')).not.toBe(base);
  });
});

describe("audit snapshots", () => {
  it("strip secrets and serialise dates", () => {
    expect(sanitizeSnapshot({ name: "a", passwordHash: "$2a$...", nested: { refreshToken: "x", at: new Date("2026-01-01T00:00:00Z") } })).toEqual({
      name: "a",
      nested: { at: "2026-01-01T00:00:00.000Z" },
    });
    expect(sanitizeSnapshot(undefined)).toBeNull();
  });
});
