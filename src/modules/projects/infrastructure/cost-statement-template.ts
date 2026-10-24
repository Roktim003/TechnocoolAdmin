import type { MaterialProduct } from "../application/costing.service";
import type { CostRecord, ProjectRecord } from "../application/ports";
import type { ProjectSummary } from "../domain/rules";
import { COST_CATEGORY_LABEL, PROJECT_STATUS_LABEL, PROJECT_TYPE_LABEL } from "../domain/types";

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmt2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (v: string | null) => (v === null ? "—" : fmt2.format(v as unknown as number));
const qty = (v: string) => (v.includes(".") ? v.replace(/\.?0+$/, "") : v);

/**
 * "Project cost statement" (Carbon-style like the other StockBook PDFs): header, project
 * details, material table (issued − returned at ledger cost), labour / transport / other
 * costs, totals. The contract value and margin section only when `showMargin` (seeMargin).
 * Amounts in BDT, written without the taka sign (not in every PDF font).
 */
export function renderCostStatementHtml(
  p: ProjectRecord,
  x: { summary: ProjectSummary; material: MaterialProduct[]; costs: CostRecord[] },
  opts: { showMargin: boolean; companyName: string; companyAddress?: string | null; printedBy: string; printedAt: string },
): string {
  const s = x.summary;
  const meta: [string, string | null][] = [
    ["Client", p.clientName],
    ["Site", p.siteAddress],
    ["Type", PROJECT_TYPE_LABEL[p.projectType]],
    ["Status", PROJECT_STATUS_LABEL[p.status]],
    ["Start → expected end", [p.startDate ?? "—", p.expectedEndDate ?? "—"].join(" → ")],
    ["Completed", p.actualEndDate],
    ["Site engineer", p.siteEngineer?.name ?? p.siteEngineerName],
    ["Supplying warehouse", p.defaultWarehouse ? `${p.defaultWarehouse.name} (${p.defaultWarehouse.code})` : null],
  ];
  const material = x.material
    .map(
      (m) =>
        `<tr><td class="mono">${esc(m.product.code)}</td><td>${esc(m.product.name)}</td><td class="num">${qty(m.issuedQty)}</td><td class="num">${qty(m.returnedQty)}</td><td class="num">${qty(m.netQty)} ${esc(m.product.unitCode)}</td><td class="num">${money(m.netCost)}</td></tr>`,
    )
    .join("");
  const costs = x.costs
    .filter((c) => !c.voidedAt)
    .map((c) => `<tr><td>${esc(c.date)}</td><td>${esc(COST_CATEGORY_LABEL[c.category])}</td><td>${esc(c.description)}${c.referenceNo ? `<div class="note">Ref ${esc(c.referenceNo)}</div>` : ""}</td><td>${esc(c.vendorOrPayee ?? "")}</td><td class="num">${money(c.amount)}</td></tr>`)
    .join("");
  const margin =
    opts.showMargin && s.contractValue !== null
      ? `<div class="section"><span class="label">Contract &amp; margin</span>
         <table class="totals">
           <tr><td>Contract value</td><td class="num">${money(s.contractValue)}</td></tr>
           <tr><td>Total cost</td><td class="num">${money(s.totalCost)}</td></tr>
           <tr class="grand"><td>Margin${s.marginPercent ? ` (${esc(s.marginPercent)}%)` : ""}</td><td class="num${s.margin?.startsWith("-") ? " neg" : ""}">${money(s.margin)}</td></tr>
           <tr><td class="muted">Cost used</td><td class="num muted">${esc(s.costUsedPercent ?? "—")}%</td></tr>
         </table></div>`
      : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Cost statement ${esc(p.code)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "IBM Plex Sans", "Segoe UI", Arial, sans-serif; font-size: 11px; color: #161616; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #161616; padding-bottom: 10px; }
  .company { font-size: 16px; font-weight: 600; }
  h1 { font-size: 20px; font-weight: 400; margin: 0; text-align: right; }
  .no { font-family: "IBM Plex Mono", Consolas, monospace; font-size: 13px; text-align: right; margin-top: 4px; }
  .title { font-size: 14px; font-weight: 600; margin: 14px 0 6px; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 16px; background: #f4f4f4; padding: 10px 12px; }
  .label { display: block; font-size: 9px; color: #525252; text-transform: uppercase; letter-spacing: .3px; margin-bottom: 2px; }
  .section { margin-top: 16px; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 4px; }
  .lines th { background: #e0e0e0; text-align: left; padding: 6px; font-weight: 600; }
  .lines td { border-bottom: 1px solid #e0e0e0; padding: 6px; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .mono { font-family: "IBM Plex Mono", Consolas, monospace; }
  .note, .muted { color: #525252; font-size: 9px; }
  .empty { color: #525252; padding: 6px 0; }
  table.totals { margin: 8px 0 0 auto; min-width: 300px; border-collapse: collapse; }
  .totals td { padding: 4px 6px; }
  .totals .grand td { border-top: 2px solid #161616; font-weight: 600; }
  .neg { color: #da1e28; }
  .foot { position: fixed; bottom: 0; left: 0; right: 0; font-size: 8px; color: #8d8d8d; display: flex; justify-content: space-between; }
</style></head>
<body>
<div class="head">
  <div><div class="company">${esc(opts.companyName)}</div>${opts.companyAddress ? `<div>${esc(opts.companyAddress)}</div>` : ""}</div>
  <div><h1>Project cost statement</h1><div class="no">${esc(p.code)}</div></div>
</div>
<div class="title">${esc(p.name)}</div>
<div class="meta">${meta
    .filter(([, v]) => v)
    .map(([k, v]) => `<div><span class="label">${esc(k)}</span>${esc(v)}</div>`)
    .join("")}</div>

<div class="section"><span class="label">Material (issued − returned, at stock cost)</span>
${
  material
    ? `<table class="lines"><thead><tr><th>Code</th><th>Product</th><th class="num">Issued</th><th class="num">Returned</th><th class="num">Net used</th><th class="num">Cost (BDT)</th></tr></thead><tbody>${material}</tbody></table>`
    : `<div class="empty">No material issued.</div>`
}
</div>

<div class="section"><span class="label">Labour, transport &amp; other costs</span>
${costs ? `<table class="lines"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Payee / vendor</th><th class="num">Amount (BDT)</th></tr></thead><tbody>${costs}</tbody></table>` : `<div class="empty">No other costs.</div>`}
</div>

<table class="totals">
  <tr><td>Material (net)</td><td class="num">${money(s.netMaterialCost)}</td></tr>
  <tr><td>Labour</td><td class="num">${money(s.labourCost)}</td></tr>
  <tr><td>Transport</td><td class="num">${money(s.transportCost)}</td></tr>
  <tr><td>Other</td><td class="num">${money(s.otherCost)}</td></tr>
  <tr class="grand"><td>Total cost (BDT)</td><td class="num">${money(s.totalCost)}</td></tr>
</table>
${margin}
<div class="foot"><span>StockBook · printed by ${esc(opts.printedBy)} · ${esc(opts.printedAt)}</span><span>${esc(p.code)}</span></div>
</body></html>`;
}
