import type { CountRecord } from "../application/count.service";

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const qty = (v: string | null) => (v === null ? "" : v.includes(".") ? v.replace(/\.?0+$/, "") : v);

/**
 * Printable count sheet. Lines already counted in the app print their count, the serials found,
 * the note and who counted them; the rest stay blank for writing on paper.
 * Blind counts never print the system quantity or the expected serials.
 */
export function renderCountSheetHtml(c: CountRecord, opts: { showSystem: boolean; companyName: string; printedBy: string; printedAt: string }): string {
  const countedLines = c.lines.filter((l) => l.countedQty !== null || l.notCounted).length;
  const rows = c.lines
    .map((l, i) => {
      const done = l.countedQty !== null || l.notCounted;
      // Serials the counters scanned (never the MISSING ones: those are expected serials).
      const found = l.serials.filter((s) => s.result !== "MISSING").map((s) => esc(s.serial));
      const notes = [found.length ? `Serials: ${found.join(", ")}` : "", l.note ? esc(l.note) : "", done && l.countedBy ? `<span class="by">by ${esc(l.countedBy.name)}</span>` : ""].filter(Boolean).join("<br>");
      return `<tr>
  <td class="idx">${i + 1}</td>
  <td class="mono">${esc(l.product.code)}</td>
  <td>${esc(l.product.name)}${l.condition === "DAMAGED" ? " <b>(damaged)</b>" : ""}${l.product.trackSerial ? `<div class="hint">Serial-tracked: write each serial found${opts.showSystem && l.serials.length ? `. Expected: ${l.serials.filter((s) => s.result !== "UNEXPECTED").map((s) => esc(s.serial)).join(", ")}` : ""}</div>` : ""}</td>
  <td>${esc(l.product.unitCode)}</td>
  ${opts.showSystem ? `<td class="num">${qty(l.systemQty)}</td>` : ""}
  <td class="num count">${done ? (l.notCounted ? `0 <span class="by">(not counted)</span>` : qty(l.countedQty)) : ""}</td>
  <td class="note">${notes}</td>
</tr>`;
    })
    .join("");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Count sheet ${esc(c.number)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  body { font-family: "IBM Plex Sans", "Segoe UI", Arial, sans-serif; font-size: 10.5px; color: #161616; margin: 0; }
  .head { display: flex; justify-content: space-between; border-bottom: 2px solid #161616; padding-bottom: 8px; }
  .company { font-size: 15px; font-weight: 600; }
  h1 { font-size: 19px; font-weight: 400; margin: 0; text-align: right; }
  .no { font-family: "IBM Plex Mono", Consolas, monospace; text-align: right; margin-top: 4px; }
  .meta { display: flex; gap: 28px; margin: 10px 0; }
  .meta span { display: block; font-size: 9px; color: #525252; text-transform: uppercase; }
  /* One even grid: every cell has the same thin border, outer edge included. */
  table { width: 100%; border-collapse: collapse; border: 1px solid #8d8d8d; }
  th, td { border: 1px solid #a8a8a8; padding: 7px 6px; vertical-align: top; }
  th { background: #e0e0e0; text-align: left; font-weight: 600; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  .idx { width: 18px; text-align: right; color: #525252; }
  .num { text-align: right; }
  .mono { font-family: "IBM Plex Mono", Consolas, monospace; white-space: nowrap; }
  .count { width: 70px; font-weight: 600; font-size: 12px; }
  .note { width: 170px; }
  .by { font-weight: 400; font-size: 9px; color: #525252; }
  .hint { color: #525252; font-size: 9px; margin-top: 2px; }
  .blind { margin: 8px 0; padding: 6px 8px; background: #fff1f1; border-left: 3px solid #da1e28; }
  .sign { display: flex; justify-content: space-between; margin-top: 40px; }
  .sign div { width: 30%; border-top: 1px solid #161616; padding-top: 4px; text-align: center; color: #525252; }
  .foot { position: fixed; bottom: 0; left: 0; right: 0; font-size: 8px; color: #8d8d8d; display: flex; justify-content: space-between; }
</style></head>
<body>
<div class="head"><div><div class="company">${esc(opts.companyName)}</div><div>${esc(c.warehouse.name)}</div></div><div><h1>Stock count sheet</h1><div class="no">${esc(c.number)}</div></div></div>
<div class="meta">
  <div><span>Warehouse</span>${esc(c.warehouse.name)}</div>
  <div><span>Scope</span>${esc(c.scope.replace(/_/g, " ").toLowerCase())}</div>
  <div><span>Started</span>${esc(c.startedAt ? c.startedAt.toISOString().slice(0, 10) : "not started")}</div>
  <div><span>Lines</span>${c.lines.length}</div>
  <div><span>Counted</span>${countedLines} of ${c.lines.length}</div>
</div>
${c.blindCount && !opts.showSystem ? `<div class="blind">Blind count: count what is on the shelf; system quantities are not shown.</div>` : ""}
<table>
  <thead><tr><th>#</th><th>Code</th><th>Item</th><th>Unit</th>${opts.showSystem ? `<th class="num">System qty</th>` : ""}<th class="num">Counted</th><th>Serials / note</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="sign"><div>Counted by</div><div>Checked by</div><div>Approved by</div></div>
<div class="foot"><span>StockBook · printed by ${esc(opts.printedBy)} · ${esc(opts.printedAt)}</span><span>${esc(c.number)}</span></div>
</body></html>`;
}
