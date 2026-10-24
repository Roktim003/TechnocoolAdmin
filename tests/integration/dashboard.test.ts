import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as dashRoute from "@/app/api/v1/dashboard/route";
import { call } from "../helpers/http";
import { resetDatabase } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";
import { createEntry, grn, post, prisma, product, project, userToken, wh } from "../helpers/inventory";
import { customUser } from "../helpers/purchasing";

let token: string;
let A: string;
let productId: string;
const tokens: Record<string, string> = {};

const dashboard = async (t = token) => {
  const r = await call(dashRoute.GET, "GET", "/dashboard", { token: t });
  if (r.status !== 200) throw new Error(`dashboard ${r.status} ${JSON.stringify(r.body)}`);
  return r.body as { data: any[]; cached: boolean; generatedAt: string };
};
const ids = (d: { data: any[] }) => d.data.map((w) => w.id);
const widget = (d: { data: any[] }, id: string) => d.data.find((w) => w.id === id);

beforeAll(async () => {
  await resetDatabase();
  token = await adminToken();
  A = await wh("A");
  for (const role of ["Accounts", "Manager", "Store Manager"]) tokens[role] = (await userToken(token, role)).token;
  const p = await product(token, { minStockLevel: "20" });
  productId = p.id;
  await grn(token, A, [{ productId: p.id, qty: 10, unitPrice: 1000 }]);
  await post(token, { type: "ISSUE_TO_PROJECT", warehouseId: A, projectId: await project(), lines: [{ productId: p.id, qty: 2 }] });
  // Waiting for approval: a Store Manager's submitted entry.
  const pending = await createEntry(tokens["Store Manager"]!, { action: "submit", type: "DAMAGE_WRITE_OFF", warehouseId: A, reason: "Cracked", lines: [{ productId: p.id, qty: 1 }] });
  if (pending.status !== 201) throw new Error(`pending ${pending.status} ${JSON.stringify(pending.body)}`);
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("widgets per role", () => {
  it("Admin: every widget, each with a link", async () => {
    const d = await dashboard();
    expect(ids(d)).toEqual(expect.arrayContaining(["stock-value", "low-stock", "my-approvals", "open-pos", "overdue-pos", "running-projects", "transfers", "by-brand", "in-out", "top-issued", "project-cost", "low-stock-list", "my-approvals-list", "recent-activity"]));
    expect(widget(d, "stock-value")).toMatchObject({ value: "8000.00", valueType: "money", link: "/reports?r=stock-summary" });
    expect(widget(d, "low-stock").value).toBe(1);
    expect(widget(d, "my-approvals").value).toBe(1);
    expect(widget(d, "by-brand").chart.valueType).toBe("money");
    expect(widget(d, "top-issued").chart.points[0].values[0]).toBe("2.000");
    expect(widget(d, "low-stock-list").rows[0].link).toBe(`/stock/products/${productId}`);
    for (const w of d.data) if (w.kind !== "list") expect(w.link, w.id).toBeTruthy();
    // KPI row first, then charts, then lists.
    const kinds = d.data.map((w) => w.kind);
    expect(kinds.indexOf("chart")).toBeGreaterThan(kinds.lastIndexOf("kpi"));
    expect(kinds.indexOf("list")).toBeGreaterThan(kinds.lastIndexOf("chart"));
  });

  it("Accounts: money, but no project cost vs contract (seeMargin)", async () => {
    const d = await dashboard(tokens.Accounts);
    expect(ids(d)).toContain("stock-value");
    expect(ids(d)).not.toContain("project-cost");
    expect(ids(d)).toContain("my-approvals"); // inventory APPROVE
  });

  it("Manager: no Reports access, so tiles link to the module screens", async () => {
    const d = await dashboard(tokens.Manager);
    expect(widget(d, "stock-value").link).toBe("/stock?tab=levels");
    expect(widget(d, "low-stock").link).toBe("/stock/low-stock");
    expect(ids(d)).not.toContain("project-cost");
    expect(JSON.stringify(d)).not.toContain("/reports");
  });

  it("Store Manager: no money anywhere, no purchasing or project widgets", async () => {
    const d = await dashboard(tokens["Store Manager"]);
    expect(ids(d)).not.toContain("stock-value");
    expect(ids(d)).not.toContain("open-pos");
    expect(ids(d)).not.toContain("running-projects");
    expect(ids(d)).not.toContain("project-cost");
    expect(ids(d)).not.toContain("my-approvals");
    expect(ids(d)).toContain("my-entries");
    expect(widget(d, "by-brand").chart).toMatchObject({ valueType: "number", title: "Stock quantity by brand" });
    for (const w of d.data) {
      expect(w.valueType ?? "number", w.id).not.toBe("money");
      expect(w.chart?.valueType ?? "number", w.id).not.toBe("money");
    }
    expect(JSON.stringify(d)).not.toMatch(/7000|8000|1000\.00/);
  });

  it("users without dashboard access get 403", async () => {
    const u = await customUser(token, { reports: "VIEW" });
    expect((await call(dashRoute.GET, "GET", "/dashboard", { token: u.token })).status).toBe(403);
  });

  it("warehouse scope applies to the dashboard too", async () => {
    const u = await customUser(token, { dashboard: "VIEW", inventory: "VIEW" }, { seeCost: true }, ["B"]);
    const d = await dashboard(u.token);
    expect(widget(d, "stock-value").value).toBe("0.00");
    expect(widget(d, "recent-activity").rows).toHaveLength(0);
  });
});

describe("cache", () => {
  it("is shared for 60 s per role + flags + scope and cleared after a posting", async () => {
    await dashboard(); // warm
    const warm = await dashboard();
    expect(warm.cached).toBe(true);
    await grn(token, A, [{ productId, qty: 1, unitPrice: 1000 }]);
    const fresh = await dashboard();
    expect(fresh.cached).toBe(false);
    expect(widget(fresh, "stock-value").value).toBe("9000.00");
  });

  it("personal widgets are never shared between users of the same role", async () => {
    const m2 = (await userToken(token, "Manager")).token;
    await dashboard(tokens.Manager);
    const other = await dashboard(m2);
    expect(other.cached).toBe(true);
    expect(widget(other, "my-approvals")).toBeTruthy(); // computed for this user, not copied
  });
});
