import type { PoRecord } from "../application/ports";

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmt2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt4 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const money = (v: string) => fmt2.format(v as unknown as number);
const price = (v: string) => fmt4.format(v as unknown as number);
const qty = (v: string) => (v.includes(".") ? v.replace(/\.?0+$/, "") : v);
const trimPct = (v: string) => v.replace(/\.?0+$/, "");

/**
 * Printable purchase order (Carbon-style: plain white page, IBM Plex, a 2px rule under the
 * header, grey table head). Company header, supplier block, delivery details, lines, totals,
 * terms and signature lines. `showPrices` is off for internal copies printed without seeCost;
 * the copy emailed to the supplier always has prices. Amounts are written with the currency
 * code (the taka sign isn't in every PDF font).
 */
export function renderPoHtml(po: PoRecord, opts: { showPrices: boolean; companyName: string; companyAddress?: string | null; printedBy: string; printedAt: string }): string {
  const no = po.number ?? po.draftRef;
  const cur = po.currency;
  const p = opts.showPrices;
  const watermark = ["APPROVED", "SENT", "PARTLY_RECEIVED", "FULLY_RECEIVED", "CLOSED"].includes(po.status) ? "" : `<div class="watermark">${esc(po.status.replace(/_/g, " "))}</div>`;
  const s = po.supplier;
  const supplierLines = [s.name, s.address, [s.contactPerson, s.phone].filter(Boolean).join(" · "), s.email].filter(Boolean);
  const meta: [string, string | null][] = [
    ["PO date", po.poDate],
    ["Expected delivery", po.expectedDeliveryDate],
    ["Deliver to", `${po.deliverTo.name} (${po.deliverTo.code})`],
    ["Project", po.project ? `${po.project.code} — ${po.project.name}` : null],
    ["Your quotation", po.supplierQuoteRef],
    ["Currency", po.type === "IMPORTED" ? `${cur} (indicative rate ${po.exchangeRate} BDT)` : "BDT"],
    ["Payment terms", s.paymentTermsNote],
    ["Revision", po.revision ? `Rev ${po.revision}` : null],
  ];
  const rows = po.lines
    .map(
      (l, i) =>
        `<tr><td>${i + 1}</td><td class="mono">${esc(l.product.code)}</td><td>${esc(l.product.name)}${l.note ? `<div class="note">${esc(l.note)}</div>` : ""}</td><td class="num">${qty(l.qty)} ${esc(l.product.unitCode)}</td>${
          p ? `<td class="num">${price(l.unitPrice)}</td><td class="num">${money(l.amount)}</td>` : ""
        }</tr>`,
    )
    .join("");
  const totals = !p
    ? ""
    : po.type === "LOCAL"
      ? `<tr><td>Subtotal</td><td class="num">${money(po.subtotal)}</td></tr>
         ${po.discountAmount !== "0.00" ? `<tr><td>Discount</td><td class="num">− ${money(po.discountAmount)}</td></tr>` : ""}
         <tr><td>VAT ${esc(trimPct(po.vatPercent) || "0")}%</td><td class="num">${money(po.vatAmount)}</td></tr>
         <tr class="grand"><td>Total (BDT)</td><td class="num">${money(po.total)}</td></tr>`
      : `<tr class="grand"><td>Total (${esc(cur)})</td><td class="num">${money(po.total)}</td></tr>
         <tr><td class="muted">≈ BDT at ${esc(po.exchangeRate)}</td><td class="num muted">${money(po.totalBdt)}</td></tr>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Purchase Order ${esc(no)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "IBM Plex Sans", "Segoe UI", Arial, sans-serif; font-size: 11px; color: #161616; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #161616; padding-bottom: 10px; }
  .company { font-size: 16px; font-weight: 600; }
  h1 { font-size: 20px; font-weight: 400; margin: 0; text-align: right; }
  .no { font-family: "IBM Plex Mono", Consolas, monospace; font-size: 13px; text-align: right; margin-top: 4px; }
  .blocks { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 14px 0; }
  .label { display: block; font-size: 9px; color: #525252; text-transform: uppercase; letter-spacing: .3px; margin-bottom: 2px; }
  .supplier { background: #f4f4f4; padding: 10px 12px; }
  .supplier b { font-size: 12px; }
  .meta div { margin-bottom: 6px; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .lines th { background: #e0e0e0; text-align: left; padding: 6px; font-weight: 600; }
  .lines td { border-bottom: 1px solid #e0e0e0; padding: 6px; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .mono { font-family: "IBM Plex Mono", Consolas, monospace; }
  .note, .muted { color: #525252; font-size: 9px; }
  table.totals { margin: 12px 0 0 auto; min-width: 280px; border-collapse: collapse; }
  .totals td { padding: 4px 6px; }
  .totals .grand td { border-top: 2px solid #161616; font-weight: 600; }
  .terms { margin-top: 18px; }
  .terms p { white-space: pre-wrap; margin: 2px 0 0; }
  .sign { display: flex; justify-content: space-between; margin-top: 64px; }
  .sign div { width: 30%; border-top: 1px solid #161616; padding-top: 4px; text-align: center; color: #525252; }
  .foot { position: fixed; bottom: 0; left: 0; right: 0; font-size: 8px; color: #8d8d8d; display: flex; justify-content: space-between; }
  .watermark { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 64px; color: rgba(218,30,40,.12); transform: rotate(-20deg); font-weight: 600; }
</style></head>
<body>
${watermark}
<div class="head">
  <div><div class="company">${esc(opts.companyName)}</div>${opts.companyAddress ? `<div>${esc(opts.companyAddress)}</div>` : ""}</div>
  <div><h1>Purchase Order</h1><div class="no">${esc(no)}${po.revision ? ` · Rev ${po.revision}` : ""}</div></div>
</div>
<div class="blocks">
  <div class="supplier"><span class="label">Supplier</span>${supplierLines.map((x, i) => (i === 0 ? `<b>${esc(x)}</b>` : `<div>${esc(x)}</div>`)).join("")}<div class="mono note">${esc(s.code)}</div></div>
  <div class="meta">${meta
    .filter(([, v]) => v)
    .map(([k, v]) => `<div><span class="label">${esc(k)}</span>${esc(v)}</div>`)
    .join("")}</div>
</div>
<table class="lines">
  <thead><tr><th>#</th><th>Code</th><th>Item</th><th class="num">Qty</th>${p ? `<th class="num">Unit price (${esc(cur)})</th><th class="num">Amount (${esc(cur)})</th>` : ""}</tr></thead>
  <tbody>${rows}</tbody>
</table>
${totals ? `<table class="totals">${totals}</table>` : ""}
${po.terms ? `<div class="terms"><span class="label">Terms &amp; conditions</span><p>${esc(po.terms)}</p></div>` : ""}
${po.notes ? `<div class="terms"><span class="label">Notes</span><p>${esc(po.notes)}</p></div>` : ""}
<div class="sign"><div>Prepared by<br>${esc(po.createdBy.name)}</div><div>Approved by${po.approvedBy ? `<br>${esc(po.approvedBy.name)}` : ""}</div><div>Supplier acceptance</div></div>
<div class="foot"><span>StockBook · printed by ${esc(opts.printedBy)} · ${esc(opts.printedAt)}</span><span>${esc(no)}</span></div>
</body></html>`;
}
