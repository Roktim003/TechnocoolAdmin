import { z, emptyToUndefined } from "@/shared/validation/zod";
import { listQuerySchema } from "@/shared/pagination/list-query";

const booleanLike = z.preprocess((v) => (v === "true" || v === "1" ? true : v === "false" || v === "0" ? false : v), z.boolean());

export const NotificationListQuerySchema = listQuerySchema({
  sortFields: ["createdAt"],
  defaultSort: "-createdAt",
  filters: {
    unread: emptyToUndefined(booleanLike).openapi({ type: "boolean", description: "Only unread" }),
    type: emptyToUndefined(z.string().max(60)),
  },
});

export const NotificationSchema = z
  .object({
    id: z.string().uuid(),
    type: z.string(),
    title: z.string(),
    body: z.string(),
    link: z.string().nullable(),
    readAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("Notification");

export const PreferenceSchema = z
  .object({ type: z.string(), label: z.string(), description: z.string(), inApp: z.boolean(), email: z.boolean() })
  .openapi("NotificationPreference");

export const UpdatePreferencesSchema = z
  .object({ preferences: z.array(z.object({ type: z.string().min(1).max(60), email: z.boolean() }).strict()).min(1).max(50) })
  .strict()
  .openapi("UpdateNotificationPreferencesRequest");
