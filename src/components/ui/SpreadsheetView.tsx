"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { Workbook, Worksheet, Cell as XlsxCell } from "exceljs";
import styles from "./SpreadsheetView.module.css";

/** Rows rendered per sheet; bigger files are still downloadable in full. */
const MAX_ROWS = 2000;

interface ViewCell {
  text: string;
  numeric: boolean;
  bold: boolean;
  italic: boolean;
  size?: number;
  color?: string;
  background?: string;
  colSpan: number;
  rowSpan: number;
}

interface ViewSheet {
  name: string;
  widths: number[];
  rows: (ViewCell | null)[][]; // null = covered by a merged cell
  totalRows: number;
  headerRow: number; // frozen header row (1-based), 0 = none
}

/**
 * Read-only preview of an .xlsx file in the page: column letters, row numbers, gridlines,
 * merged cells, bold / filled headers, number and date formats, one tab per sheet.
 * ExcelJS is loaded on demand, only when a spreadsheet is opened.
 */
export function SpreadsheetView({ blob, printRef }: { blob: Blob; printRef?: MutableRefObject<(() => void) | null> }) {
  const [sheets, setSheets] = useState<ViewSheet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const mod = await import("exceljs");
        const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
        const wb: Workbook = new ExcelJS.Workbook();
        await wb.xlsx.load(await blob.arrayBuffer());
        if (live) setSheets(wb.worksheets.filter((ws) => ws.state !== "hidden" && ws.state !== "veryHidden").map(readSheet));
      } catch {
        if (live) setError("This spreadsheet can't be shown here. Download it to open it in Excel.");
      }
    })();
    return () => {
      live = false;
    };
  }, [blob]);

  const sheet = sheets?.[active];

  useEffect(() => {
    if (!printRef) return;
    printRef.current = () => {
      if (tableRef.current && sheet) printTable(tableRef.current.outerHTML, sheet.name);
    };
    return () => {
      printRef.current = null;
    };
  }, [printRef, sheet]);

  if (error) return <div className={styles.message}>{error}</div>;
  if (!sheets || !sheet) return <div className={styles.message}>Opening spreadsheet…</div>;

  const colCount = sheet.widths.length;
  return (
    // Always light, like the Excel file itself (its cell colours assume white paper).
    <div className={styles.book} data-theme="light">
      <div className={styles.scroller}>
        <table ref={tableRef} className={styles.grid} style={{ width: 44 + sheet.widths.reduce((a, b) => a + b, 0) }}>
          <colgroup>
            <col style={{ width: 44 }} />
            {sheet.widths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className={styles.corner} aria-hidden />
              {Array.from({ length: colCount }, (_, i) => (
                <th key={i} className={styles.colHead} scope="col">
                  {colName(i + 1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={r} className={r + 1 === sheet.headerRow ? styles.frozen : undefined}>
                <th className={styles.rowHead} scope="row">
                  {r + 1}
                </th>
                {row.map((c, i) =>
                  c === null ? null : (
                    <td
                      key={i}
                      colSpan={c.colSpan > 1 ? c.colSpan : undefined}
                      rowSpan={c.rowSpan > 1 ? c.rowSpan : undefined}
                      className={c.numeric ? styles.num : undefined}
                      style={{
                        fontWeight: c.bold ? 600 : undefined,
                        fontStyle: c.italic ? "italic" : undefined,
                        fontSize: c.size && c.size !== 11 ? `${Math.round((c.size / 11) * 100)}%` : undefined,
                        color: c.color,
                        background: c.background,
                      }}
                      title={c.text.length > 24 ? c.text : undefined}
                    >
                      {c.text}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.footer}>
        <div className={styles.tabs} role="tablist" aria-label="Sheets">
          {sheets.map((s, i) => (
            <button key={s.name + i} type="button" role="tab" aria-selected={i === active} className={`${styles.tab} ${i === active ? styles.tabOn : ""}`} onClick={() => setActive(i)}>
              {s.name}
            </button>
          ))}
        </div>
        <span className={styles.count}>{sheet.totalRows > MAX_ROWS ? `Showing the first ${MAX_ROWS.toLocaleString("en-US")} of ${sheet.totalRows.toLocaleString("en-US")} rows — download for the full file` : `${sheet.totalRows.toLocaleString("en-US")} rows`}</span>
      </div>
    </div>
  );
}

/* ───────────────────────────── reading ───────────────────────────── */

function readSheet(ws: Worksheet): ViewSheet {
  const totalRows = ws.rowCount;
  const shownRows = Math.min(totalRows, MAX_ROWS);
  const colCount = Math.max(1, ws.columnCount);
  const widths = Array.from({ length: colCount }, (_, i) => Math.round(((ws.getColumn(i + 1).width ?? 10) * 7 + 5)));

  // Merges ("A1:F1") → spans on the top-left cell; the rest are covered.
  const spans = new Map<string, { rowSpan: number; colSpan: number }>();
  const covered = new Set<string>();
  const merges = ((ws as unknown as { model?: { merges?: string[] } }).model?.merges ?? []) as string[];
  for (const m of merges) {
    const [a, b] = m.split(":");
    if (!a || !b) continue;
    const s = parseRef(a);
    const e = parseRef(b);
    spans.set(`${s.r}:${s.c}`, { rowSpan: e.r - s.r + 1, colSpan: e.c - s.c + 1 });
    for (let r = s.r; r <= e.r; r++) for (let c = s.c; c <= e.c; c++) if (r !== s.r || c !== s.c) covered.add(`${r}:${c}`);
  }

  const rows: (ViewCell | null)[][] = [];
  for (let r = 1; r <= shownRows; r++) {
    const row = ws.getRow(r);
    const out: (ViewCell | null)[] = [];
    for (let c = 1; c <= colCount; c++) {
      if (covered.has(`${r}:${c}`)) {
        out.push(null);
        continue;
      }
      const span = spans.get(`${r}:${c}`);
      out.push(readCell(row.getCell(c), span?.colSpan ?? 1, span?.rowSpan ?? 1));
    }
    rows.push(out);
  }

  const view = ws.views?.[0] as { state?: string; ySplit?: number } | undefined;
  const headerRow = view?.state === "frozen" && view.ySplit ? view.ySplit : 0;
  return { name: ws.name, widths, rows, totalRows, headerRow };
}

function readCell(cell: XlsxCell, colSpan: number, rowSpan: number): ViewCell {
  const { text, numeric } = display(cell);
  const font = cell.font ?? {};
  const fill = cell.fill as { type?: string; fgColor?: { argb?: string } } | undefined;
  return {
    text,
    numeric,
    bold: !!font.bold,
    italic: !!font.italic,
    size: font.size,
    color: argb(font.color?.argb),
    background: fill?.type === "pattern" ? argb(fill.fgColor?.argb) : undefined,
    colSpan,
    rowSpan,
  };
}

function display(cell: XlsxCell): { text: string; numeric: boolean } {
  let v: unknown = cell.value;
  if (v && typeof v === "object" && "result" in (v as object)) v = (v as { result: unknown }).result;
  if (v && typeof v === "object" && "richText" in (v as object)) return { text: (v as { richText: { text: string }[] }).richText.map((t) => t.text).join(""), numeric: false };
  if (v && typeof v === "object" && "text" in (v as object)) return { text: String((v as { text: unknown }).text), numeric: false };
  if (v === null || v === undefined) return { text: "", numeric: false };
  if (v instanceof Date) return { text: formatDate(v, cell.numFmt), numeric: false };
  if (typeof v === "number") return { text: formatNumber(v, cell.numFmt), numeric: true };
  if (typeof v === "boolean") return { text: v ? "TRUE" : "FALSE", numeric: false };
  return { text: String(v), numeric: false };
}

/** Covers the formats the exports use: #,##0 · #,##0.00 · #,##0.0## · …"%". */
function formatNumber(n: number, fmt?: string): string {
  if (!fmt || fmt === "General") return String(n);
  const pct = /"%"\s*$/.test(fmt) || /%$/.test(fmt);
  const core = fmt.replace(/"[^"]*"/g, "").replace(/%/g, "").split(";")[0] ?? "";
  const [, dec = ""] = core.split(".");
  const min = (dec.match(/0/g) ?? []).length;
  const max = min + (dec.match(/#/g) ?? []).length;
  const text = new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: core.includes(",") }).format(n);
  return pct ? `${text}%` : text;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Dates are stored as wall-clock time, so read them in UTC. */
function formatDate(d: Date, fmt?: string): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${p(d.getUTCDate())}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
  return fmt && /h/.test(fmt) ? `${date} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : date;
}

function argb(v?: string): string | undefined {
  if (!v || v.length < 6) return undefined;
  const hex = v.length === 8 ? v.slice(2) : v;
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : undefined;
}

function parseRef(ref: string): { r: number; c: number } {
  const m = /^([A-Z]+)(\d+)$/i.exec(ref.replace(/\$/g, ""));
  if (!m) return { r: 0, c: 0 };
  let c = 0;
  for (const ch of m[1]!.toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]), c };
}

function colName(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/* ───────────────────────────── printing ───────────────────────────── */

const PRINT_CSS = `
  @page { size: landscape; margin: 12mm; }
  body { margin: 0; font: 10px/1.35 "IBM Plex Sans", Arial, sans-serif; color: #161616; }
  h1 { font-size: 13px; margin: 0 0 8px; }
  table { border-collapse: collapse; table-layout: fixed; width: 100% !important; }
  col:first-child, thead, th[scope="row"] { display: none; }
  td { border: 1px solid #d0d0d0; padding: 3px 5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  td[class] { text-align: right; font-variant-numeric: tabular-nums; }
  tr { break-inside: avoid; }
`;

function printTable(tableHtml: string, title: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.append(frame);
  const doc = frame.contentDocument;
  if (!doc) return frame.remove();
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head><body>${tableHtml}</body></html>`);
  doc.close();
  const w = frame.contentWindow;
  setTimeout(() => {
    w?.focus();
    w?.print();
    setTimeout(() => frame.remove(), 1000);
  }, 50);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
