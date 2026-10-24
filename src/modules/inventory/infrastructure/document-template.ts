import type { DocumentKind } from "../application/dto";
import type { EntryRecord } from "../application/ports";
import { ENTRY_TYPE_META, type EntryType } from "../domain/types";

export const DOCUMENT_TITLES: Record<DocumentKind, string> = {
  GRN: "Goods Received Note",
  DELIVERY_CHALLAN: "Delivery Challan",
  SALES_INVOICE: "Sales Invoice",
  RETURN_NOTE: "Return Note",
  WRITE_OFF_NOTE: "Write-off Note",
  TRANSFER_CHALLAN: "Transfer Challan",
  REVERSAL_NOTE: "Reversal Note",
  ADJUSTMENT_NOTE: "Stock Adjustment Note",
};

export function defaultDocumentKind(type: EntryType): DocumentKind {
  switch (type) {
    case "GRN_IMPORT":
    case "GRN_LOCAL":
    case "OPENING":
      return "GRN";
    case "ISSUE_TO_PROJECT":
      return "DELIVERY_CHALLAN";
    case "SALE":
      return "SALES_INVOICE";
    case "RETURN_FROM_SITE":
    case "RETURN_TO_SUPPLIER":
      return "RETURN_NOTE";
    case "DAMAGE_WRITE_OFF":
      return "WRITE_OFF_NOTE";
    case "TRANSFER":
      return "TRANSFER_CHALLAN";
    case "REVERSAL":
      return "REVERSAL_NOTE";
    case "STOCK_ADJUSTMENT":
      return "ADJUSTMENT_NOTE";
  }
}

/** Which kinds make sense for an entry type. */
export function allowedKinds(type: EntryType): DocumentKind[] {
  return type === "SALE" ? ["SALES_INVOICE", "DELIVERY_CHALLAN"] : [defaultDocumentKind(type)];
}

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (v: string | null | undefined) => (v === null || v === undefined ? "" : fmt.format(v as unknown as number));
const qty = (v: string) => (v.includes(".") ? v.replace(/\.?0+$/, "") : v);

/**
 * Printable HTML for an entry. `showCost` follows the requester's seeCost flag; challans
 * never show prices. Amounts are written as "BDT" (the taka sign isn't in every PDF font).
 */
export function renderDocumentHtml(e: EntryRecord, kind: DocumentKind, opts: { showCost: boolean; companyName: string; printedBy: string; printedAt: string }): string {
  const title = DOCUMENT_TITLES[kind];
  const isChallan = kind === "DELIVERY_CHALLAN" || kind === "TRANSFER_CHALLAN";
  const isSale = kind === "SALES_INVOICE";
  const priced = !isChallan && (isSale || opts.showCost);
  const statusNote = ["POSTED", "RECEIVED", "DISPATCHED"].includes(e.status) ? "" : `<div class="watermark">${esc(e.status)}</div>`;

  const party = [
    e.supplier && ["Supplier", e.supplier.name],
    e.customer && ["Customer", `${e.customer.name}${e.customerPhone ? ` · ${e.customerPhone}` : ""}${e.customerAddress ? `<br>${esc(e.customerAddress)}` : ""}`],
    e.project && ["Project", `${e.project.code} — ${e.project.name}`],
    e.toWarehouse && ["To warehouse", e.toWarehouse.name],
  ].filter(Boolean) as [string, string][];
  const refs = [
    ["PO no.", e.poNumberText],
    ["Supplier invoice / challan", e.supplierInvoiceNo],
    ["LC no.", e.lcNo],
    ["Bill of Entry", e.billOfEntryNo],
    ["Challan / ref.", e.challanNo],
    ["Site address", e.siteAddress],
    ["Received by", e.receivedBy],
    ["Vehicle / carrier", e.vehicle],
    ["Reason", e.reason],
  ].filter(([, v]) => v) as [string, string][];

  const priceHead = isSale ? "Unit price" : "Unit cost";
  const rows = e.lines
    .map((l, i) => {
      const unit = isSale ? l.unitPrice : (l.landedUnitCost ?? l.unitCostBdt);
      const amount = isSale ? l.amount : l.costAmount;
      const serials = l.serials.length ? `<div class="serials">S/N: ${l.serials.map((s) => esc(s.serial)).join(", ")}</div>` : "";
      return `<tr><td>${i + 1}</td><td class="mono">${esc(l.product.code)}</td><td>${esc(l.product.name)}${l.condition === "DAMAGED" ? " <b>(damaged)</b>" : ""}${serials}</td><td class="num">${l.adjustDirection === "LOSS" ? "− " : l.adjustDirection === "GAIN" ? "+ " : ""}${qty(l.qty)} ${esc(l.product.unitCode)}</td>${
        priced ? `<td class="num">${money(unit)}</td><td class="num">${money(amount)}</td>` : ""
      }</tr>`;
    })
    .join("");

  const totals = isSale
    ? `<tr><td>Subtotal</td><td class="num">${money(e.subtotal)}</td></tr>
       ${e.discountAmount !== "0.00" ? `<tr><td>Discount</td><td class="num">− ${money(e.discountAmount)}</td></tr>` : ""}
       <tr><td>VAT ${esc(e.vatPercent.replace(/\.00$/, ""))}%</td><td class="num">${money(e.vatAmount)}</td></tr>
       <tr class="grand"><td>Total (BDT)</td><td class="num">${money(e.grandTotal)}</td></tr>`
    : priced
      ? `${e.type === "GRN_IMPORT" ? `<tr><td>Goods (BDT, rate ${esc(e.exchangeRate)} ${esc(e.currency)})</td><td class="num">${money(e.subtotal)}</td></tr>${e.charges
          .map((c) => `<tr><td>${esc(c.label ?? c.type.replace(/_/g, " ").toLowerCase())}${c.includeInCost ? "" : " (not in cost)"}</td><td class="num">${money(c.amountBdt)}</td></tr>`)
          .join("")}` : ""}<tr class="grand"><td>Total cost (BDT)</td><td class="num">${money(e.costTotal)}</td></tr>`
      : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)} ${esc(e.number ?? e.draftRef)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "IBM Plex Sans", "Segoe UI", Arial, sans-serif; font-size: 11px; color: #161616; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #161616; padding-bottom: 10px; }
  .company { font-size: 16px; font-weight: 600; }
  h1 { font-size: 20px; font-weight: 400; margin: 0; text-align: right; }
  .no { font-family: "IBM Plex Mono", Consolas, monospace; font-size: 13px; text-align: right; margin-top: 4px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin: 14px 0; }
  .meta div span { display: block; font-size: 9px; color: #525252; text-transform: uppercase; letter-spacing: .3px; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .lines th { background: #e0e0e0; text-align: left; padding: 6px; font-weight: 600; }
  .lines td { border-bottom: 1px solid #e0e0e0; padding: 6px; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .mono { font-family: "IBM Plex Mono", Consolas, monospace; }
  .serials { color: #525252; font-size: 9px; margin-top: 2px; }
  table.totals { margin: 12px 0 0 auto; min-width: 260px; border-collapse: collapse; }
  .totals td { padding: 4px 6px; }
  .totals .grand td { border-top: 2px solid #161616; font-weight: 600; }
  .notes { margin-top: 14px; white-space: pre-wrap; }
  .sign { display: flex; justify-content: space-between; margin-top: 60px; }
  .sign div { width: 30%; border-top: 1px solid #161616; padding-top: 4px; text-align: center; color: #525252; }
  .foot { position: fixed; bottom: 0; left: 0; right: 0; font-size: 8px; color: #8d8d8d; display: flex; justify-content: space-between; }
  .watermark { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 72px; color: rgba(218,30,40,.12); transform: rotate(-20deg); font-weight: 600; }
</style></head>
<body>
${statusNote}
<div class="head">
  <div><div class="company">${esc(opts.companyName)}</div><div>${esc(e.warehouse.name)}</div></div>
  <div><h1>${esc(title)}</h1><div class="no">${esc(e.number ?? e.draftRef)}</div></div>
</div>
<div class="meta">
  <div><span>Date</span>${esc(e.entryDate)}</div>
  <div><span>Type</span>${esc(ENTRY_TYPE_META[e.type].label)}</div>
  ${party.map(([k, v]) => `<div><span>${esc(k)}</span>${v.includes("<br>") ? v : esc(v)}</div>`).join("")}
  ${refs.map(([k, v]) => `<div><span>${esc(k)}</span>${esc(v)}</div>`).join("")}
  ${e.reversalOf ? `<div><span>Reverses</span>${esc(e.reversalOf.number)}</div>` : ""}
</div>
<table class="lines">
  <thead><tr><th>#</th><th>Code</th><th>Item</th><th class="num">Qty</th>${priced ? `<th class="num">${priceHead} (BDT)</th><th class="num">Amount (BDT)</th>` : ""}</tr></thead>
  <tbody>${rows}</tbody>
</table>
${totals ? `<table class="totals">${totals}</table>` : ""}
${e.description || e.notes ? `<div class="notes">${esc([e.description, e.notes].filter(Boolean).join("\n"))}</div>` : ""}
<div class="sign"><div>Prepared by<br>${esc(e.createdBy.name)}</div><div>${isChallan ? "Received by" : "Checked by"}${e.verifiedBy ? `<br>${esc(e.verifiedBy.name)}` : ""}</div><div>Authorised signature</div></div>
<div class="foot"><span>StockBook · printed by ${esc(opts.printedBy)} · ${esc(opts.printedAt)}</span><span>${esc(e.number ?? e.draftRef)}</span></div>
</body></html>`;
}
