import { readFileSync } from "node:fs";
import { join } from "node:path";
import { htmlToPdf } from "@/modules/inventory/infrastructure/pdf";
import { formatCell, formatDateValue, isNegative } from "../domain/format";
import type { ReportFileInput } from "../application/ports";
import { chartSvg } from "./svg-chart";

/**
 * PDF export: an HTML page rendered by headless Chromium in the worker. IBM Plex Sans is embedded
 * (the page loads nothing from the network); the table header repeats on every page and the footer
 * carries "Page x of y" and the generated time.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let fontCss: string | null = null;
function fonts(): string {
  if (fontCss !== null) return fontCss;
  try {
    const dir = join(process.cwd(), "node_modules", "@fontsource", "ibm-plex-sans", "files");
    const face = (weight: number) =>
      `@font-face{font-family:"IBM Plex Sans";font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${readFileSync(join(dir, `ibm-plex-sans-latin-${weight}-normal.woff2`)).toString("base64")}) format("woff2");}`;
    fontCss = face(400) + face(600);
  } catch {
    fontCss = ""; // falls back to the system sans-serif
  }
  return fontCss;
}

export async function reportHtml(input: ReportFileInput): Promise<string> {
  const cols = input.columns;
  const body: string[] = [];
  for await (const chunk of input.rows()) {
    for (const r of chunk) {
      body.push(
        `<tr>${cols
          .map((c) => {
            const v = r[c.key];
            const cls = [c.align === "end" ? "num" : "", c.negativeRed && isNegative(v) ? "neg" : ""].filter(Boolean).join(" ");
            return `<td${cls ? ` class="${cls}"` : ""}>${esc(formatCell(c, v))}</td>`;
          })
          .join("")}</tr>`,
      );
    }
  }

  const tiles = input.totalDefs
    .map((t) => `<div class="tile"><span>${esc(t.label)}</span><b>${t.type === "money" ? "BDT " : ""}${esc(formatCell(t, input.totals[t.key]))}</b></div>`)
    .join("");
  const totalsRow = input.totalDefs.some((t) => cols.some((c) => c.key === t.key))
    ? `<tfoot><tr>${cols
        .map((c, i) => {
          const t = input.totalDefs.find((x) => x.key === c.key);
          return `<td class="${c.align === "end" ? "num" : ""}">${t ? esc(formatCell(t, input.totals[t.key])) : i === 0 ? "Total" : ""}</td>`;
        })
        .join("")}</tr></tfoot>`
    : "";
  const filters = input.filters.length ? input.filters.map((f) => `<span><em>${esc(f.label)}:</em> ${esc(f.value)}</span>`).join("") : "<span>No filters</span>";
  const chart = input.chart ? `<section class="chart"><h2>${esc(input.chart.title)}</h2>${chartSvg(input.chart)}</section>` : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(input.meta.title)}</title><style>
  ${fonts()}
  @page { size: A4 ${input.meta.landscape ? "landscape" : "portrait"}; }
  * { box-sizing: border-box; }
  body { font-family: "IBM Plex Sans", "Segoe UI", Arial, sans-serif; font-size: 9.5px; color: #161616; margin: 0; }
  header { border-bottom: 2px solid #161616; padding-bottom: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-end; }
  .company { font-size: 14px; font-weight: 600; }
  h1 { font-size: 18px; font-weight: 400; margin: 2px 0 0; }
  .gen { font-size: 8.5px; color: #525252; text-align: right; }
  .filters { font-size: 8.5px; color: #525252; margin-bottom: 10px; display: flex; flex-wrap: wrap; gap: 4px 14px; }
  .filters em { font-style: normal; font-weight: 600; color: #161616; }
  .tiles { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .tile { border: 1px solid #e0e0e0; border-top: 3px solid #0f62fe; padding: 5px 8px; min-width: 110px; }
  .tile span { display: block; font-size: 8px; color: #525252; }
  .tile b { font-size: 12px; font-weight: 600; white-space: nowrap; }
  .chart { margin-bottom: 10px; page-break-inside: avoid; }
  h2 { font-size: 10.5px; font-weight: 600; margin: 0 0 4px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tfoot { display: table-row-group; }
  tr { page-break-inside: avoid; }
  th { background: #e0e0e0; text-align: left; padding: 4px 5px; font-weight: 600; font-size: 8.5px; }
  td { padding: 3px 5px; border-bottom: 1px solid #e0e0e0; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .neg { color: #da1e28; }
  tfoot td { font-weight: 600; border-top: 2px solid #161616; border-bottom: none; }
  .empty { padding: 16px; text-align: center; color: #525252; }
  .note { margin-top: 8px; font-size: 8.5px; color: #8a3800; }
  </style></head><body>
  <header><div><div class="company">StockBook${input.companyName && input.companyName !== "StockBook" ? ` · ${esc(input.companyName)}` : ""}</div><h1>${esc(input.meta.title)}</h1></div>
  <div class="gen">Generated ${esc(formatDateValue(input.generatedAt.toISOString(), true))} (Asia/Dhaka)<br>by ${esc(input.generatedBy)}</div></header>
  <div class="filters">${filters}</div>
  ${tiles ? `<div class="tiles">${tiles}</div>` : ""}
  ${chart}
  <table><thead><tr>${cols.map((c) => `<th class="${c.align === "end" ? "num" : ""}">${esc(c.label)}</th>`).join("")}</tr></thead>
  <tbody>${body.length ? body.join("") : `<tr><td class="empty" colspan="${Math.max(1, cols.length)}">No rows for these filters.</td></tr>`}</tbody>${body.length ? totalsRow : ""}</table>
  ${input.truncatedAt ? `<p class="note">The PDF shows the first ${input.truncatedAt.toLocaleString("en-IN")} rows; export to Excel for all of them. Totals cover every row.</p>` : ""}
  </body></html>`;
}

export async function writePdf(input: ReportFileInput): Promise<Uint8Array> {
  const html = await reportHtml(input);
  const generated = esc(formatDateValue(input.generatedAt.toISOString(), true));
  const footerTemplate = `<div style="font-family:Arial,sans-serif;font-size:7px;color:#8d8d8d;width:100%;padding:0 12mm;display:flex;justify-content:space-between;"><span>${esc(input.meta.title)} · generated ${generated}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
  return htmlToPdf(html, { landscape: input.meta.landscape, footerTemplate, margin: { top: "12mm", right: "12mm", bottom: "14mm", left: "12mm" } });
}
