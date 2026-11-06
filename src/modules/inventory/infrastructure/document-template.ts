import { LOGO_DATA_URI } from "@/shared/brand/logo-data";
import type { DocumentKind } from "../application/dto";
import type { EntryRecord } from "../application/ports";
import { EMPTY_SHIPMENT, IMPORT_DOC_META, IMPORT_DOC_TYPES, type AttachmentDocType, type ImportDocType, type ImportShipmentData } from "../domain/import-docs";
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

/** An attached file of an import document (only the name is printed). */
export interface ImportFileRef {
  docType: AttachmentDocType;
  fileName: string;
}

/**
 * GRN (Imported): number, date and key details of each of the five shipment documents, with the
 * names of the files attached to it. The CI value is a cost: printed only with `showCost`.
 */
function shipmentBlock(s: ImportShipmentData | null, files: ImportFileRef[], showCost: boolean): string {
  const sh = s ?? EMPTY_SHIPMENT;
  const join = (parts: (string | null | false | undefined)[]) => parts.filter(Boolean).join(" · ");
  const details: Record<ImportDocType, string> = {
    BL: join([sh.shippingLine, sh.vesselVoyage, sh.portOfLoading || sh.portOfDischarge ? `${sh.portOfLoading ?? "—"} → ${sh.portOfDischarge ?? "—"}` : null, sh.containerNumbers.length ? `Containers: ${sh.containerNumbers.join(", ")}` : null]),
    CO: join([sh.countryOfOrigin ? `Origin: ${sh.countryOfOrigin}` : null, sh.coIssuingAuthority]),
    PL: join([sh.packageCount !== null ? `${sh.packageCount} packages` : null, sh.grossWeightKg ? `gross ${qty(sh.grossWeightKg)} kg` : null, sh.netWeightKg ? `net ${qty(sh.netWeightKg)} kg` : null]),
    CI: join([sh.incoterm, showCost && sh.ciValue !== null ? `Value ${[sh.ciCurrency, money(sh.ciValue)].filter(Boolean).join(" ")}` : null]),
    BOE: join([sh.customsStation]),
  };
  const dates: Record<ImportDocType, string | null> = { BL: sh.blDate, CO: sh.coDate, PL: sh.plDate, CI: sh.ciDate, BOE: sh.boeDate };
  const names = (t: AttachmentDocType) => files.filter((f) => f.docType === t).map((f) => esc(f.fileName));
  const row = (label: string, no: string | null, date: string | null, detail: string, fileNames: string[]) =>
    `<tr><td>${esc(label)}</td><td class="mono">${esc(no ?? "—")}</td><td>${esc(date ?? "—")}</td><td>${esc(detail || "—")}</td><td>${fileNames.length ? fileNames.join("<br>") : "—"}</td></tr>`;
  const rows = IMPORT_DOC_TYPES.map((t) => row(`${IMPORT_DOC_META[t].label} (${t === "BOE" ? "B/E" : t})`, sh[IMPORT_DOC_META[t].numberField] as string | null, dates[t], details[t], names(t)));
  const other = names("OTHER");
  if (other.length) rows.push(row("Other documents", null, null, "", other));
  return `<h2 class="section">Shipment documents</h2>
<table class="lines docs">
  <thead><tr><th>Document</th><th>No.</th><th>Date</th><th>Details</th><th>Files attached</th></tr></thead>
  <tbody>${rows.join("")}</tbody>
</table>`;
}

/**
 * Printable HTML for an entry. `showCost` follows the requester's seeCost flag; challans
 * never show prices. Amounts are written as "BDT" (the taka sign isn't in every PDF font).
 * GRN (Imported) also prints a "Shipment documents" block (`importFiles`: its import-document
 * attachments) and the country of origin per line.
 */
export function renderDocumentHtml(e: EntryRecord, kind: DocumentKind, opts: { showCost: boolean; companyName: string; printedBy: string; printedAt: string; importFiles?: ImportFileRef[] }): string {
  const title = DOCUMENT_TITLES[kind];
  const isChallan = kind === "DELIVERY_CHALLAN" || kind === "TRANSFER_CHALLAN";
  const isSale = kind === "SALES_INVOICE";
  const priced = !isChallan && (isSale || opts.showCost);
  const isImport = e.type === "GRN_IMPORT";
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
    // GRN (Imported): the B/E is printed in the Shipment documents block instead.
    ["Bill of Entry", isImport ? null : e.billOfEntryNo],
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
        isImport ? `<td>${esc(l.countryOfOrigin ?? e.importShipment?.countryOfOrigin ?? "—")}</td>` : ""
      }${
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
  .brand { display: flex; align-items: center; gap: 10px; }
  .logo { width: 46px; height: 46px; flex: none; border-radius: 4px; }
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
  h2.section { font-size: 12px; font-weight: 600; margin: 18px 0 0; }
  .docs td { font-size: 10px; }
  .notes { margin-top: 14px; white-space: pre-wrap; }
  .sign { display: flex; justify-content: space-between; margin-top: 60px; }
  .sign div { width: 30%; border-top: 1px solid #161616; padding-top: 4px; text-align: center; color: #525252; }
  .foot { position: fixed; bottom: 0; left: 0; right: 0; font-size: 8px; color: #8d8d8d; display: flex; justify-content: space-between; }
  .watermark { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 72px; color: rgba(218,30,40,.12); transform: rotate(-20deg); font-weight: 600; }
</style></head>
<body>
${statusNote}
<div class="head">
  <div class="brand"><img class="logo" src="${LOGO_DATA_URI}" alt=""><div><div class="company">${esc(opts.companyName)}</div><div>${esc(e.warehouse.name)}</div></div></div>
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
  <thead><tr><th>#</th><th>Code</th><th>Item</th><th class="num">Qty</th>${isImport ? "<th>Origin</th>" : ""}${priced ? `<th class="num">${priceHead} (BDT)</th><th class="num">Amount (BDT)</th>` : ""}</tr></thead>
  <tbody>${rows}</tbody>
</table>
${totals ? `<table class="totals">${totals}</table>` : ""}
${isImport ? shipmentBlock(e.importShipment, opts.importFiles ?? [], opts.showCost) : ""}
${e.description || e.notes ? `<div class="notes">${esc([e.description, e.notes].filter(Boolean).join("\n"))}</div>` : ""}
<div class="sign"><div>Prepared by<br>${esc(e.createdBy.name)}</div><div>${isChallan ? "Received by" : "Checked by"}${e.verifiedBy ? `<br>${esc(e.verifiedBy.name)}` : ""}</div><div>Authorised signature</div></div>
<div class="foot"><span>TechnoCool Inventory · printed by ${esc(opts.printedBy)} · ${esc(opts.printedAt)}</span><span>${esc(e.number ?? e.draftRef)}</span></div>
</body></html>`;
}
