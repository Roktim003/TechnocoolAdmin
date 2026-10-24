import ExcelJS from "exceljs";
import { formatDateTime } from "@/shared/time/format";
import type { LowStockRow } from "../application/alerts.service";
import { headerKey, OPENING_COLUMNS, type OpeningSheets, type SheetRow } from "../application/opening.service";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
const BOLD: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FF161616" } };

function cellValue(cell: ExcelJS.Cell): string | number | boolean | null {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return (v.result as string | number | boolean | null | undefined) ?? null;
    if ("text" in v) return String(v.text);
  }
  return String(v);
}

const header = (ws: ExcelJS.Worksheet) =>
  ws.getRow(1).eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = BOLD;
  });

const bytes = async (wb: ExcelJS.Workbook) => new Uint8Array(await wb.xlsx.writeBuffer());

export const openingSheets: OpeningSheets = {
  async template(warehouses, products) {
    const wb = new ExcelJS.Workbook();
    wb.creator = "StockBook";
    const ws = wb.addWorksheet("Opening stock", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = OPENING_COLUMNS.map((c) => ({ header: c.required ? `${c.header} *` : c.header, key: c.key, width: c.width }));
    header(ws);
    ws.getColumn("unitcostbdt").numFmt = "#,##0.00##";

    const lw = wb.addWorksheet("Lists");
    lw.columns = [
      { header: "Warehouse code", width: 16 },
      { header: "Warehouse", width: 24 },
      { header: "", width: 4 },
      { header: "Product code", width: 22 },
      { header: "Product", width: 40 },
      { header: "Unit", width: 8 },
      { header: "Serial numbers?", width: 16 },
      { header: "", width: 4 },
      { header: "Condition", width: 12 },
    ];
    header(lw);
    warehouses.forEach((w, i) => {
      lw.getCell(i + 2, 1).value = w.code;
      lw.getCell(i + 2, 2).value = w.name;
    });
    products.forEach((p, i) => {
      lw.getCell(i + 2, 4).value = p.code;
      lw.getCell(i + 2, 5).value = p.name;
      lw.getCell(i + 2, 6).value = p.unitCode;
      lw.getCell(i + 2, 7).value = p.trackSerial ? "Required" : "—";
    });
    lw.getCell(2, 9).value = "GOOD";
    lw.getCell(3, 9).value = "DAMAGED";

    // Instructions and an example live on their own sheet, so nothing sample-like is ever imported.
    const hw = wb.addWorksheet("Help");
    hw.columns = [{ width: 110 }];
    const sample = products.find((p) => !p.trackSerial) ?? products[0];
    [
      "How to fill the Opening stock sheet",
      "• One row per product, warehouse and condition. Rows that repeat the same product, warehouse, condition AND unit cost are added together (with a warning); a different cost is an error.",
      "• Warehouse code and Product code: use the codes on the Lists sheet. Condition: GOOD (default) or DAMAGED.",
      "• Quantity > 0 (up to 3 decimals). Serial-tracked products need whole numbers and exactly that many serial numbers, comma-separated.",
      "• Unit cost (BDT) is required; 0 is allowed. It becomes the product's average cost.",
      "• Nothing is posted until you press “Import and post” after a clean validation. Then one Opening stock entry is posted per warehouse.",
      "",
      `Example row:  ${warehouses[0]?.code ?? "A"} | ${sample?.code ?? "PRODUCT-CODE"} | GOOD | 10 | 52000 | (serials, if tracked) | Shelf 3`,
    ].forEach((t, i) => {
      hw.getCell(i + 1, 1).value = t;
      if (i === 0) hw.getCell(1, 1).font = { bold: true, size: 13 };
    });

    const lists: [string, string][] = [
      ["warehousecode", `Lists!$A$2:$A$${Math.max(2, warehouses.length + 1)}`],
      ["productcode", `Lists!$D$2:$D$${Math.max(2, products.length + 1)}`],
      ["condition", "Lists!$I$2:$I$3"],
    ];
    for (const [key, ref] of lists) {
      const col = OPENING_COLUMNS.findIndex((c) => c.key === key) + 1;
      for (let r = 2; r <= 2001; r++) {
        ws.getCell(r, col).dataValidation = { type: "list", allowBlank: key === "condition", formulae: [ref], showErrorMessage: true, errorTitle: "Not in the list", error: "Choose a value from the Lists sheet." };
      }
    }
    return bytes(wb);
  },

  async readRows(data) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const headers: Record<number, string> = {};
    ws.getRow(1).eachCell((cell, col) => {
      const h = cellValue(cell);
      if (h !== null) headers[col] = headerKey(String(h));
    });
    const rows: SheetRow[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const values: SheetRow["values"] = {};
      let any = false;
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const key = headers[col];
        if (!key) return;
        const v = cellValue(cell);
        if (v !== null && String(v).trim() !== "") any = true;
        values[key] = v;
      });
      if (any) rows.push({ rowNumber, values });
    });
    return rows;
  },
};

/** Low-stock list as .xlsx (the same columns as the screen). */
export async function lowStockWorkbook(rows: LowStockRow[], warehouseCodes: string[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "StockBook";
  const ws = wb.addWorksheet("Low stock", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Code", key: "code", width: 20 },
    { header: "Product", key: "name", width: 40 },
    { header: "Brand", key: "catalog", width: 14 },
    { header: "Category", key: "category", width: 16 },
    { header: "Unit", key: "unit", width: 8 },
    ...warehouseCodes.map((c) => ({ header: `Available ${c}`, key: `wh_${c}`, width: 13 })),
    { header: "Total available", key: "total", width: 15 },
    { header: "Minimum", key: "min", width: 11 },
    { header: "Short by", key: "short", width: 11 },
    { header: "Suggested reorder", key: "suggested", width: 17 },
  ];
  header(ws);
  for (const r of rows) {
    const row = ws.addRow({
      code: r.product.code,
      name: r.product.name,
      catalog: r.product.catalogName,
      category: r.product.categoryName,
      unit: r.product.unitCode,
      ...Object.fromEntries(r.warehouses.map((w) => [`wh_${w.code}`, Number(w.available)])),
      total: Number(r.totalAvailable),
      min: Number(r.minStockLevel),
      short: Number(r.shortBy),
      suggested: Number(r.suggestedQty),
    });
    row.getCell("short").font = { color: { argb: "FFDA1E28" }, bold: true };
  }
  ws.addRow([]);
  ws.addRow([`Exported ${formatDateTime(new Date())} (Asia/Dhaka). Available = good stock on hand minus reserved.`]);
  return bytes(wb);
}
