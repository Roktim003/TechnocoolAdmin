import type { AttachmentDocType, DocChecklistItem, ImportDocType, ImportShipmentData, ImportWarning } from "@/modules/inventory/domain/import-docs";
import type { EntryDto, StockCaps } from "./types";

/**
 * GRN (Imported) documents in the web UI: API shapes, form state and the client-side checklist
 * (the server re-checks everything; this only keeps the screen responsive).
 */

export type { AttachmentDocType, DocChecklistItem, ImportDocType, ImportShipmentData, ImportWarning };

/** UI copies of the domain constants (the domain module pulls decimal.js into the bundle). */
export const DOC_TYPES: ImportDocType[] = ["BL", "CO", "PL", "CI", "BOE"];
export const DOC_LABEL: Record<ImportDocType, string> = {
  BL: "Bill of Lading",
  CO: "Certificate of Origin",
  PL: "Packing List",
  CI: "Commercial Invoice",
  BOE: "Bill of Entry",
};
export const DOC_NUMBER_FIELD = { BL: "blNo", CO: "coNo", PL: "plNo", CI: "ciNo", BOE: "boeNo" } as const satisfies Record<ImportDocType, keyof ImportShipmentData>;
export const DEFAULT_REQUIRED: ImportDocType[] = ["CI", "BOE"];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_DOC = 10;
export const FILE_ACCEPT = "application/pdf,image/jpeg,image/png";
export const CI_CURRENCIES = ["BDT", "USD", "EUR", "CNY", "MYR", "THB"] as const;
export const INCOTERMS = ["EXW", "FOB", "CFR", "CIF", "OTHER"] as const;
export const CUSTOMS_STATIONS = ["Chattogram Custom House", "Benapole", "Dhaka ICD", "Mongla"];
/** Warning codes shown in the Import documents section (not in the general summary). */
export const IMPORT_WARNING_CODES = ["IMPORT_DOCS_MISSING", "CI_CURRENCY_MISMATCH", "CI_VALUE_MISMATCH", "PL_NET_ABOVE_GROSS", "BOE_BEFORE_BL", "DUPLICATE_BL", "DUPLICATE_CI", "DUPLICATE_BOE"];

export interface ImportAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  label: string | null;
  docType: AttachmentDocType | null;
  uploadedBy: { id: string; name: string };
  createdAt: string;
  uploadedAt: string;
  url: string;
  downloadUrl: string;
  thumbnailUrl: string | null;
}

export type ImportAttachments = Record<AttachmentDocType, ImportAttachment[]>;
export const emptyAttachments = (): ImportAttachments => ({ BL: [], CO: [], PL: [], CI: [], BOE: [], OTHER: [] });

/** Extra fields of a GRN (Imported) entry (detail: all; list: shipment, checklist, file count). */
export interface ImportEntryFields {
  importShipment?: ImportShipmentData | null;
  documentsChecklist?: DocChecklistItem[];
  importDocsRequiredToPost?: ImportDocType[];
  importAttachments?: ImportAttachments;
  importWarnings?: ImportWarning[];
  importDocFileCount?: number;
}

export type EntryDetailDto = EntryDto & ImportEntryFields;

/* ── form state ── */

type TextKeys = Exclude<keyof ImportShipmentData, "containerNumbers">;
export type ShipmentForm = Record<TextKeys, string> & { containerNumbers: string[] };

const TEXT_KEYS: TextKeys[] = [
  "blNo",
  "blDate",
  "shippingLine",
  "vesselVoyage",
  "portOfLoading",
  "portOfDischarge",
  "coNo",
  "coDate",
  "countryOfOrigin",
  "coIssuingAuthority",
  "plNo",
  "plDate",
  "packageCount",
  "grossWeightKg",
  "netWeightKg",
  "ciNo",
  "ciDate",
  "ciCurrency",
  "ciValue",
  "incoterm",
  "boeNo",
  "boeDate",
  "customsStation",
];

/** Form state from stored details; an old entry's legacy bill of entry no. fills an empty B/E no. */
export function toShipmentForm(s: ImportShipmentData | null | undefined, legacyBoeNo?: string | null): ShipmentForm {
  const f = { containerNumbers: [...(s?.containerNumbers ?? [])] } as ShipmentForm;
  for (const k of TEXT_KEYS) {
    const v = s?.[k];
    f[k] = v === null || v === undefined ? "" : String(v);
  }
  if (!f.boeNo && legacyBoeNo) f.boeNo = legacyBoeNo;
  return f;
}

/** API body (blank → null). Without seeCost the CI value is left out (the server keeps the stored one). */
export function shipmentBody(f: ShipmentForm, seeCost: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = { containerNumbers: f.containerNumbers };
  for (const k of TEXT_KEYS) {
    if (k === "ciValue" && !seeCost) continue;
    const v = f[k].trim();
    body[k] = v === "" ? null : k === "grossWeightKg" || k === "netWeightKg" || k === "ciValue" ? v.replace(/,/g, "") : v;
  }
  return body;
}

/** The checklist from what is on screen (same rule as the server: number + at least one file). */
export function localChecklist(f: ShipmentForm, files: ImportAttachments, required: readonly ImportDocType[]): DocChecklistItem[] {
  return DOC_TYPES.map((docType) => {
    const numberFilled = f[DOC_NUMBER_FIELD[docType]].trim() !== "";
    const fileCount = files[docType].length;
    return { docType, label: DOC_LABEL[docType], numberFilled, fileCount, required: required.includes(docType), complete: numberFilled && fileCount > 0 };
  });
}

export const missingRequired = (c: DocChecklistItem[]) => c.filter((x) => x.required && !x.complete);

/** "Commercial Invoice (CI): number and file". */
export function missingText(c: DocChecklistItem): string {
  const parts = [!c.numberFilled ? "number" : null, c.fileCount === 0 ? "file" : null].filter(Boolean);
  return `${c.label} (${c.docType}): ${parts.join(" and ")}`;
}

/** Tooltip / help naming the missing documents. */
export const missingTitle = (missing: DocChecklistItem[]) => (missing.length ? `Needed before posting: ${missing.map(missingText).join("; ")}.` : undefined);

/** "Commercial Invoice and Bill of Entry". */
export function joinLabels(types: readonly ImportDocType[]): string {
  const names = DOC_TYPES.filter((t) => types.includes(t)).map((t) => DOC_LABEL[t]);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const POSTED = ["POSTED", "REVERSED"];

/** Mirrors the API: the uploader while not posted; inventory FULL any time (a reason once posted). */
export function removeRule(caps: StockCaps, entry: { status: string; warehouseId: string }, a: ImportAttachment): { allowed: boolean; reasonRequired: boolean } {
  if (!caps.warehouseIds.includes(entry.warehouseId)) return { allowed: false, reasonRequired: false };
  const posted = POSTED.includes(entry.status);
  if (caps.canFull) return { allowed: true, reasonRequired: posted };
  return { allowed: a.uploadedBy.id === caps.userId && !posted && caps.canCreate, reasonRequired: false };
}

/** Client-side check before uploading (the server re-checks by content). */
export function fileProblem(f: File): string | null {
  const ext = /\.([a-z0-9]+)$/i.exec(f.name)?.[1]?.toLowerCase() ?? "";
  const okType = ["application/pdf", "image/jpeg", "image/png"].includes(f.type) || (!f.type && ["pdf", "jpg", "jpeg", "png"].includes(ext));
  if (!okType) return "Only PDF, JPG and PNG files are allowed.";
  if (f.size > MAX_FILE_BYTES) return "Larger than 10 MB.";
  if (f.size === 0) return "The file is empty.";
  return null;
}

export const fileSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
