import { randomUUID } from "node:crypto";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger/logger";
import { hasLevel } from "@/shared/rbac/levels";
import { ATTACHMENT_MAX_BYTES, MAX_ATTACHMENTS, sniff } from "@/modules/inventory/application/attachment.service";
import { InventoryErrors } from "@/modules/inventory/domain/errors";
import type { PurchaseOrderService } from "./purchase-order.service";
import type { AttachmentRecord, FileStore, PurchasingActor, PurchasingUnitOfWork } from "./ports";

const ENTITY = "PurchaseOrder";

/** Supplier quotations, proforma invoices… attached to a PO (generic Attachment table). */
export class PoAttachmentService {
  constructor(private readonly d: { uow: PurchasingUnitOfWork; files: FileStore; orders: PurchaseOrderService }) {}

  async list(actor: PurchasingActor, poId: string): Promise<AttachmentRecord[]> {
    await this.d.orders.get(actor, poId);
    return this.d.uow.store.attachments(poId);
  }

  async upload(actor: PurchasingActor, poId: string, files: { name: string; bytes: Uint8Array }[], label: string | null): Promise<AttachmentRecord[]> {
    await this.d.orders.get(actor, poId);
    if (!files.length) throw new ValidationError("Attach at least one file.", [{ path: "file", message: "Choose a file." }]);
    const existing = await this.d.uow.store.attachments(poId);
    if (existing.length + files.length > MAX_ATTACHMENTS) throw InventoryErrors.attachmentLimit();
    const checked = files.map((f) => {
      if (f.bytes.byteLength > ATTACHMENT_MAX_BYTES) throw InventoryErrors.attachmentSize();
      const kind = sniff(f.bytes);
      if (!kind || f.bytes.byteLength === 0) throw InventoryErrors.attachmentType();
      return { ...f, kind, key: `attachments/${ENTITY}/${poId}/${randomUUID()}.${kind.ext}` };
    });
    const stored: string[] = [];
    try {
      for (const f of checked) {
        await this.d.files.put(f.key, f.bytes, f.kind.mime);
        stored.push(f.key);
      }
      return await this.d.uow.transaction(async (store) => {
        const out: AttachmentRecord[] = [];
        for (const f of checked) {
          out.push(await store.addAttachment({ entityId: poId, fileKey: f.key, fileName: f.name.slice(0, 200) || `file.${f.kind.ext}`, mimeType: f.kind.mime, size: f.bytes.byteLength, label, uploadedById: actor.actorId }));
        }
        await store.audit.record(actor, { action: "purchase_order.attachment_add", entityType: ENTITY, entityId: poId, after: { files: out.map((a) => ({ id: a.id, fileName: a.fileName, size: a.size })) } });
        return out;
      });
    } catch (err) {
      await this.d.files.delete(stored).catch((e) => logger.warn({ err: e }, "attachment cleanup failed"));
      throw err;
    }
  }

  async file(actor: PurchasingActor, poId: string, attachmentId: string) {
    await this.d.orders.get(actor, poId);
    const a = await this.d.uow.store.attachment(attachmentId);
    if (!a || a.entityId !== poId) throw new NotFoundError("Attachment");
    const obj = await this.d.files.get(a.fileKey);
    if (!obj) throw new NotFoundError("Attachment file");
    return { ...obj, fileName: a.fileName, mimeType: a.mimeType };
  }

  /** The uploader or a FULL purchasing user may remove an attachment. */
  async remove(actor: PurchasingActor, poId: string, attachmentId: string): Promise<void> {
    await this.d.orders.get(actor, poId);
    const a = await this.d.uow.store.attachment(attachmentId);
    if (!a || a.entityId !== poId) throw new NotFoundError("Attachment");
    if (a.uploadedBy.id !== actor.actorId && !hasLevel(actor.level, "FULL")) throw new ForbiddenError("Only the uploader or a FULL purchasing user can remove this file.");
    await this.d.uow.transaction(async (store) => {
      await store.deleteAttachment(attachmentId);
      await store.audit.record(actor, { action: "purchase_order.attachment_remove", entityType: ENTITY, entityId: poId, before: { id: a.id, fileName: a.fileName } });
    });
    await this.d.files.delete([a.fileKey]).catch((err) => logger.warn({ err }, "attachment object delete failed"));
  }
}
