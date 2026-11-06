import { z } from "@/shared/validation/zod";
import { AUTHENTICATED, dataOf, errors, IdParams, json, listOf, registry } from "@/shared/openapi/registry";
import { NotificationListQuerySchema, NotificationSchema, PreferenceSchema, PushDeviceSchema, RegisterPushDeviceSchema, UpdatePreferencesSchema } from "../application/dto";

const tags = ["Notifications"];
const own = "Any signed-in user; only their own notifications.";

function path(method: "get" | "post" | "patch" | "delete", p: string, summary: string, description: string, extra: Record<string, unknown>) {
  registry.registerPath({ method, path: p, tags, summary, description, security: AUTHENTICATED, ...extra } as Parameters<typeof registry.registerPath>[0]);
}

const N = registry.register("NotificationItem", NotificationSchema);
const P = registry.register("NotificationPreferenceItem", PreferenceSchema);

path("get", "/notifications", "List my notifications", `${own} Newest first; filter \`unread\`, \`type\`.`, { request: { query: NotificationListQuerySchema.innerType() }, responses: { 200: json(listOf(N)), ...errors(400, 401) } });
path("get", "/notifications/unread-count", "Unread count (for the header bell)", own, { responses: { 200: json(dataOf(z.object({ count: z.number().int() }))), ...errors(401) } });
path("post", "/notifications/{id}/read", "Mark one as read", own, { request: { params: IdParams }, responses: { 200: json(dataOf(N)), ...errors(401, 404) } });
path("post", "/notifications/read-all", "Mark all as read", own, { responses: { 200: json(dataOf(z.object({ updated: z.number().int() }))), ...errors(401) } });
path("get", "/notification-preferences", "My notification preferences", `${own} In-app is always on; email per type (defaults per type); push per type (on by default, none for email-only types).`, { responses: { 200: json(dataOf(z.array(P))), ...errors(401) } });
path("patch", "/notification-preferences", "Change email and push preferences", `${own} Each item changes only the channels it gives (\`email\`, \`push\` or both).`, {
  request: { body: { required: true, content: { "application/json": { schema: UpdatePreferencesSchema } } } },
  responses: { 200: json(dataOf(z.array(P))), ...errors(400, 401) },
});

/* ── push devices (mobile app) ── */

const D = registry.register("PushDeviceItem", PushDeviceSchema);
const devices = "Any signed-in user; only their own phones.";

path(
  "get",
  "/push-devices",
  "My phones registered for push",
  `${devices} Most recently seen first.`,
  { responses: { 200: json(dataOf(z.array(D))), ...errors(401) } },
);
path(
  "post",
  "/push-devices",
  "Register this phone for push notifications",
  `${devices} Send the FCM registration token after sign-in, on every app start and whenever Firebase rotates it. ` +
    "Re-registering the same token updates it (200); a token last used by someone else moves to the caller. At most 10 phones per user (the one seen least recently is dropped). " +
    "Each push carries `data.notificationId`, `data.type` and `data.link` (an app path such as `/stock/{id}`); iOS gets the unread count as the badge.",
  {
    request: { body: { required: true, content: { "application/json": { schema: RegisterPushDeviceSchema } } } },
    responses: { 200: json(dataOf(D), "Already registered (refreshed)"), 201: json(dataOf(D), "Registered"), ...errors(400, 401) },
  },
);
path("delete", "/push-devices/{id}", "Stop push to this phone", `${devices} Call it on sign-out, before \`POST /auth/logout\`.`, {
  request: { params: IdParams },
  responses: { 204: { description: "Removed" }, ...errors(401, 404) },
});
