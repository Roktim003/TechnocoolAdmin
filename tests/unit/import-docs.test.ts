import { describe, expect, it } from "vitest";
import { documentsChecklist, EMPTY_SHIPMENT, importWarnings, missingRequiredDocs, normalizeContainers, sanitizeFileName } from "@/modules/inventory/domain/import-docs";

describe("import documents: checklist", () => {
  it("needs a number and a file for a document to be complete", () => {
    const c = documentsChecklist({ ...EMPTY_SHIPMENT, ciNo: "CI-1", boeNo: "  " }, { CI: 1, BOE: 2, BL: 1 }, ["CI", "BOE"]);
    expect(c.map((x) => [x.docType, x.numberFilled, x.fileCount, x.required, x.complete])).toEqual([
      ["BL", false, 1, false, false],
      ["CO", false, 0, false, false],
      ["PL", false, 0, false, false],
      ["CI", true, 1, true, true],
      ["BOE", false, 2, true, false],
    ]);
    expect(missingRequiredDocs(c).map((x) => x.docType)).toEqual(["BOE"]);
    expect(missingRequiredDocs(documentsChecklist(null, {}, []))).toEqual([]);
  });
});

describe("import documents: warnings", () => {
  const grn = { currency: "USD" as const, goodsValue: "1000.00" };
  const codes = (s: Partial<typeof EMPTY_SHIPMENT>) => importWarnings({ ...EMPTY_SHIPMENT, ...s }, grn).map((w) => w.code);

  it("flags currency, value, weight and date problems", () => {
    expect(codes({ ciCurrency: "EUR", ciValue: "5000.00" })).toEqual(["CI_CURRENCY_MISMATCH"]);
    expect(codes({ ciCurrency: "USD", ciValue: "1010.00" })).toEqual([]);
    expect(codes({ ciValue: "1010.01" })).toEqual(["CI_VALUE_MISMATCH"]);
    expect(codes({ ciValue: "989.99" })).toEqual(["CI_VALUE_MISMATCH"]);
    expect(codes({ grossWeightKg: "10.000", netWeightKg: "10.001" })).toEqual(["PL_NET_ABOVE_GROSS"]);
    expect(codes({ grossWeightKg: "10.000", netWeightKg: "10.000" })).toEqual([]);
    expect(codes({ blDate: "2026-10-02", boeDate: "2026-10-01" })).toEqual(["BOE_BEFORE_BL"]);
    expect(importWarnings(null, grn)).toEqual([]);
  });

  it("links duplicates to the other GRN", () => {
    const w = importWarnings(EMPTY_SHIPMENT, grn, [{ field: "boeNo", value: "C-1", entryId: "e1", number: "GRN-I-2627-0004" }]);
    expect(w).toEqual([{ line: null, code: "DUPLICATE_BOE", message: expect.stringContaining("GRN-I-2627-0004"), link: { entryId: "e1", number: "GRN-I-2627-0004", href: "/stock/e1" } }]);
  });
});

describe("import documents: file names and containers", () => {
  it("strips directories and special characters, keeps the extension", () => {
    expect(sanitizeFileName("../../etc/passwd.pdf", "pdf")).toBe("passwd.pdf");
    expect(sanitizeFileName("C:\\Users\\me\\Bill of Lading (final).PDF", "pdf")).toBe("Bill-of-Lading-final.PDF");
    expect(sanitizeFileName("<img src=x onerror=1>.png", "png")).toBe("img-srcx-onerror1.png");
    expect(sanitizeFileName("...", "pdf")).toBe("file.pdf");
    expect(sanitizeFileName("", "jpg")).toBe("file.jpg");
    expect(sanitizeFileName(`${"a".repeat(300)}.pdf`, "pdf")).toHaveLength(100);
    expect(sanitizeFileName(`${"a".repeat(300)}.pdf`, "pdf").endsWith(".pdf")).toBe(true);
  });

  it("normalises container numbers", () => {
    expect(normalizeContainers([" msku 1234567 ", "MSKU1234567", "", "tcnu7654321"])).toEqual(["MSKU1234567", "TCNU7654321"]);
  });
});
