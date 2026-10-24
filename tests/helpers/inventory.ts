import * as entriesRoute from "@/app/api/v1/stock-entries/route";
import * as approveRoute from "@/app/api/v1/stock-entries/[id]/approve/route";
import * as rejectRoute from "@/app/api/v1/stock-entries/[id]/reject/route";
import * as receiveRoute from "@/app/api/v1/stock-entries/[id]/receive/route";
import * as reverseRoute from "@/app/api/v1/stock-entries/[id]/reverse/route";
import * as availabilityRoute from "@/app/api/v1/stock/availability/route";
import * as productsRoute from "@/app/api/v1/products/route";
import { call } from "./http";
import { prisma, roleId } from "./db";
import { createUser, loginMobile } from "./fixtures";
import { catalogId, categoryId, unitId } from "./catalog";

let keyN = 0;
export const key = (p = "k") => `${p}-${Date.now().toString(36)}-${++keyN}-test`;

export const wh = async (code: string) => (await prisma.warehouse.findUniqueOrThrow({ where: { code } })).id;
export const supplier = async (name = "LG Electronics Bangladesh") => (await prisma.supplier.findFirstOrThrow({ where: { name } })).id;
export const customer = async (name = "Green Tower Developers Ltd.") => (await prisma.customer.findFirstOrThrow({ where: { name } })).id;
export const project = async (code = "PRJ-001") => (await prisma.project.findUniqueOrThrow({ where: { code } })).id;

let pn = 0;
/** Creates a catalog product through the API. */
export async function product(token: string, overrides: Record<string, unknown> = {}) {
  pn++;
  const res = await call(productsRoute.POST, "POST", "/products", {
    token,
    body: {
      code: `INV-${pn}-${Date.now().toString(36).toUpperCase()}`.slice(0, 31),
      name: `Inventory test item ${pn}`,
      catalogId: await catalogId("LG"),
      categoryId: await categoryId("Split AC"),
      unitId: await unitId("pcs"),
      purchaseCost: "0",
      sellingPrice: "1000",
      ...overrides,
    },
  });
  if (res.status !== 201) throw new Error(`product failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as { id: string; code: string };
}

export interface EntryBody {
  action?: "draft" | "submit" | "post";
  type: string;
  warehouseId: string;
  lines: Record<string, unknown>[];
  [k: string]: unknown;
}

export const createEntry = (token: string, body: EntryBody, k = key()) => call(entriesRoute.POST, "POST", "/stock-entries", { token, body: { action: "post", ...body }, headers: { "Idempotency-Key": k } });

/** Posts an entry and fails loudly if it doesn't post. */
export async function post(token: string, body: EntryBody) {
  const res = await createEntry(token, body);
  if (res.status !== 201) throw new Error(`post failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

/** Receives stock with a local GRN (BDT cost). */
export async function grn(token: string, warehouseId: string, lines: { productId: string; qty: string | number; unitPrice: string | number; serials?: string[] }[]) {
  return post(token, { type: "GRN_LOCAL", warehouseId, supplierId: await supplier(), lines });
}

export const action = (route: { POST: unknown }, id: string, token: string, body?: unknown, k = key()) =>
  call(route.POST as never, "POST", `/stock-entries/${id}/x`, { token, params: { id }, body, headers: { "Idempotency-Key": k } });

export const approve = (id: string, token: string, body?: unknown, k?: string) => action(approveRoute, id, token, body, k);
export const reject = (id: string, token: string, reason = "Wrong quantities") => action(rejectRoute, id, token, { reason });
export const receive = (id: string, token: string, body: unknown) => action(receiveRoute, id, token, body);
export const reverse = (id: string, token: string, reason = "Entered by mistake") => action(reverseRoute, id, token, { reason });

export async function availability(token: string, productId: string, warehouseId: string) {
  const res = await call(availabilityRoute.GET, "GET", "/stock/availability", { token, query: { productId, warehouseId } });
  return res.body.data as { onHand: string; reserved: string; available: string; damaged: string; avgCost: string };
}

export async function balance(productId: string, warehouseCode: string, condition: "GOOD" | "DAMAGED" = "GOOD") {
  const b = await prisma.stockBalance.findUnique({ where: { productId_warehouseId_condition: { productId, warehouseId: await wh(warehouseCode), condition } } });
  return { onHand: b?.qtyOnHand.toFixed(3) ?? "0.000", reserved: b?.qtyReserved.toFixed(3) ?? "0.000" };
}

export async function cost(productId: string) {
  const c = await prisma.productCost.findUnique({ where: { productId } });
  return { totalQty: c?.totalQty.toFixed(3) ?? "0.000", totalValue: c?.totalValue.toFixed(2) ?? "0.00", avgCost: c?.avgCost.toFixed(4) ?? "0.0000" };
}

/** Logs in a fresh user of `role` scoped to the given warehouses. */
export async function userToken(adminToken: string, role: string, warehouses: string[] = ["A", "B"]) {
  const u = await createUser(adminToken, { role, warehouses });
  return { token: (await loginMobile(u.username, u.password)).accessToken, id: u.id };
}

/** Sets a project status directly (the projects module owns the transitions; inventory tests only need the state). */
export async function setProjectStatus(_token: string, code: string, status: "PLANNING" | "RUNNING" | "ON_HOLD" | "COMPLETED" | "CLOSED") {
  await prisma.project.update({ where: { code }, data: { status } });
}

export { prisma, roleId };
