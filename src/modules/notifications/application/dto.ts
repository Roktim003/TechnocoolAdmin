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
  .object({
    type: z.string(),
    label: z.string(),
    description: z.string(),
    inApp: z.boolean(),
    email: z.boolean(),
    push: z.boolean().openapi({ description: "Push to the user's phones. On by default; always false for email-only types (digests)." }),
  })
  .openapi("NotificationPreference");

export const UpdatePreferencesSchema = z
  .object({
    preferences: z
      .array(
        z
          .object({ type: z.string().min(1).max(60), email: z.boolean().optional(), push: z.boolean().optional() })
          .strict()
          .refine((p) => p.email !== undefined || p.push !== undefined, { message: "Give email, push or both." }),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .openapi("UpdateNotificationPreferencesRequest", { description: "Only the channels given change." });

/* ── push devices (mobile app) ── */

const upper = (v: unknown) => (typeof v === "string" ? v.toUpperCase() : v);

export const RegisterPushDeviceSchema = z
  .object({
    token: z.string().trim().min(20).max(1024).openapi({ description: "FCM registration token from the Firebase Messaging SDK (Android and iOS)" }),
    platform: z.preprocess(upper, z.enum(["ANDROID", "IOS"])),
    deviceName: emptyToUndefined(z.string().trim().max(100)).openapi({ example: "Rahim's Galaxy A15" }),
    appVersion: emptyToUndefined(z.string().trim().max(40)).openapi({ example: "1.0.3" }),
  })
  .strict()
  .openapi("RegisterPushDeviceRequest");

export const PushDeviceSchema = z
  .object({
    id: z.string().uuid(),
    platform: z.enum(["ANDROID", "IOS"]),
    deviceName: z.string().nullable(),
    appVersion: z.string().nullable(),
    lastSeenAt: z.string(),
    createdAt: z.string(),
  })
  .openapi("PushDevice");
