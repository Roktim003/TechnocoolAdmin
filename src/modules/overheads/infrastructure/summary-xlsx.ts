import ExcelJS from "exceljs";
import type { MonthlySummary } from "../application/warehouse-cost.service";

const num = (v: string | null) => (v === null ? null : Number(v));

/** The monthly overhead summary as an Excel workbook (one row per month and warehouse, plus the company row). */
export async function summaryWorkbook(s: { monthFrom: string; monthTo: string; months: MonthlySummary[] }, meta: { generatedBy: string; generatedAt: string }): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TechnoCool Inventory";
  const ws = wb.addWorksheet("Overheads by month");
  ws.addRow(["TechnoCool Inventory — Warehouse costs: monthly summary"]).font = { bold: true, size: 14 };
  ws.addRow([`Months ${s.monthFrom.slice(0, 7)} to ${s.monthTo.slice(0, 7)}`]);
  ws.addRow([`Generated ${meta.generatedAt} (Asia/Dhaka) by ${meta.generatedBy}. Overheads never change stock value.`]);
  ws.addRow([]);
  const header = ws.addRow(["Month", "Warehouse", "Store charge (BDT)", "Holding cost (BDT)", "Total (BDT)", "Average stock value (BDT)", "Holding % of stock value", "Established cost (BDT)"]);
  header.font = { bold: true };
  header.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } }));
  ws.views = [{ state: "frozen", ySplit: 5 }];

  for (const m of s.months) {
    const label = m.month.slice(0, 7);
    for (const w of m.warehouses) ws.addRow([label, `${w.warehouse.name} (${w.warehouse.code})`, num(w.storeChargeCost), num(w.holdingCost), num(w.warehouseTotal), num(w.averageStockValue), w.holdingPercent === null ? null : Number(w.holdingPercent) / 100, null]);
    ws.addRow([label, "Company", null, null, num(m.company.establishmentCost), null, null, num(m.company.establishmentCost)]);
    const total = ws.addRow([label, "Month total", null, null, num(m.total), null, null, null]);
    total.font = { bold: true };
  }
  for (const col of [3, 4, 5, 6, 8]) ws.getColumn(col).numFmt = "#,##0.00";
  ws.getColumn(7).numFmt = "0.00%";
  [10, 26, 18, 18, 16, 24, 22, 20].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
