import { randomUUID } from "node:crypto";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger/logger";
import { hasLevel } from "@/shared/rbac/levels";
import { InventoryErrors } from "../domain/errors";
import { IMPORT_FILE_MAX_BYTES, IMPORT_FILES_PER_DOC, sanitizeFileName, type AttachmentDocType } from "../domain/import-docs";
import type { EntryService } from "./entry.service";
import { canEditImportDocs, canRemoveImportFile } from "./import-docs.service";
import type { AttachmentRecord, EntryRecord, FileStore, InventoryActor, InventoryUnitOfWork } from "./ports";

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** Ordinary attachments per entry (import document files have their own limit per document). */
export const MAX_ATTACHMENTS = 20;
const ENTITY = "StockEntry";
/** Import documents: PDF, JPG or PNG only (no WebP). */
const IMPORT_MIMES = ["application/pdf", "image/jpeg", "image/png"];

/** Detects the file type from its first bytes (not the name or the declared type). */
export function sniff(b: Uint8Array): { mime: string; ext: string } | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return { mime: "image/png", ext: "png" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

type Thumbnailer = (bytes: Uint8Array) => Promise<Uint8Array | null>;

/**
 * Challans, invoices, PO / LC / B-E copies and damage photos attached to stock entries, and the
 * import document files (BL, CO, PL, CI, BOE, OTHER) of a GRN (Imported).
 */
export class AttachmentService {
  constructor(private readonly d: { uow: InventoryUnitOfWork; files: FileStore; entries: EntryService; thumbnail?: Thumbnailer }) {}

  async list(actor: InventoryActor, entryId: string, docType?: AttachmentDocType): Promise<AttachmentRecord[]> {
    await this.d.entries.get(actor, entryId);
    const all = await this.d.uow.store.attachments(ENTITY, entryId);
    return docType ? all.filter((a) => a.docType === docType) : all;
  }

  async upload(actor: InventoryActor, entryId: string, files: { name: string; bytes: Uint8Array }[], label: string | null, docType: AttachmentDocType | null = null): Promise<AttachmentRecord[]> {
    const entry = await this.d.entries.get(actor, entryId);
    if (!files.length) throw new ValidationError("Attach at least one file.", [{ path: "file", message: "Choose a file." }]);
    if (docType) return this.uploadImportDocs(actor, entry, files, label, docType);

    const existing = (await this.d.uow.store.attachments(ENTITY, entryId)).filter((a) => !a.docType);
    if (existing.length + files.length > MAX_ATTACHMENTS) throw InventoryErrors.attachmentLimit();
    const checked = files.map((f) => {
      if (f.bytes.byteLength > ATTACHMENT_MAX_BYTES) throw InventoryErrors.attachmentSize();
      const kind = sniff(f.bytes);
      if (!kind || f.bytes.byteLength === 0) throw InventoryErrors.attachmentType();
      return { ...f, kind, key: `attachments/${ENTITY}/${entryId}/${randomUUID()}.${kind.ext}`, thumbKey: null as string | null, thumb: null as Uint8Array | null };
    });
    return this.store(actor, entryId, checked, label, null);
  }

  /** Import document files: GRN (Imported) only; PDF / JPG / PNG ≤ 10 MB; ≤ 10 per document type. */
  private async uploadImportDocs(actor: InventoryActor, e: EntryRecord, files: { name: string; bytes: Uint8Array }[], label: string | null, docType: AttachmentDocType) {
    if (e.type !== "GRN_IMPORT") throw InventoryErrors.importDocsNotAllowed("Import document files");
    if (!canEditImportDocs(actor, e)) {
      throw InventoryErrors.importDocsForbidden(["POSTED", "REVERSED"].includes(e.status) ? "After posting, only inventory FULL can upload import documents." : "You can't upload import documents to this entry.");
    }
    const existing = (e.docFileCounts[docType] ?? 0) + files.length;
    if (existing > IMPORT_FILES_PER_DOC) throw InventoryErrors.importFileLimit(docType, IMPORT_FILES_PER_DOC);
    const checked = [];
    for (const f of files) {
      if (f.bytes.byteLength > IMPORT_FILE_MAX_BYTES) throw InventoryErrors.attachmentSize();
      const kind = sniff(f.bytes);
      if (!kind || f.bytes.byteLength === 0 || !IMPORT_MIMES.includes(kind.mime)) throw InventoryErrors.importFileType();
      const safe = sanitizeFileName(f.name, kind.ext);
      const id = randomUUID();
      const key = `imports/${e.id}/${docType}/${id}-${safe}`;
      let thumb: Uint8Array | null = null;
      if (kind.mime !== "application/pdf" && this.d.thumbnail) {
        thumb = await this.d.thumbnail(f.bytes);
        // Image magic bytes but not a decodable image: reject as a wrong type.
        if (!thumb) throw InventoryErrors.importFileType();
      }
      checked.push({ name: safe, bytes: f.bytes, kind, key, thumbKey: thumb ? `imports/${e.id}/${docType}/${id}-thumb.webp` : null, thumb });
    }
    return this.store(actor, e.id, checked, label, docType);
  }

  private async store(
    actor: InventoryActor,
    entryId: string,
    checked: { name: string; bytes: Uint8Array; kind: { mime: string; ext: string }; key: string; thumbKey: string | null; thumb: Uint8Array | null }[],
    label: string | null,
    docType: AttachmentDocType | null,
  ): Promise<AttachmentRecord[]> {
    const stored: string[] = [];
    try {
      for (const f of checked) {
        await this.d.files.put(f.key, f.bytes, f.kind.mime);
        stored.push(f.key);
        if (f.thumbKey && f.thumb) {
          await this.d.files.put(f.thumbKey, f.thumb, "image/webp");
          stored.push(f.thumbKey);
        }
      }
      return await this.d.uow.transaction(async (store) => {
        if (docType) {
          // Re-check the per-document limit under the entry lock (concurrent uploads).
          const locked = await store.lockEntry(entryId);
          if ((locked?.docFileCounts[docType] ?? 0) + checked.length > IMPORT_FILES_PER_DOC) throw InventoryErrors.importFileLimit(docType, IMPORT_FILES_PER_DOC);
        }
        const out: AttachmentRecord[] = [];
        for (const f of checked) {
          out.push(
            await store.addAttachment({
              entityType: ENTITY,
              entityId: entryId,
              fileKey: f.key,
              fileName: f.name.slice(0, 200) || `file.${f.kind.ext}`,
              mimeType: f.kind.mime,
              size: f.bytes.byteLength,
              label,
              docType,
              thumbnailKey: f.thumbKey,
              uploadedById: actor.actorId,
            }),
          );
        }
        await store.audit.record(actor, {
          action: "stock_entry.attachment_add",
          entityType: ENTITY,
          entityId: entryId,
          after: { ...(docType ? { docType } : {}), files: out.map((a) => ({ id: a.id, fileName: a.fileName, size: a.size, ...(docType ? { docType } : {}) })) },
        });
        return out;
      });
    } catch (err) {
      await this.d.files.delete(stored).catch((e) => logger.warn({ err: e }, "attachment cleanup failed"));
      throw err;
    }
  }

  async file(actor: InventoryActor, entryId: string, attachmentId: string, variant: "original" | "thumb" = "original") {
    await this.d.entries.get(actor, entryId);
    const a = await this.d.uow.store.attachment(attachmentId);
    if (!a || a.entityId !== entryId) throw new NotFoundError("Attachment");
    if (variant === "thumb") {
      if (!a.thumbnailKey) throw new NotFoundError("Thumbnail");
      const t = await this.d.files.get(a.thumbnailKey);
      if (!t) throw new NotFoundError("Thumbnail");
      return { ...t, fileName: a.fileName.replace(/\.[^.]+$/, "") + "-thumb.webp", mimeType: "image/webp" };
    }
    const obj = await this.d.files.get(a.fileKey);
    if (!obj) throw new NotFoundError("Attachment file");
    return { ...obj, fileName: a.fileName, mimeType: a.mimeType };
  }

  /**
   * Ordinary attachments: the uploader or a FULL user. Import document files: the uploader
   * while the entry isn't posted, inventory FULL at any time (a reason once it is posted).
   */
  async remove(actor: InventoryActor, entryId: string, attachmentId: string, reason: string | null = null): Promise<void> {
    const e = await this.d.entries.get(actor, entryId);
    const a = await this.d.uow.store.attachment(attachmentId);
    if (!a || a.entityId !== entryId) throw new NotFoundError("Attachment");
    if (a.docType) {
      const rule = canRemoveImportFile(actor, e, a);
      if (!rule.allowed) throw new ForbiddenError(["POSTED", "REVERSED"].includes(e.status) ? "After posting, only inventory FULL can remove import document files." : "Only the uploader or a FULL inventory user can remove this file.");
      if (rule.reasonRequired && !reason) throw InventoryErrors.deleteReasonRequired();
    } else if (a.uploadedBy.id !== actor.actorId && !hasLevel(actor.level, "FULL")) {
      throw new ForbiddenError("Only the uploader or a FULL inventory user can remove this file.");
    }
    await this.d.uow.transaction(async (store) => {
      await store.deleteAttachment(attachmentId);
      await store.audit.record(actor, {
        action: "stock_entry.attachment_remove",
        entityType: ENTITY,
        entityId: entryId,
        before: { id: a.id, fileName: a.fileName, ...(a.docType ? { docType: a.docType } : {}) },
        ...(reason ? { after: { reason } } : {}),
      });
    });
    await this.d.files.delete([a.fileKey, ...(a.thumbnailKey ? [a.thumbnailKey] : [])]).catch((err) => logger.warn({ err }, "attachment object delete failed"));
  }
}
