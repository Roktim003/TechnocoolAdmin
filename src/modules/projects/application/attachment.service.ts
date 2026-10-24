import { randomUUID } from "node:crypto";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger/logger";
import { hasLevel } from "@/shared/rbac/levels";
import { ATTACHMENT_MAX_BYTES, MAX_ATTACHMENTS, sniff } from "@/modules/inventory/application/attachment.service";
import { InventoryErrors } from "@/modules/inventory/domain/errors";
import type { CostService } from "./cost.service";
import type { AttachmentRecord, FileStore, ProjectsActor, ProjectsUnitOfWork } from "./ports";
import type { ProjectService } from "./project.service";

/** Where a file belongs: the project itself (work order, drawings, handover papers, site photos) or one of its costs (receipts). */
export type AttachmentTarget = { kind: "project"; projectId: string } | { kind: "cost"; projectId: string; costId: string };

const entityOf = (t: AttachmentTarget) => (t.kind === "project" ? { type: "Project", id: t.projectId } : { type: "ProjectCost", id: t.costId });

/** Generic Attachment table, same checks as stock entries (PDF / JPG / PNG / WebP by content, 10 MB). */
export class ProjectAttachmentService {
  constructor(private readonly d: { uow: ProjectsUnitOfWork; files: FileStore; projects: ProjectService; costs: CostService }) {}

  private async check(t: AttachmentTarget) {
    await this.d.projects.get(t.projectId);
    if (t.kind === "cost") await this.d.costs.get(t.projectId, t.costId);
  }

  async list(t: AttachmentTarget): Promise<AttachmentRecord[]> {
    await this.check(t);
    const e = entityOf(t);
    return this.d.uow.store.attachments(e.type, e.id);
  }

  async upload(actor: ProjectsActor, t: AttachmentTarget, files: { name: string; bytes: Uint8Array }[], label: string | null): Promise<AttachmentRecord[]> {
    await this.check(t);
    const e = entityOf(t);
    if (!files.length) throw new ValidationError("Attach at least one file.", [{ path: "file", message: "Choose a file." }]);
    const existing = await this.d.uow.store.attachments(e.type, e.id);
    if (existing.length + files.length > MAX_ATTACHMENTS) throw InventoryErrors.attachmentLimit();
    const checked = files.map((f) => {
      if (f.bytes.byteLength > ATTACHMENT_MAX_BYTES) throw InventoryErrors.attachmentSize();
      const kind = sniff(f.bytes);
      if (!kind || f.bytes.byteLength === 0) throw InventoryErrors.attachmentType();
      return { ...f, kind, key: `attachments/${e.type}/${e.id}/${randomUUID()}.${kind.ext}` };
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
          out.push(await store.addAttachment({ entityType: e.type, entityId: e.id, fileKey: f.key, fileName: f.name.slice(0, 200) || `file.${f.kind.ext}`, mimeType: f.kind.mime, size: f.bytes.byteLength, label, uploadedById: actor.actorId }));
        }
        await store.audit.record(actor, {
          action: t.kind === "project" ? "project.attachment_add" : "project.cost_receipt_add",
          entityType: "Project",
          entityId: t.projectId,
          after: { ...(t.kind === "cost" ? { costId: t.costId } : {}), files: out.map((a) => ({ id: a.id, fileName: a.fileName, size: a.size })) },
        });
        return out;
      });
    } catch (err) {
      await this.d.files.delete(stored).catch((x) => logger.warn({ err: x }, "attachment cleanup failed"));
      throw err;
    }
  }

  private async find(t: AttachmentTarget, attachmentId: string) {
    await this.check(t);
    const e = entityOf(t);
    const a = await this.d.uow.store.attachment(attachmentId);
    if (!a || a.entityType !== e.type || a.entityId !== e.id) throw new NotFoundError("Attachment");
    return a;
  }

  async file(t: AttachmentTarget, attachmentId: string) {
    const a = await this.find(t, attachmentId);
    const obj = await this.d.files.get(a.fileKey);
    if (!obj) throw new NotFoundError("Attachment file");
    return { ...obj, fileName: a.fileName, mimeType: a.mimeType };
  }

  /** The uploader or a projects FULL user. */
  async remove(actor: ProjectsActor, t: AttachmentTarget, attachmentId: string): Promise<void> {
    const a = await this.find(t, attachmentId);
    if (a.uploadedBy.id !== actor.actorId && !hasLevel(actor.level, "FULL")) throw new ForbiddenError("Only the uploader or a projects FULL user can remove this file.");
    await this.d.uow.transaction(async (store) => {
      await store.deleteAttachment(attachmentId);
      await store.audit.record(actor, { action: t.kind === "project" ? "project.attachment_remove" : "project.cost_receipt_remove", entityType: "Project", entityId: t.projectId, before: { id: a.id, fileName: a.fileName, ...(t.kind === "cost" ? { costId: t.costId } : {}) } });
    });
    await this.d.files.delete([a.fileKey]).catch((err) => logger.warn({ err }, "attachment object delete failed"));
  }
}
