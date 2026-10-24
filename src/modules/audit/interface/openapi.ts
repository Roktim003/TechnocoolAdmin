import { AUTHENTICATED, errors, json, listOf, registry } from "@/shared/openapi/registry";
import { AuditListQuerySchema, AuditLogSchema } from "../application/dto";

registry.registerPath({
  method: "get",
  path: "/audit-logs",
  tags: ["Audit log"],
  summary: "Audit trail of create / update / delete / disable / password changes",
  description: "Requires `users` = FULL.",
  security: AUTHENTICATED,
  request: { query: AuditListQuerySchema.innerType() },
  responses: { 200: json(listOf(AuditLogSchema)), ...errors(400, 401, 403) },
});
