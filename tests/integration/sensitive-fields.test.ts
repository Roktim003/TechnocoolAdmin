import { beforeEach, describe, expect, it } from "vitest";
import { authedRoute } from "@/shared/http/route";
import * as roleRoute from "@/app/api/v1/roles/[id]/route";
import { call } from "../helpers/http";
import { resetDatabase, roleId } from "../helpers/db";
import { adminToken, createUser, loginMobile } from "../helpers/fixtures";

/**
 * Later modules return cost / profit / margin fields. This probe route stands in for them and
 * proves the route wrapper strips those fields in the API response itself.
 */
const probe = authedRoute({}, async () => ({
  data: {
    sku: "LG-AC-1.5T",
    price: 85_000,
    unitCost: 61_000,
    profit: 24_000,
    margin: 0.28,
    contractValue: 1_200_000,
    lines: [{ qty: 2, cost: 122_000, grossProfit: 48_000 }],
  },
}));

let token: string;

beforeEach(async () => {
  await resetDatabase();
  token = await adminToken();
});

async function tokenFor(role: string) {
  const user = await createUser(token, { role });
  return (await loginMobile(user.username, user.password)).accessToken;
}

describe("sensitive fields are removed from API responses", () => {
  it("Admin (all flags) sees everything", async () => {
    const res = await call(probe, "GET", "/probe", { token });
    expect(res.body.data).toMatchObject({ unitCost: 61_000, profit: 24_000, margin: 0.28, contractValue: 1_200_000 });
    expect(res.body.data.lines[0]).toEqual({ qty: 2, cost: 122_000, grossProfit: 48_000 });
  });

  it("Accounts (cost + profit, no margin) loses margin and contract value", async () => {
    const res = await call(probe, "GET", "/probe", { token: await tokenFor("Accounts") });
    expect(res.body.data).toMatchObject({ unitCost: 61_000, profit: 24_000 });
    expect(res.body.data).not.toHaveProperty("margin");
    expect(res.body.data).not.toHaveProperty("contractValue");
  });

  it("Manager (cost only) loses profit and margin, also in nested arrays", async () => {
    const res = await call(probe, "GET", "/probe", { token: await tokenFor("Manager") });
    expect(res.body.data.unitCost).toBe(61_000);
    expect(res.body.data).not.toHaveProperty("profit");
    expect(res.body.data).not.toHaveProperty("margin");
    expect(res.body.data.lines[0]).toEqual({ qty: 2, cost: 122_000 });
  });

  it("Store Manager (no flags) sees none of cost / profit / margin", async () => {
    const res = await call(probe, "GET", "/probe", { token: await tokenFor("Store Manager") });
    expect(res.body.data).toEqual({ sku: "LG-AC-1.5T", price: 85_000, lines: [{ qty: 2 }] });
  });

  it("follows flag changes on the role immediately", async () => {
    const storeToken = await tokenFor("Store Manager");
    const id = await roleId("Store Manager");
    await call(roleRoute.PATCH, "PATCH", `/roles/${id}`, { token, params: { id }, body: { flags: { seeCost: true } } });
    const res = await call(probe, "GET", "/probe", { token: storeToken });
    expect(res.body.data.unitCost).toBe(61_000);
    expect(res.body.data).not.toHaveProperty("profit");
  });
});
