import { d, money, sum, ZERO } from "@/modules/inventory/domain/decimal";
import type { PoStatus, PoType } from "./types";

export interface PoTotalsInput {
  type: PoType;
  lines: { qty: string; unitPrice: string }[];
  /** Local POs only (ignored for imports). */
  discountAmount: string;
  vatPercent: string;
  /** BDT per unit of the PO currency (1 for local POs). */
  exchangeRate: string;
}

export interface PoTotals {
  lines: { amount: string }[];
  subtotal: string;
  discountAmount: string;
  vatPercent: string;
  vatAmount: string;
  /** In the PO currency. */
  total: string;
  totalBdt: string;
}

/**
 * PO totals. Local: subtotal − discount, + VAT % of that, in BDT. Imported: no discount or
 * VAT; the total is in the PO currency and its BDT equivalent uses the (indicative) rate.
 * Line amounts are rounded to 2 decimals and the totals are sums of those.
 */
export function poTotals(input: PoTotalsInput): PoTotals {
  const local = input.type === "LOCAL";
  const amounts = input.lines.map((l) => money(d(l.qty).times(d(l.unitPrice))));
  const subtotal = sum(amounts);
  const discount = local ? money(d(input.discountAmount)) : ZERO;
  const vatPercent = local ? d(input.vatPercent) : ZERO;
  const net = subtotal.minus(discount);
  const vat = local ? money(net.times(vatPercent).div(100)) : ZERO;
  const total = net.plus(vat);
  const rate = local ? d(1) : d(input.exchangeRate);
  return {
    lines: amounts.map((a) => ({ amount: a.toFixed(2) })),
    subtotal: subtotal.toFixed(2),
    discountAmount: discount.toFixed(2),
    vatPercent: vatPercent.toFixed(2),
    vatAmount: vat.toFixed(2),
    total: money(total).toFixed(2),
    totalBdt: money(total.times(rate)).toFixed(2),
  };
}

/** Remaining = ordered − received − pending receipt. */
export const remainingQty = (l: { qty: string; receivedQty: string; pendingReceiptQty: string }) => d(l.qty).minus(d(l.receivedQty)).minus(d(l.pendingReceiptQty));

/**
 * Status after receipts change (GRN posted / reversed, or an amendment): any received →
 * PARTLY_RECEIVED; every line in full → FULLY_RECEIVED; nothing → back to SENT / APPROVED.
 * Closed and cancelled POs keep their status.
 */
export function statusAfterReceipts(current: PoStatus, sentAt: Date | null, lines: { qty: string; receivedQty: string }[]): PoStatus {
  if (!["APPROVED", "SENT", "PARTLY_RECEIVED", "FULLY_RECEIVED"].includes(current)) return current;
  if (lines.length && lines.every((l) => d(l.receivedQty).gte(d(l.qty)))) return "FULLY_RECEIVED";
  if (lines.some((l) => d(l.receivedQty).gt(0))) return "PARTLY_RECEIVED";
  return sentAt ? "SENT" : "APPROVED";
}

/** Expected delivery is before today (Asia/Dhaka) and goods are still due. */
export function isOverdue(po: { status: PoStatus; expectedDeliveryDate: string | null }, today: string): boolean {
  return !!po.expectedDeliveryDate && po.expectedDeliveryDate < today && ["APPROVED", "SENT", "PARTLY_RECEIVED"].includes(po.status);
}

/** Whole days between two YYYY-MM-DD dates. */
export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}
