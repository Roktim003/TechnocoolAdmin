import ExcelJS from "exceljs";
import { formatDateTime } from "@/shared/time/format";
import type { ReferenceLists, SheetRow, Spreadsheet } from "../application/ports";
import { IMPORT_COLUMNS, normalizeHeader, type ImportColumn } from "../application/import-columns";
import type { Product } from "../domain/types";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
const REQUIRED_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FF161616" } };

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

function columns(includeCost: boolean): ImportColumn[] {
  return IMPORT_COLUMNS.filter((c) => includeCost || !c.costOnly);
}

async function toBytes(wb: ExcelJS.Workbook): Promise<Uint8Array> {
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

export const excelSpreadsheet: Spreadsheet = {
  /** Reads the first worksheet: row 1 is headers; empty rows are skipped. */
  async readRows(bytes) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const headers: Record<number, string> = {};
    ws.getRow(1).eachCell((cell, col) => {
      const h = cellValue(cell);
      if (h !== null) headers[col] = normalizeHeader(String(h));
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

  async buildTemplate(lists: ReferenceLists, includeCost) {
    const wb = new ExcelJS.Workbook();
    wb.creator = "StockBook";
    const ws = wb.addWorksheet("Products", { views: [{ state: "frozen", ySplit: 1 }] });
    const cols = columns(includeCost);
    ws.columns = cols.map((c) => ({ header: c.required ? `${c.header} *` : c.header, key: c.key, width: c.width }));
    ws.getRow(1).eachCell((cell, i) => {
      cell.fill = HEADER_FILL;
      cell.font = cols[i - 1]!.required ? REQUIRED_FONT : { bold: true, color: { argb: "FF525252" } };
    });

    const example: Record<string, string | number> = Object.fromEntries(cols.map((c) => [c.key, c.example]));
    if (lists.catalogs[0] && !lists.catalogs.includes(String(example.catalog))) example.catalog = lists.catalogs[0];
    if (lists.categories[0] && !lists.categories.includes(String(example.category))) example.category = lists.categories[0];
    if (lists.units[0] && !lists.units.includes(String(example.unit))) example.unit = lists.units[0];
    ws.addRow(example);

    // Lists sheet with the valid values, referenced by dropdowns on the Products sheet.
    const lw = wb.addWorksheet("Lists");
    const listCols: [string, string[]][] = [
      ["Catalogs (brands)", lists.catalogs],
      ["Categories", lists.categories],
      ["Units", lists.units],
      ["Source", ["Imported", "Local"]],
      ["Yes / No", ["Yes", "No"]],
    ];
    lw.columns = listCols.map(([h]) => ({ header: h, width: 24 }));
    lw.getRow(1).eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = REQUIRED_FONT;
    });
    listCols.forEach(([, values], ci) => values.forEach((v, ri) => (lw.getCell(ri + 2, ci + 1).value = v)));

    const listRef: Record<NonNullable<ImportColumn["list"]>, number> = { catalogs: 0, categories: 1, units: 2, source: 3, yesno: 4 };
    cols.forEach((c, i) => {
      if (!c.list) return;
      const li = listRef[c.list];
      const count = Math.max(1, listCols[li]![1].length);
      const letter = String.fromCharCode(65 + li);
      for (let r = 2; r <= 1001; r++) {
        ws.getCell(r, i + 1).dataValidation = {
          type: "list",
          allowBlank: !c.required,
          formulae: [`Lists!$${letter}$2:$${letter}$${count + 1}`],
          showErrorMessage: true,
          errorTitle: c.header,
          error: "Choose a value from the list (see the Lists sheet).",
        };
      }
    });
    return toBytes(wb);
  },

  async buildExport(products: Product[], includeCost) {
    const wb = new ExcelJS.Workbook();
    wb.creator = "StockBook";
    const ws = wb.addWorksheet("Products", { views: [{ state: "frozen", ySplit: 1 }] });
    const cols = [...columns(includeCost), { key: "status", header: "Status", width: 14 }, { key: "updatedAt", header: "Last updated (Asia/Dhaka)", width: 22 }];
    ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    ws.getRow(1).eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = REQUIRED_FONT;
    });
    for (const p of products) {
      ws.addRow({
        code: p.code,
        name: p.name,
        catalog: p.catalog.name,
        model: p.model,
        category: p.category.name,
        unit: p.unit.code,
        ...(includeCost ? { purchaseCost: Number(p.purchaseCost) } : {}),
        sellingPrice: Number(p.sellingPrice),
        purchaseUnit: p.purchaseUnit?.code ?? null,
        purchaseUnitFactor: p.purchaseUnitFactor === null ? null : Number(p.purchaseUnitFactor),
        minStockLevel: p.minStockLevel === null ? null : Number(p.minStockLevel),
        barcode: p.barcode,
        trackSerial: p.trackSerial ? "Yes" : "No",
        warrantyMonths: p.warrantyMonths,
        defaultSupplierName: p.defaultSupplier?.name ?? p.defaultSupplierName,
        source: p.source === "IMPORTED" ? "Imported" : p.source === "LOCAL" ? "Local" : null,
        countryOfOrigin: p.countryOfOrigin,
        hsCode: p.hsCode,
        capacity: p.capacity,
        refrigerant: p.refrigerant,
        powerSupply: p.powerSupply,
        dimensionsWeight: p.dimensionsWeight,
        specifications: p.specifications,
        status: p.status === "ACTIVE" ? "Active" : "Discontinued",
        updatedAt: formatDateTime(p.updatedAt),
      });
    }
    for (const key of ["purchaseCost", "sellingPrice"]) {
      if (cols.some((c) => c.key === key)) ws.getColumn(key).numFmt = "#,##0.00";
    }
    return toBytes(wb);
  },
};
