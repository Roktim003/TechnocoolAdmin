import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import { formatDateValue } from "../domain/format";
import type { ColumnDef, TotalDef } from "../domain/types";
import type { ReportFileInput } from "../application/ports";

/**
 * Streamed Excel export (ExcelJS WorkbookWriter: rows are committed as they arrive, so 100k rows
 * never sit in memory as cell objects). Layout: a five-row header block, the column header on row
 * 6 (bold, light gray, frozen, autofilter), the data, a totals row and a summary block. Columns the
 * viewer may not see were removed before this point — they are not in the file at all.
 */
export const HEADER_ROW = 6;

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
const DHAKA_OFFSET_MS = 6 * 3600_000;

export function numFmt(c: ColumnDef | TotalDef): string | undefined {
  if (c.type === "money") return "#,##0.00";
  if (c.type === "number") {
    const d = c.decimals ?? 3;
    const base = d === 0 ? "#,##0" : `#,##0.${"0".repeat(Math.min(d, 1))}${"#".repeat(Math.max(0, d - 1))}`;
    return c.percent ? `${base}"%"` : base;
  }
  if (c.type === "date") return "withTime" in c && c.withTime ? "dd-mmm-yyyy hh:mm" : "dd-mmm-yyyy";
  return undefined;
}

/** Excel has no time zones: date-times are written as Dhaka wall-clock time. */
export function cellValue(c: ColumnDef, v: unknown): ExcelJS.CellValue {
  if (v === null || v === undefined || v === "") return null;
  if (c.type === "money" || c.type === "number") {
    const n = Number(v);
    return Number.isFinite(n) ? n : String(v);
  }
  if (c.type === "date") {
    const s = String(v);
    if (c.withTime) return new Date(new Date(s).getTime() + DHAKA_OFFSET_MS);
    return new Date(`${s.slice(0, 10)}T00:00:00Z`);
  }
  if (c.type === "tag") return c.tags?.[String(v)]?.label ?? String(v);
  return String(v);
}

const totalValue = (t: TotalDef, v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export async function writeXlsx(input: ReportFileInput): Promise<Uint8Array> {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true, useSharedStrings: false });
  wb.creator = "StockBook";
  wb.created = input.generatedAt;

  const cols = input.columns;
  const width = Math.max(1, cols.length);
  const ws = wb.addWorksheet(input.meta.title.slice(0, 31).replace(/[\/?*[\]:]/g, " "), {
    views: [{ state: "frozen", ySplit: HEADER_ROW }],
    pageSetup: { orientation: input.meta.landscape ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  ws.columns = cols.map((c) => ({ key: c.key, width: c.width ?? Math.max(12, Math.min(40, c.label.length + 4)) }));

  const block = (text: string, font: Partial<ExcelJS.Font>) => {
    const row = ws.addRow([text]);
    row.getCell(1).font = font;
    if (width > 1) ws.mergeCells(row.number, 1, row.number, width);
    row.commit();
  };
  block(input.companyName && input.companyName !== "StockBook" ? `StockBook · ${input.companyName}` : "StockBook", { bold: true, size: 14 });
  block(input.meta.title, { bold: true, size: 12 });
  block(input.filters.length ? `Filters: ${input.filters.map((f) => `${f.label}: ${f.value}`).join(" · ")}` : "Filters: none", { size: 10, color: { argb: "FF525252" } });
  block(`Generated ${formatDateValue(input.generatedAt.toISOString(), true)} (Asia/Dhaka) by ${input.generatedBy}`, { size: 10, color: { argb: "FF525252" } });
  ws.addRow([]).commit();

  const header = ws.addRow(cols.map((c) => c.label));
  header.eachCell((cell, i) => {
    cell.font = { bold: true, color: { argb: "FF161616" } };
    cell.fill = HEADER_FILL;
    cell.border = { bottom: { style: "thin", color: { argb: "FF8D8D8D" } } };
    cell.alignment = { horizontal: cols[i - 1]?.align === "end" ? "right" : "left", vertical: "middle", wrapText: true };
  });
  header.commit();

  const fmts = cols.map(numFmt);
  let count = 0;
  for await (const chunk of input.rows()) {
    for (const r of chunk) {
      const row = ws.addRow(cols.map((c) => cellValue(c, r[c.key])));
      cols.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        if (fmts[i]) cell.numFmt = fmts[i]!;
        if (c.align === "end") cell.alignment = { horizontal: "right" };
        if (c.negativeRed && typeof cell.value === "number" && cell.value < 0) cell.font = { color: { argb: "FFDA1E28" } };
      });
      row.commit();
      count++;
    }
  }
  const lastDataRow = HEADER_ROW + count;
  ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: Math.max(HEADER_ROW, lastDataRow), column: width } };

  // Totals row: each total under the column of the same key.
  const totalsByKey = new Map(input.totalDefs.map((t) => [t.key, t]));
  if (input.totalDefs.length) {
    const row = ws.addRow(cols.map((c, i) => (totalsByKey.has(c.key) ? totalValue(totalsByKey.get(c.key)!, input.totals[c.key]) : i === 0 ? "Total" : null)));
    row.eachCell({ includeEmpty: true }, (cell, i) => {
      cell.font = { bold: true };
      cell.border = { top: { style: "thin", color: { argb: "FF161616" } } };
      const t = totalsByKey.get(cols[i - 1]?.key ?? "");
      if (t) cell.numFmt = numFmt(t)!;
    });
    row.commit();

    // Summary: every total (also those that are not a column, e.g. counts).
    ws.addRow([]).commit();
    const title = ws.addRow(["Summary"]);
    title.getCell(1).font = { bold: true };
    title.commit();
    for (const t of input.totalDefs) {
      const r = ws.addRow([t.label, totalValue(t, input.totals[t.key])]);
      r.getCell(2).numFmt = numFmt(t)!;
      r.getCell(2).alignment = { horizontal: "right" };
      r.commit();
    }
  }
  if (input.truncatedAt) ws.addRow([`Limited to the first ${input.truncatedAt.toLocaleString("en-IN")} rows.`]).commit();
  ws.commit();

  if (input.chart && input.chart.points.length) {
    const c = input.chart;
    const cs = wb.addWorksheet("Chart data", { views: [{ state: "frozen", ySplit: 2 }] });
    const series = c.series ?? [c.title];
    cs.columns = [{ width: 32 }, ...series.map(() => ({ width: 18 }))];
    const t = cs.addRow([c.title]);
    t.getCell(1).font = { bold: true, size: 12 };
    t.commit();
    const h = cs.addRow(["Label", ...series]);
    h.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = HEADER_FILL;
    });
    h.commit();
    const fmt = c.valueType === "money" ? "#,##0.00" : "#,##0.###";
    for (const p of c.points) {
      const r = cs.addRow([p.label, ...series.map((_, i) => Number(p.values[i] ?? 0))]);
      series.forEach((_, i) => (r.getCell(i + 2).numFmt = fmt));
      r.commit();
    }
    cs.commit();
  }

  await wb.commit();
  await done;
  return new Uint8Array(Buffer.concat(chunks));
}
