import { z } from "@/shared/validation/zod";
import { AUTHENTICATED, dataOf, errors, IdParams, json, listOf, registry } from "@/shared/openapi/registry";
import { NotificationListQuerySchema, NotificationSchema, PreferenceSchema, UpdatePreferencesSchema } from "../application/dto";

const tags = ["Notifications"];
const own = "Any signed-in user; only their own notifications.";

function path(method: "get" | "post" | "patch", p: string, summary: string, description: string, extra: Record<string, unknown>) {
  registry.registerPath({ method, path: p, tags, summary, description, security: AUTHENTICATED, ...extra } as Parameters<typeof registry.registerPath>[0]);
}

const N = registry.register("NotificationItem", NotificationSchema);
const P = registry.register("NotificationPreferenceItem", PreferenceSchema);

path("get", "/notifications", "List my notifications", `${own} Newest first; filter \`unread\`, \`type\`.`, { request: { query: NotificationListQuerySchema.innerType() }, responses: { 200: json(listOf(N)), ...errors(400, 401) } });
path("get", "/notifications/unread-count", "Unread count (for the header bell)", own, { responses: { 200: json(dataOf(z.object({ count: z.number().int() }))), ...errors(401) } });
path("post", "/notifications/{id}/read", "Mark one as read", own, { request: { params: IdParams }, responses: { 200: json(dataOf(N)), ...errors(401, 404) } });
path("post", "/notifications/read-all", "Mark all as read", own, { responses: { 200: json(dataOf(z.object({ updated: z.number().int() }))), ...errors(401) } });
path("get", "/notification-preferences", "My notification preferences", `${own} In-app is always on; email per type (defaults per type).`, { responses: { 200: json(dataOf(z.array(P))), ...errors(401) } });
path("patch", "/notification-preferences", "Change email preferences", own, {
  request: { body: { required: true, content: { "application/json": { schema: UpdatePreferencesSchema } } } },
  responses: { 200: json(dataOf(z.array(P))), ...errors(400, 401) },
});
