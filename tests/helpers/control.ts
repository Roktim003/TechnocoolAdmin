import ExcelJS from "exceljs";
import * as templateRoute from "@/app/api/v1/opening-stock/template/route";
import * as importsRoute from "@/app/api/v1/opening-stock/imports/route";
import * as importRoute from "@/app/api/v1/opening-stock/imports/[id]/route";
import * as commitRoute from "@/app/api/v1/opening-stock/imports/[id]/commit/route";
import * as countsRoute from "@/app/api/v1/stock-counts/route";
import * as countRoute from "@/app/api/v1/stock-counts/[id]/route";
import * as startRoute from "@/app/api/v1/stock-counts/[id]/start/route";
import * as submitRoute from "@/app/api/v1/stock-counts/[id]/submit/route";
import * as approveRoute from "@/app/api/v1/stock-counts/[id]/approve/route";
import * as recountRoute from "@/app/api/v1/stock-counts/[id]/request-recount/route";
import * as cancelRoute from "@/app/api/v1/stock-counts/[id]/cancel/route";
import * as lineRoute from "@/app/api/v1/stock-counts/[id]/lines/[lineId]/route";
import * as varianceRoute from "@/app/api/v1/stock-counts/[id]/variance/route";
import { call } from "./http";
import { form } from "./catalog";
import { key } from "./inventory";

/* ── opening import ── */

export type OpeningRowInput = { warehouse?: string; product?: string; condition?: string; qty?: string | number; cost?: string | number | null; serials?: string; note?: string };

/** Downloads the real template and fills its first sheet (replacing the example row). */
export async function openingWorkbook(token: string, rows: OpeningRowInput[]): Promise<Uint8Array> {
  const res = await call(templateRoute.GET, "GET", "/opening-stock/template", { token });
  if (res.status !== 200) throw new Error(`template ${res.status}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.bytes as unknown as ArrayBuffer);
  const ws = wb.worksheets[0]!;
  // Rows are written by number: the template's dropdowns reach row 2001, so addRow would append after them.
  rows.forEach((r, i) => {
    const values = [r.warehouse ?? "", r.product ?? "", r.condition ?? "", r.qty ?? "", r.cost === undefined ? 0 : r.cost, r.serials ?? "", r.note ?? ""];
    values.forEach((v, c) => (ws.getCell(i + 2, c + 1).value = v === null ? null : v));
  });
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

export async function uploadOpening(token: string, bytes: Uint8Array) {
  return call(importsRoute.POST, "POST", "/opening-stock/imports", { token, body: form([{ name: "opening.xlsx", bytes }]) });
}

/** Polls the import until the worker has validated it. */
export async function waitForImport(token: string, id: string) {
  for (let i = 0; i < 100; i++) {
    const r = await call(importRoute.GET, "GET", `/opening-stock/imports/${id}`, { token, params: { id } });
    if (!["QUEUED", "VALIDATING"].includes(r.body.data.status)) return r.body.data;
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error("import not validated in time");
}

export const commitImport = (token: string, id: string, k = key("commit")) => call(commitRoute.POST, "POST", "/x", { token, params: { id }, headers: { "Idempotency-Key": k } });

/* ── stock counts ── */

export async function createCount(token: string, body: Record<string, unknown>) {
  const res = await call(countsRoute.POST, "POST", "/stock-counts", { token, body });
  if (res.status !== 201) throw new Error(`createCount ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

const act = (route: { POST: unknown }, id: string, token: string, body?: unknown, k = key("count")) =>
  call(route.POST as never, "POST", "/x", { token, params: { id }, body, headers: { "Idempotency-Key": k } });

export const startCount = (id: string, token: string, k?: string) => act(startRoute, id, token, undefined, k);
export const submitCount = (id: string, token: string, body?: unknown, k?: string) => act(submitRoute, id, token, body, k);
export const approveCount = (id: string, token: string, k?: string) => act(approveRoute, id, token, undefined, k);
export const recount = (id: string, token: string, lineIds: string[]) => act(recountRoute, id, token, { lineIds });
export const cancelCount = (id: string, token: string) => act(cancelRoute, id, token);
export const getCount = (id: string, token: string) => call(countRoute.GET, "GET", "/x", { token, params: { id } });
export const variance = (id: string, token: string) => call(varianceRoute.GET, "GET", "/x", { token, params: { id } });
export const countLine = (id: string, lineId: string, token: string, body: Record<string, unknown>) => call(lineRoute.PUT, "PUT", "/x", { token, params: { id, lineId }, body });

/** The count line for a product (GOOD unless asked). */
export function lineOf(count: { lines: any[] }, productId: string, condition = "GOOD"): any {
  const l = count.lines.find((x: { product: { id: string }; condition: string }) => x.product.id === productId && x.condition === condition);
  if (!l) throw new Error(`no line for ${productId} ${condition}`);
  return l;
}
