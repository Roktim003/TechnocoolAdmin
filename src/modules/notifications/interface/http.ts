import { NotFoundError } from "@/shared/errors/app-error";
import { authedRoute } from "@/shared/http/route";
import { pageMeta } from "@/shared/pagination/list-query";
import { UuidSchema } from "@/shared/validation/zod";
import { NotificationListQuerySchema, UpdatePreferencesSchema } from "../application/dto";
import type { NotificationRecord } from "../application/ports";
import { notifications } from "./container";

export const toNotificationDto = (n: NotificationRecord) => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  link: n.link,
  readAt: n.readAt ? n.readAt.toISOString() : null,
  createdAt: n.createdAt.toISOString(),
});

/** Every signed-in user has their own inbox and preferences (no module permission needed). */
export const notificationHandlers = {
  list: authedRoute({}, async (ctx) => {
    const query = ctx.query(NotificationListQuerySchema);
    const { items, total } = await notifications().service.list(ctx.principal.userId, query);
    return { data: items.map(toNotificationDto), meta: pageMeta(total, query.page, query.pageSize) };
  }),
  unreadCount: authedRoute({}, async (ctx) => ({ data: { count: await notifications().service.unreadCount(ctx.principal.userId) } })),
  markRead: authedRoute<{ id: string }>({}, async (ctx) => {
    const parsed = UuidSchema.safeParse(ctx.params.id);
    if (!parsed.success) throw new NotFoundError("Notification");
    return { data: toNotificationDto(await notifications().service.markRead(ctx.principal.userId, parsed.data)) };
  }),
  readAll: authedRoute({}, async (ctx) => ({ data: { updated: await notifications().service.markAllRead(ctx.principal.userId) } })),
  getPreferences: authedRoute({}, async (ctx) => ({ data: await notifications().service.preferences(ctx.principal.userId) })),
  updatePreferences: authedRoute({}, async (ctx) => {
    const { preferences } = await ctx.body(UpdatePreferencesSchema);
    return { data: await notifications().service.updatePreferences(ctx.principal.userId, preferences) };
  }),
};
