import { z, emptyToUndefined } from "@/shared/validation/zod";
import { listQuerySchema } from "@/shared/pagination/list-query";
import { DateRangeFilters } from "@/shared/time/dates";

export const AuditListQuerySchema = listQuerySchema({
  sortFields: ["createdAt", "action", "entityType"],
  defaultSort: "-createdAt",
  filters: {
    userId: emptyToUndefined(z.string().uuid()).openapi({ description: "Actor user id" }),
    entityType: emptyToUndefined(z.string().max(64)).openapi({ example: "User" }),
    entityId: emptyToUndefined(z.string().max(64)),
    action: emptyToUndefined(z.string().max(64)).openapi({ example: "user.update" }),
    ...DateRangeFilters,
  },
});

export type AuditListFilters = {
  userId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  from?: Date;
  to?: Date;
};

export const AuditLogSchema = z
  .object({
    id: z.string().uuid(),
    action: z.string().openapi({ example: "user.update" }),
    entityType: z.string().openapi({ example: "User" }),
    entityId: z.string().nullable(),
    before: z.unknown().nullable().openapi({ description: "Snapshot before the change (secrets removed)" }),
    after: z.unknown().nullable().openapi({ description: "Snapshot after the change (secrets removed)" }),
    ip: z.string().nullable(),
    requestId: z.string().nullable(),
    createdAt: z.string().datetime(),
    user: z.object({ id: z.string().uuid(), name: z.string(), username: z.string() }).nullable(),
  })
  .openapi("AuditLog");
