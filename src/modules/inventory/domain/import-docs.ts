import { d } from "./decimal";
import type { Currency } from "./types";

/**
 * Import documents of a GRN (Imported): the five shipment documents, which of them must be
 * complete (number + at least one file) before posting, and the non-blocking warnings.
 */

export const IMPORT_DOC_TYPES = ["BL", "CO", "PL", "CI", "BOE"] as const;
export type ImportDocType = (typeof IMPORT_DOC_TYPES)[number];
/** Attachment document types: the five documents plus OTHER. */
export const ATTACHMENT_DOC_TYPES = [...IMPORT_DOC_TYPES, "OTHER"] as const;
export type AttachmentDocType = (typeof ATTACHMENT_DOC_TYPES)[number];

export const INCOTERMS = ["EXW", "FOB", "CFR", "CIF", "OTHER"] as const;
export type Incoterm = (typeof INCOTERMS)[number];

export const DEFAULT_REQUIRED_DOCS: ImportDocType[] = ["CI", "BOE"];

export const IMPORT_DOC_META: Record<ImportDocType, { label: string; numberField: keyof ImportShipmentData; numberLabel: string }> = {
  BL: { label: "Bill of Lading", numberField: "blNo", numberLabel: "BL no." },
  CO: { label: "Certificate of Origin", numberField: "coNo", numberLabel: "CO no." },
  PL: { label: "Packing List", numberField: "plNo", numberLabel: "PL no." },
  CI: { label: "Commercial Invoice", numberField: "ciNo", numberLabel: "CI no." },
  BOE: { label: "Bill of Entry", numberField: "boeNo", numberLabel: "B/E no." },
};

/** Upload limits for import document files. */
export const IMPORT_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const IMPORT_FILES_PER_DOC = 10;

/** Shipment document details. Dates are YYYY-MM-DD, weights / value decimal strings. */
export interface ImportShipmentData {
  blNo: string | null;
  blDate: string | null;
  shippingLine: string | null;
  vesselVoyage: string | null;
  portOfLoading: string | null;
  portOfDischarge: string | null;
  containerNumbers: string[];
  coNo: string | null;
  coDate: string | null;
  countryOfOrigin: string | null;
  coIssuingAuthority: string | null;
  plNo: string | null;
  plDate: string | null;
  packageCount: number | null;
  grossWeightKg: string | null;
  netWeightKg: string | null;
  ciNo: string | null;
  ciDate: string | null;
  ciCurrency: Currency | null;
  ciValue: string | null;
  incoterm: Incoterm | null;
  boeNo: string | null;
  boeDate: string | null;
  customsStation: string | null;
}

export const EMPTY_SHIPMENT: ImportShipmentData = {
  blNo: null,
  blDate: null,
  shippingLine: null,
  vesselVoyage: null,
  portOfLoading: null,
  portOfDischarge: null,
  containerNumbers: [],
  coNo: null,
  coDate: null,
  countryOfOrigin: null,
  coIssuingAuthority: null,
  plNo: null,
  plDate: null,
  packageCount: null,
  grossWeightKg: null,
  netWeightKg: null,
  ciNo: null,
  ciDate: null,
  ciCurrency: null,
  ciValue: null,
  incoterm: null,
  boeNo: null,
  boeDate: null,
  customsStation: null,
};

export interface DocChecklistItem {
  docType: ImportDocType;
  label: string;
  numberFilled: boolean;
  fileCount: number;
  required: boolean;
  /** Number filled and at least one file. */
  complete: boolean;
}

export function documentsChecklist(shipment: ImportShipmentData | null, fileCounts: Partial<Record<string, number>>, required: readonly ImportDocType[]): DocChecklistItem[] {
  return IMPORT_DOC_TYPES.map((docType) => {
    const meta = IMPORT_DOC_META[docType];
    const value = shipment?.[meta.numberField];
    const numberFilled = typeof value === "string" && value.trim() !== "";
    const fileCount = fileCounts[docType] ?? 0;
    return { docType, label: meta.label, numberFilled, fileCount, required: required.includes(docType), complete: numberFilled && fileCount > 0 };
  });
}

/** Required documents still missing a number or a file. */
export function missingRequiredDocs(checklist: DocChecklistItem[]): DocChecklistItem[] {
  return checklist.filter((c) => c.required && !c.complete);
}

/** What is still needed for one document, e.g. "Commercial Invoice: number and file". */
export function missingText(c: DocChecklistItem): string {
  const parts = [!c.numberFilled ? "number" : null, c.fileCount === 0 ? "file" : null].filter(Boolean);
  return `${c.label} (${c.docType}): ${parts.join(" and ")}`;
}

export interface ImportWarning {
  line: null;
  code: string;
  message: string;
  /** Another GRN (Imported) using the same document number. */
  link?: { entryId: string; number: string | null; href: string };
}

export interface DuplicateDoc {
  field: "blNo" | "ciNo" | "boeNo";
  value: string;
  entryId: string;
  number: string | null;
}

/**
 * Non-blocking warnings. `goodsValue` is the GRN goods value in the GRN currency (Σ qty × unit price).
 */
export function importWarnings(s: ImportShipmentData | null, grn: { currency: Currency; goodsValue: string }, duplicates: DuplicateDoc[] = []): ImportWarning[] {
  if (!s) return [];
  const out: ImportWarning[] = [];
  if (s.ciCurrency && s.ciCurrency !== grn.currency) {
    out.push({ line: null, code: "CI_CURRENCY_MISMATCH", message: `The Commercial Invoice is in ${s.ciCurrency} but the GRN is in ${grn.currency}.` });
  }
  if (s.ciValue !== null && (!s.ciCurrency || s.ciCurrency === grn.currency)) {
    const goods = d(grn.goodsValue);
    const ci = d(s.ciValue);
    const diff = ci.minus(goods).abs();
    const off = goods.isZero() ? !ci.isZero() : diff.div(goods).gt(0.01);
    if (off) out.push({ line: null, code: "CI_VALUE_MISMATCH", message: `The Commercial Invoice value differs from the GRN goods value by more than 1%.` });
  }
  if (s.grossWeightKg !== null && s.netWeightKg !== null && d(s.netWeightKg).gt(d(s.grossWeightKg))) {
    out.push({ line: null, code: "PL_NET_ABOVE_GROSS", message: "Packing List net weight is greater than the gross weight." });
  }
  if (s.boeDate && s.blDate && s.boeDate < s.blDate) {
    out.push({ line: null, code: "BOE_BEFORE_BL", message: "The Bill of Entry date is earlier than the Bill of Lading date." });
  }
  const names = { blNo: ["DUPLICATE_BL", "BL no."], ciNo: ["DUPLICATE_CI", "CI no."], boeNo: ["DUPLICATE_BOE", "B/E no."] } as const;
  for (const dup of duplicates) {
    const [code, label] = names[dup.field];
    out.push({
      line: null,
      code,
      message: `${label} ${dup.value} is also used on ${dup.number ?? "another GRN (Imported)"} (one shipment can arrive in parts).`,
      link: { entryId: dup.entryId, number: dup.number, href: `/stock/${dup.entryId}` },
    });
  }
  return out;
}

/** Container numbers: trimmed, upper-case, no blanks or repeats. */
export function normalizeContainers(values: readonly string[] | null | undefined): string[] {
  return [...new Set((values ?? []).map((v) => v.trim().toUpperCase().replace(/\s+/g, "")).filter(Boolean))];
}

/**
 * A file name safe to store and show: no directories (path traversal), no control or special
 * characters, at most 100 characters, the extension kept.
 */
export function sanitizeFileName(name: string, fallbackExt: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "")
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\-]+/, "")
    .slice(-100);
  const clean = base.replace(/[.\-]+$/, "");
  return clean && /[A-Za-z0-9]/.test(clean) ? clean : `file.${fallbackExt}`;
}
