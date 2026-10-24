import type { Job } from "bullmq";
import { APP_TIMEZONE } from "@/shared/config/constants";
import { env } from "@/shared/config/env";
import { prisma } from "@/shared/db/prisma";
import { logger, type Logger } from "@/shared/logger/logger";
import { getQueue, QUEUES } from "@/shared/queue/queue";
import { hasLevel } from "@/shared/rbac/levels";
import { notifications } from "@/modules/notifications/interface/container";
import type { PublishInput } from "@/modules/notifications/application/notification.service";
import { renderEmail } from "@/modules/notifications/application/email-template";
import { d } from "@/modules/inventory/domain/decimal";
import { daysBetween, remainingQty } from "../domain/rules";
import type { PoRecord, PurchasingNotifier } from "../application/ports";

const log = logger.child({ component: "purchasing-events" });
const qty = (v: string) => (v.includes(".") ? v.replace(/\.?0+$/, "") : v);

async function publish(input: PublishInput) {
  try {
    await notifications().service.publish(input);
  } catch (err) {
    log.error({ err, type: input.type }, "notification failed");
  }
}

/** Purchasing notifications (notifications module). Errors are logged, never thrown. */
export const purchasingNotifier: PurchasingNotifier = {
  async po(event, po, { actorId, receipt }) {
    const no = po.number ?? po.draftRef;
    const link = `/purchases/${po.id}`;
    const creator = [po.createdBy.id].filter((id) => id !== actorId);
    try {
      switch (event) {
        case "submitted":
          return publish({
            type: "PO_SUBMITTED",
            userIds: await notifications().recipients.withModuleLevel("purchasing", "APPROVE", { warehouseId: po.deliverTo.id, exclude: [po.createdBy.id, actorId] }),
            title: `${no} needs approval`,
            body: `${po.createdBy.name} submitted a purchase order to ${po.supplier.name} (${po.lines.length} item${po.lines.length === 1 ? "" : "s"}, deliver to ${po.deliverTo.name}).`,
            link,
          });
        case "approved":
          return publish({ type: "PO_APPROVED", userIds: creator, title: `${no} was approved`, body: `${po.approvedBy?.name ?? "An approver"} approved your purchase order to ${po.supplier.name}.`, link });
        case "rejected":
          return publish({ type: "PO_REJECTED", userIds: creator, title: `${no} was rejected`, body: `${po.rejectedBy?.name ?? "An approver"} rejected your purchase order: “${po.rejectionReason ?? ""}”. Edit it and submit again.`, link });
        case "received": {
          const done = po.lines.reduce((s, l) => s.plus(d(l.receivedQty)), d(0));
          const all = po.lines.reduce((s, l) => s.plus(d(l.qty)), d(0));
          return publish({
            type: "PO_GOODS_RECEIVED",
            userIds: creator,
            title: `Goods received against ${no}`,
            body: `${receipt?.number ?? "A GRN"} was posted at ${po.deliverTo.name}. ${qty(done.toFixed(3))} of ${qty(all.toFixed(3))} received so far.`,
            link,
          });
        }
        case "fully_received":
          return publish({ type: "PO_FULLY_RECEIVED", userIds: creator, title: `${no} is fully received`, body: `Everything on your purchase order to ${po.supplier.name} has been received.`, link });
      }
    } catch (err) {
      log.error({ err, event, purchaseOrderId: po.id }, "PO event failed");
    }
  },

  /** One email per recipient (purchasing ≥ CREATE, email on), listing the overdue POs of their warehouses. */
  async overdueDigest(pos, today) {
    const users = await prisma.user.findMany({
      where: { status: "ACTIVE", email: { not: null } },
      select: { id: true, email: true, role: { select: { permissions: { where: { module: "purchasing" }, select: { level: true } } } }, warehouses: { select: { warehouseId: true } } },
    });
    const prefs = await prisma.notificationPreference.findMany({ where: { type: "PO_OVERDUE_DIGEST", userId: { in: users.map((u) => u.id) } }, select: { userId: true, email: true } });
    const off = new Set(prefs.filter((p) => !p.email).map((p) => p.userId));
    const date = new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIMEZONE, day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${today}T06:00:00Z`));
    const service = notifications().service;
    let emailed = 0;
    for (const u of users) {
      if (off.has(u.id) || !hasLevel(u.role.permissions[0]?.level ?? "NONE", "CREATE")) continue;
      const scope = new Set(u.warehouses.map((w) => w.warehouseId));
      const mine = pos.filter((p) => scope.has(p.deliverTo.id));
      if (!mine.length) continue;
      const content = overdueDigestContent(mine, today, date);
      await service.queueEmail({ to: u.email!, subject: `StockBook — ${mine.length} overdue purchase order${mine.length === 1 ? "" : "s"} (${date})`, ...content }, "PO_OVERDUE_DIGEST");
      emailed++;
    }
    return emailed;
  },
};

/** The digest email: PO, supplier, deliver to, expected date, days late, quantity still due. */
export function overdueDigestContent(pos: PoRecord[], today: string, date: string) {
  return renderEmail({
    title: `${pos.length} purchase order${pos.length === 1 ? " is" : "s are"} overdue`,
    paragraphs: [`Daily digest for ${date}. These POs are past their expected delivery date and goods are still due.`],
    table: {
      head: ["PO", "Supplier", "Deliver to", "Expected", "Days late", "Still due"],
      rows: pos.map((p) => [
        p.number ?? p.draftRef,
        p.supplier.name,
        p.deliverTo.code,
        p.expectedDeliveryDate ?? "—",
        String(daysBetween(p.expectedDeliveryDate!, today)),
        qty(p.lines.reduce((s, l) => s.plus(remainingQty(l)), d(0)).toFixed(3)),
      ]),
      alignRight: [4, 5],
    },
    link: `${env().APP_URL.replace(/\/$/, "")}/purchases?overdue=1`,
    linkLabel: "Open overdue purchase orders",
  });
}

const DIGEST_SCHEDULER = "po-overdue-digest";
/** 09:00 Asia/Dhaka every day. */
export const PO_DIGEST_CRON = "0 9 * * *";

/** Registers the repeatable digest job (idempotent; the worker calls it on start). */
export async function ensurePoDigestSchedule(jobLog: Logger) {
  await getQueue(QUEUES.purchasing).upsertJobScheduler(DIGEST_SCHEDULER, { pattern: PO_DIGEST_CRON, tz: APP_TIMEZONE }, { name: "po-overdue-digest", data: {}, opts: { removeOnComplete: 100, removeOnFail: 100 } });
  jobLog.info({ cron: PO_DIGEST_CRON, tz: APP_TIMEZONE }, "PO overdue digest scheduled");
}

/** BullMQ processor for the `purchasing` queue (worker). */
export async function processPurchasingJob(job: Job, jobLog: Logger) {
  const { purchasing } = await import("./container");
  if (job.name === "po-overdue-digest") {
    const r = await purchasing().orders.overdueDigest();
    jobLog.info({ jobId: job.id, ...r }, "PO overdue digest sent");
    return r;
  }
  throw new Error(`Unknown purchasing job ${job.name}`);
}
