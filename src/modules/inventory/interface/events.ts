import type { Job } from "bullmq";
import { APP_TIMEZONE } from "@/shared/config/constants";
import { logger, type Logger } from "@/shared/logger/logger";
import { getQueue, QUEUES } from "@/shared/queue/queue";
import { notifications } from "@/modules/notifications/interface/container";
import type { PublishInput } from "@/modules/notifications/application/notification.service";
import { renderEmail } from "@/modules/notifications/application/email-template";
import { env } from "@/shared/config/env";
import { ENTRY_TYPE_META } from "../domain/types";
import type { AlertNotifier, AlertSettingsRecord, DigestScheduler, LowStockRow } from "../application/alerts.service";
import type { InventoryEvents } from "../application/ports";

const log = logger.child({ component: "inventory-events" });
const qty = (v: string) => (v.includes(".") ? v.replace(/\.?0+$/, "") : v);

async function publish(input: PublishInput) {
  try {
    await notifications().service.publish(input);
  } catch (err) {
    log.error({ err, type: input.type }, "notification failed");
  }
}

/** Notifications for stock entries and counts, plus the low-stock check after every stock change. */
export const inventoryEvents: InventoryEvents = {
  async entry(event, e, { actorId, shortage }) {
    const r = notifications().recipients;
    const no = e.number ?? e.draftRef;
    const label = ENTRY_TYPE_META[e.type].label;
    const link = `/stock/${e.id}`;
    const items = `${e.lines.length} item${e.lines.length === 1 ? "" : "s"}`;
    try {
      switch (event) {
        case "submitted":
          return publish({
            type: "STOCK_ENTRY_SUBMITTED",
            userIds: await r.withModuleLevel("inventory", "APPROVE", { warehouseId: e.warehouse.id, exclude: [e.createdBy.id] }),
            title: `${no} needs verification`,
            body: `${e.createdBy.name} submitted a ${label.toLowerCase()} in ${e.warehouse.name} (${items}).`,
            link,
          });
        case "approved":
          return publish({ type: "STOCK_ENTRY_APPROVED", userIds: [e.createdBy.id].filter((id) => id !== actorId), title: `${no} was approved`, body: `${e.verifiedBy?.name ?? "An approver"} approved your ${label.toLowerCase()} in ${e.warehouse.name}.`, link });
        case "rejected":
          return publish({
            type: "STOCK_ENTRY_REJECTED",
            userIds: [e.createdBy.id].filter((id) => id !== actorId),
            title: `${no} was rejected`,
            body: `${e.verifiedBy?.name ?? "An approver"} rejected your ${label.toLowerCase()}: “${e.rejectionReason ?? ""}”. Edit it and submit again.`,
            link,
          });
        case "dispatched":
          if (!e.toWarehouse) return;
          return publish({
            type: "TRANSFER_DISPATCHED",
            userIds: await r.withModuleLevel("inventory", "VIEW", { warehouseId: e.toWarehouse.id, exclude: [actorId] }),
            title: `Transfer ${no} is on its way to ${e.toWarehouse.name}`,
            body: `${items} dispatched from ${e.warehouse.name}${e.vehicle ? ` (vehicle ${e.vehicle})` : ""}. Count the goods and receive the transfer when they arrive.`,
            link: `${link}#receive`,
          });
        case "received":
          if (!shortage) return;
          return publish({
            type: "TRANSFER_SHORTAGE",
            userIds: await r.withModuleLevel("inventory", "APPROVE", { warehouseId: e.warehouse.id, exclude: [actorId] }),
            title: `Transfer ${no} arrived short`,
            body: `${e.toWarehouse?.name ?? "The destination"} received less than was sent: ${shortage.lines.map((l) => `${l.product.code} ${qty(l.qty)}`).join(", ")}. Write-off ${shortage.number} is waiting for verification.`,
            link: `/stock/${shortage.id}`,
          });
        default:
          return;
      }
    } catch (err) {
      log.error({ err, event, entryId: e.id }, "entry event failed");
    }
  },

  async count(event, c, { actorId }) {
    const r = notifications().recipients;
    const link = `/stock/counts/${c.id}`;
    try {
      switch (event) {
        case "submitted":
          return publish({
            type: "STOCK_COUNT_SUBMITTED",
            userIds: await r.withModuleLevel("inventory", "APPROVE", { warehouseId: c.warehouse.id, exclude: [actorId] }),
            title: `Stock count ${c.number} is ready for review`,
            body: `The count of ${c.warehouse.name} was submitted. Review the variances and approve it.`,
            link,
          });
        case "recount":
          return publish({
            type: "STOCK_COUNT_RECOUNT",
            userIds: [c.createdById, ...c.counterIds].filter((id) => id !== actorId),
            title: `Recount requested for ${c.number}`,
            body: `${c.recountLines ?? "Some"} line(s) of the ${c.warehouse.name} count must be counted again.`,
            link,
          });
        case "approved":
          return publish({
            type: "STOCK_COUNT_APPROVED",
            userIds: [c.createdById, ...c.counterIds].filter((id) => id !== actorId),
            title: `Stock count ${c.number} was approved`,
            body: `The count of ${c.warehouse.name} was approved and any differences were posted.`,
            link,
          });
        default:
          return;
      }
    } catch (err) {
      log.error({ err, event, countId: c.id }, "count event failed");
    }
  },

  async stockChanged(productIds) {
    if (!productIds.length) return;
    try {
      await getQueue(QUEUES.alerts).add("low-stock-check", { productIds }, { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000, removeOnFail: 1000 });
    } catch (err) {
      log.error({ err }, "could not queue the low-stock check");
    }
  },
};

/* ── low-stock alerts (worker) ── */

const lowStockLine = (r: LowStockRow) => `${r.product.code} — ${r.product.name}: ${qty(r.totalAvailable)} ${r.product.unitCode} available, minimum ${qty(r.minStockLevel)}`;

export const alertNotifier: AlertNotifier = {
  async lowStock(rows, roleIds) {
    const userIds = await notifications().recipients.withRoles(roleIds);
    for (const row of rows) {
      await publish({
        type: "LOW_STOCK",
        userIds,
        title: `${row.product.code} is below its minimum`,
        body: `${lowStockLine(row)}. Short by ${qty(row.shortBy)}; suggested reorder ${qty(row.suggestedQty)}.`,
        link: "/stock/low-stock",
      });
    }
  },

  async digest(rows, roleIds) {
    const n = notifications();
    const userIds = await n.recipients.withRoles(roleIds);
    const service = n.service;
    let emailed = 0;
    const date = new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIMEZONE, day: "2-digit", month: "short", year: "numeric" }).format(new Date());
    const { html, text } = renderEmail({
      title: `Low stock — ${rows.length} product${rows.length === 1 ? "" : "s"} below minimum`,
      paragraphs: [`Daily digest for ${date}. Available = good stock on hand minus reserved, all warehouses.`],
      table: {
        head: ["Code", "Product", "Available", "Minimum", "Short by", "Suggested"],
        rows: rows.map((r) => [r.product.code, r.product.name, `${qty(r.totalAvailable)} ${r.product.unitCode}`, qty(r.minStockLevel), qty(r.shortBy), qty(r.suggestedQty)]),
        alignRight: [2, 3, 4, 5],
      },
      link: `${env().APP_URL.replace(/\/$/, "")}/stock/low-stock`,
      linkLabel: "Open the low-stock list",
    });
    for (const user of await digestRecipients(userIds)) {
      await service.queueEmail({ to: user, subject: `StockBook low-stock digest — ${date}`, html, text }, "LOW_STOCK_DIGEST");
      emailed++;
    }
    return emailed;
  },
};

/** Email addresses of the users who keep the digest email on (default on). */
async function digestRecipients(userIds: string[]): Promise<string[]> {
  const { prisma } = await import("@/shared/db/prisma");
  if (!userIds.length) return [];
  const [users, prefs] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds }, status: "ACTIVE", email: { not: null } }, select: { id: true, email: true } }),
    prisma.notificationPreference.findMany({ where: { userId: { in: userIds }, type: "LOW_STOCK_DIGEST" }, select: { userId: true, email: true } }),
  ]);
  const off = new Set(prefs.filter((p) => !p.email).map((p) => p.userId));
  return users.filter((u) => u.email && !off.has(u.id)).map((u) => u.email!);
}

const DIGEST_SCHEDULER = "low-stock-digest";

export const digestScheduler: DigestScheduler = {
  async schedule(s: AlertSettingsRecord) {
    const q = getQueue(QUEUES.alerts);
    if (!s.digestEnabled) {
      await q.removeJobScheduler(DIGEST_SCHEDULER);
      return;
    }
    const [hh, mm] = s.digestTime.split(":").map(Number);
    await q.upsertJobScheduler(DIGEST_SCHEDULER, { pattern: `${mm} ${hh} * * *`, tz: APP_TIMEZONE }, { name: "low-stock-digest", data: {}, opts: { removeOnComplete: 100, removeOnFail: 100 } });
  },
};

/** BullMQ processor for the `alerts` queue (worker). */
export async function processAlertJob(job: Job, jobLog: Logger) {
  const { inventory } = await import("./container");
  if (job.name === "low-stock-check") {
    const r = await inventory().alerts.checkCrossings((job.data as { productIds: string[] }).productIds);
    if (r.crossed.length || r.reset.length) jobLog.info({ jobId: job.id, ...r }, "low-stock crossings");
    return r;
  }
  if (job.name === "low-stock-digest") {
    const r = await inventory().alerts.digest();
    jobLog.info({ jobId: job.id, ...r }, "low-stock digest sent");
    return r;
  }
  throw new Error(`Unknown alerts job ${job.name}`);
}
