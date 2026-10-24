import * as posRoute from "@/app/api/v1/purchase-orders/route";
import * as poRoute from "@/app/api/v1/purchase-orders/[id]/route";
import * as submitRoute from "@/app/api/v1/purchase-orders/[id]/submit/route";
import * as approveRoute from "@/app/api/v1/purchase-orders/[id]/approve/route";
import * as rejectRoute from "@/app/api/v1/purchase-orders/[id]/reject/route";
import * as sentRoute from "@/app/api/v1/purchase-orders/[id]/mark-sent/route";
import * as closeRoute from "@/app/api/v1/purchase-orders/[id]/close/route";
import * as cancelRoute from "@/app/api/v1/purchase-orders/[id]/cancel/route";
import * as amendRoute from "@/app/api/v1/purchase-orders/[id]/amend/route";
import * as receivableRoute from "@/app/api/v1/purchase-orders/[id]/receivable/route";
import { MODULE_KEYS, type PermissionLevel } from "@/shared/rbac/levels";
import { call } from "./http";
import { prisma } from "./db";
import { createUser, loginMobile } from "./fixtures";
import { createEntry, key, supplier, wh } from "./inventory";

export const LOCAL = "LG Electronics Bangladesh";
export const FOREIGN = "Daikin Airconditioning (Thailand)";

export interface PoBody {
  action?: "draft" | "submit" | "approve";
  supplierId: string;
  deliverToWarehouseId: string;
  lines: { productId: string; qty: string | number; unitPrice: string | number; note?: string; id?: string }[];
  [k: string]: unknown;
}

export const createPo = (token: string, body: PoBody, k = key("po")) => call(posRoute.POST, "POST", "/purchase-orders", { token, body: { action: "draft", ...body }, headers: { "Idempotency-Key": k } });

/** Creates a PO and fails loudly unless it worked. */
export async function po(token: string, body: PoBody) {
  const r = await createPo(token, body);
  if (r.status !== 201) throw new Error(`createPo ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data;
}

/** An approved local PO from the LG supplier to warehouse A (Admin). */
export async function approvedPo(token: string, lines: PoBody["lines"], extra: Partial<PoBody> = {}) {
  return po(token, { action: "approve", supplierId: await supplier(LOCAL), deliverToWarehouseId: await wh("A"), lines, ...extra });
}

const act = (route: { POST: unknown }, id: string, token: string, body?: unknown, k = key("poact")) => call(route.POST as never, "POST", "/x", { token, params: { id }, body, headers: { "Idempotency-Key": k } });

export const submitPo = (id: string, token: string, k?: string) => act(submitRoute, id, token, undefined, k);
export const approvePo = (id: string, token: string, k?: string) => act(approveRoute, id, token, undefined, k);
export const rejectPo = (id: string, token: string, reason = "Price too high") => act(rejectRoute, id, token, { reason });
export const markSent = (id: string, token: string, body?: unknown) => act(sentRoute, id, token, body);
export const closePo = (id: string, token: string, reason = "Supplier can't deliver the rest") => act(closeRoute, id, token, { reason });
export const cancelPo = (id: string, token: string, reason = "No longer needed") => act(cancelRoute, id, token, { reason });
export const amendPo = (id: string, token: string, body: unknown) => act(amendRoute, id, token, body);
export const getPo = (id: string, token: string) => call(poRoute.GET, "GET", "/x", { token, params: { id } });
export const patchPo = (id: string, token: string, body: unknown) => call(poRoute.PATCH, "PATCH", "/x", { token, params: { id }, body });
export const receivable = (id: string, token: string) => call(receivableRoute.GET, "GET", "/x", { token, params: { id } });

/** A GRN against a PO (local by default). */
export function grnFor(token: string, poId: string, lines: { productId: string; qty: string | number; unitPrice?: string | number; serials?: string[] }[], extra: Record<string, unknown> = {}, k?: string) {
  return createEntry(token, { action: "post", type: "GRN_LOCAL", warehouseId: (extra.warehouseId as string) ?? "", purchaseOrderId: poId, lines, ...extra }, k);
}

export async function poLines(poId: string) {
  const lines = await prisma.purchaseOrderLine.findMany({ where: { poId }, orderBy: { lineNo: "asc" } });
  return lines.map((l) => ({ productId: l.productId, qty: l.qty.toFixed(3), received: l.receivedQty.toFixed(3), pending: l.pendingReceiptQty.toFixed(3), unitPrice: l.unitPrice.toFixed(4) }));
}

export const poStatus = async (poId: string) => (await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } })).status;

let rn = 0;
/** A custom role (default: every module NONE) and a logged-in user with it. */
export async function customUser(adminToken: string, levels: Partial<Record<(typeof MODULE_KEYS)[number], PermissionLevel>>, flags: { seeCost?: boolean; seeProfit?: boolean; seeMargin?: boolean } = {}, warehouses = ["A", "B"]) {
  rn++;
  const name = `Custom role ${rn} ${Date.now().toString(36)}`;
  await prisma.role.create({
    data: { name, nameKey: name.toLowerCase(), seeCost: flags.seeCost ?? false, seeProfit: flags.seeProfit ?? false, seeMargin: flags.seeMargin ?? false, permissions: { create: MODULE_KEYS.map((m) => ({ module: m, level: levels[m] ?? "NONE" })) } },
  });
  const u = await createUser(adminToken, { role: name, warehouses });
  return { id: u.id as string, token: (await loginMobile(u.username, u.password)).accessToken };
}
