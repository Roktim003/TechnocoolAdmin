import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { MoneySchema, QuantitySchema } from "@/shared/money/money";
import { assertActiveRef, assertCanAddPhotos, assertCodeUnchanged, assertDeletable, assertPurchaseUnit, isValidCode, nameKey, normalizeCode } from "@/modules/catalog/domain/rules";
import { CreateProductSchema } from "@/modules/catalog/application/dto";
import { normalizeHeader } from "@/modules/catalog/application/import-columns";

describe("product codes", () => {
  it("normalise to trimmed upper case", () => {
    expect(normalizeCode("  lg-s18et ")).toBe("LG-S18ET");
  });

  it.each([
    ["AB", true],
    ["LG-S18ET", true],
    ["9-X", true],
    ["A", false],
    ["-AB", false],
    ["A_B", false],
    ["A B", false],
    ["A".repeat(31), true],
    ["A".repeat(32), false],
  ])("isValidCode(%j) = %s", (code, ok) => expect(isValidCode(code)).toBe(ok));

  it("are immutable once created", () => {
    expect(() => assertCodeUnchanged("LG-1", undefined)).not.toThrow();
    expect(() => assertCodeUnchanged("LG-1", "lg-1")).not.toThrow();
    expect(() => assertCodeUnchanged("LG-1", "LG-2")).toThrow(expect.objectContaining({ status: 422, rule: "CODE_IMMUTABLE" }));
  });
});

describe("money and quantities (no floats)", () => {
  it.each([
    ["85000", "85000.00"],
    ["85000.5", "85000.50"],
    [85000.25, "85000.25"],
    ["1,200,000", "1200000.00"],
    ["007", "7.00"],
    ["0", "0.00"],
  ])("MoneySchema(%j) = %s", (input, out) => expect(MoneySchema.parse(input)).toBe(out));

  it.each(["-1", "1.234", "abc", "", "1e5", 1e15, Number.NaN])("MoneySchema rejects %j", (input) => {
    expect(() => MoneySchema.parse(input)).toThrow(ZodError);
  });

  it("quantities allow 3 decimals", () => {
    expect(QuantitySchema.parse("2.500")).toBe("2.500");
    expect(QuantitySchema.parse(50)).toBe("50");
    expect(() => QuantitySchema.parse("1.2345")).toThrow(ZodError);
  });
});

describe("reference and photo rules", () => {
  it("references must exist and be active", () => {
    expect(() => assertActiveRef(null, "catalog")).toThrow(expect.objectContaining({ rule: "UNKNOWN_CATALOG" }));
    expect(() => assertActiveRef({ isActive: false, name: "LG" }, "catalog")).toThrow(expect.objectContaining({ rule: "INACTIVE_CATALOG" }));
    expect(() => assertActiveRef({ isActive: false, name: "x" }, "category")).toThrow(expect.objectContaining({ rule: "INACTIVE_CATEGORY" }));
    expect(() => assertActiveRef({ isActive: true, name: "m" }, "unit")).not.toThrow();
  });

  it("purchase unit and factor come together and the factor is > 0", () => {
    expect(() => assertPurchaseUnit(null, null)).not.toThrow();
    expect(() => assertPurchaseUnit("u", "50")).not.toThrow();
    expect(() => assertPurchaseUnit("u", null)).toThrow(expect.objectContaining({ rule: "PURCHASE_UNIT_INCOMPLETE" }));
    expect(() => assertPurchaseUnit(null, "5")).toThrow(expect.objectContaining({ rule: "PURCHASE_UNIT_INCOMPLETE" }));
    expect(() => assertPurchaseUnit("u", "0.000")).toThrow(expect.objectContaining({ rule: "PURCHASE_FACTOR_INVALID" }));
  });

  it("caps photos at 10 and blocks deleting used catalogs/categories", () => {
    expect(() => assertCanAddPhotos(8, 2)).not.toThrow();
    expect(() => assertCanAddPhotos(8, 3)).toThrow(expect.objectContaining({ rule: "PHOTO_LIMIT" }));
    expect(() => assertDeletable(0, "catalog")).not.toThrow();
    expect(() => assertDeletable(3, "catalog")).toThrow(/3 products/);
    expect(() => assertDeletable(1, "category")).toThrow(/1 product\./);
  });

  it("names and headers compare loosely", () => {
    expect(nameKey("  Dunham-Bush ")).toBe(nameKey("dunham-bush"));
    expect(normalizeHeader("Purchase cost (BDT) *")).toBe(normalizeHeader("purchase cost bdt"));
  });
});

describe("CreateProductSchema", () => {
  const base = { code: "ab-1", name: "X", catalogId: crypto.randomUUID(), categoryId: crypto.randomUUID(), unitId: crypto.randomUUID(), sellingPrice: "10" };

  it("turns blanks into null and parses booleans / enums loosely", () => {
    const p = CreateProductSchema.parse({ ...base, model: " ", barcode: "", trackSerial: "Yes", source: "local", warrantyMonths: "24" });
    expect(p).toMatchObject({ code: "AB-1", model: null, barcode: null, trackSerial: true, source: "LOCAL", warrantyMonths: 24 });
  });

  it("rejects unknown fields", () => {
    expect(() => CreateProductSchema.parse({ ...base, colour: "red" })).toThrow(ZodError);
  });
});
