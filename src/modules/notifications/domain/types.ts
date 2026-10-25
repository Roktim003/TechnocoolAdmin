/**
 * Notification types. Later modules add their own here (and the seed upserts them).
 * `inApp: false` types are email-only (e.g. the daily digest).
 */
export interface NotificationTypeDef {
  key: string;
  label: string;
  description: string;
  defaultEmail: boolean;
  inApp: boolean;
}

export const NOTIFICATION_TYPES = [
  { key: "STOCK_ENTRY_SUBMITTED", label: "Entry waiting for verification", description: "Someone submitted a stock entry in your warehouse for you to approve.", defaultEmail: true, inApp: true },
  { key: "STOCK_ENTRY_APPROVED", label: "Your entry was approved", description: "A stock entry you created was approved and posted.", defaultEmail: false, inApp: true },
  { key: "STOCK_ENTRY_REJECTED", label: "Your entry was rejected", description: "A stock entry you created was rejected, with the reason.", defaultEmail: true, inApp: true },
  { key: "TRANSFER_DISPATCHED", label: "Transfer on its way", description: "Goods were dispatched to your warehouse.", defaultEmail: true, inApp: true },
  { key: "TRANSFER_SHORTAGE", label: "Transfer received short", description: "A transfer from your warehouse arrived with a shortage.", defaultEmail: true, inApp: true },
  { key: "STOCK_COUNT_SUBMITTED", label: "Stock count waiting for approval", description: "A stock count in your warehouse was submitted for review.", defaultEmail: true, inApp: true },
  { key: "STOCK_COUNT_RECOUNT", label: "Recount requested", description: "An approver asked for some lines of a count to be counted again.", defaultEmail: true, inApp: true },
  { key: "STOCK_COUNT_APPROVED", label: "Stock count approved", description: "A count you created or counted was approved.", defaultEmail: false, inApp: true },
  { key: "LOW_STOCK", label: "Product below minimum", description: "A product's available stock fell below its minimum level.", defaultEmail: true, inApp: true },
  { key: "LOW_STOCK_DIGEST", label: "Daily low-stock digest", description: "A morning email listing every product below its minimum.", defaultEmail: true, inApp: false },
  { key: "PO_SUBMITTED", label: "Purchase order waiting for approval", description: "A purchase order was submitted for you to approve.", defaultEmail: true, inApp: true },
  { key: "PO_APPROVED", label: "Your purchase order was approved", description: "A purchase order you created was approved.", defaultEmail: false, inApp: true },
  { key: "PO_REJECTED", label: "Your purchase order was rejected", description: "A purchase order you created was rejected, with the reason.", defaultEmail: true, inApp: true },
  { key: "PO_GOODS_RECEIVED", label: "Goods received against your PO", description: "A GRN against a purchase order you created was posted.", defaultEmail: false, inApp: true },
  { key: "PO_FULLY_RECEIVED", label: "Purchase order fully received", description: "Everything on a purchase order you created has been received.", defaultEmail: true, inApp: true },
  { key: "PROJECT_COST_ALERT", label: "Project cost near the contract value", description: "A project's total cost reached 90% or 100% of its contract value.", defaultEmail: true, inApp: true },
  { key: "PROJECT_STATUS_CHANGED", label: "Your project changed status", description: "A project you are the site engineer of was started, put on hold, completed, closed or reopened.", defaultEmail: false, inApp: true },
  { key: "REPORT_SCHEDULE_FAILED", label: "Scheduled report failed", description: "A scheduled report email could not run (for example its owner was disabled or lost access).", defaultEmail: true, inApp: true },
  { key: "BACKUP_FAILED", label: "Backup failed", description: "A database backup, or its off-site copy, failed (Admins).", defaultEmail: true, inApp: true },
  { key: "RESTORE_TEST_FAILED", label: "Restore test failed", description: "The monthly test restore of the latest backup failed its checks (Admins).", defaultEmail: true, inApp: true },
  { key: "INTEGRITY_CHECK_FAILED", label: "Integrity check found problems", description: "The nightly ledger check found balances, costs or numbers that don't add up (Admins).", defaultEmail: true, inApp: true },
  { key: "BACKGROUND_JOBS_FAILING", label: "Background jobs failing", description: "More background jobs failed in the last hour than the alert threshold (Admins).", defaultEmail: true, inApp: true },
  { key: "PO_OVERDUE_DIGEST", label: "Daily overdue purchase orders", description: "A 9:00 AM email listing purchase orders past their expected delivery date.", defaultEmail: true, inApp: false },
] as const satisfies readonly NotificationTypeDef[];

export type NotificationTypeKey = (typeof NOTIFICATION_TYPES)[number]["key"];

export const notificationType = (key: string): NotificationTypeDef | undefined => NOTIFICATION_TYPES.find((t) => t.key === key);
