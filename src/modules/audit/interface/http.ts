import { prisma } from "@/shared/db/prisma";
import { authedRoute } from "@/shared/http/route";
import { pageMeta } from "@/shared/pagination/list-query";
import { AuditService, type AuditLogRecord } from "../application/audit.service";
import { AuditListQuerySchema } from "../application/dto";
import { prismaAuditRepository } from "../infrastructure/prisma-audit.repository";

let service: AuditService | undefined;
export const auditService = () => (service ??= new AuditService(prismaAuditRepository(prisma)));

export function toAuditLogDto(a: AuditLogRecord) {
  return {
    id: a.id,
    action: a.action,
    entityType: a.entityType,
    entityId: a.entityId,
    before: a.before ?? null,
    after: a.after ?? null,
    ip: a.ip,
    requestId: a.requestId,
    createdAt: a.createdAt.toISOString(),
    user: a.user,
  };
}

export const auditHandlers = {
  list: authedRoute({ permission: ["users", "FULL"] }, async (ctx) => {
    const query = ctx.query(AuditListQuerySchema);
    const { items, total } = await auditService().list(query);
    return { data: items.map(toAuditLogDto), meta: pageMeta(total, query.page, query.pageSize) };
  }),
};
