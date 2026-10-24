import { z } from "@/shared/validation/zod";
import { listQuerySchema } from "@/shared/pagination/list-query";
import { upper } from "@/modules/inventory/application/dto";
import { FREQUENCIES } from "../domain/schedule";
import { SCREEN_MAX_PAGE_SIZE } from "./report.service";

const FILE_FORMATS = ["XLSX", "PDF", "BOTH"] as const;

/** Report filters travel as a flat string map (the same keys as the screen's URL). */
const Params = z.record(z.union([z.string(), z.number(), z.boolean()]).transform(String)).default({}).openapi({ type: "object", additionalProperties: { type: "string" }, example: { dateFrom: "monthStart", dateTo: "today", warehouseId: "…" } });

export const RunQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(SCREEN_MAX_PAGE_SIZE).default(50).openapi({ description: `Rows per page (max ${SCREEN_MAX_PAGE_SIZE})` }),
    sort: z.string().optional().openapi({ description: "Column sort keys, '-' for descending (see the report's sortFields)" }),
  })
  .passthrough()
  .openapi("ReportRunQuery", { description: "Plus the report's own filters (see `params` in GET /reports)." });

export const ExportRequestSchema = z
  .object({
    format: z.preprocess((v) => (typeof v === "string" ? v.toLowerCase() : v), z.enum(["xlsx", "pdf"])),
    params: Params,
    sort: z.string().max(200).optional(),
  })
  .strict()
  .openapi("ReportExportRequest");

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (24-hour), e.g. 09:00.").openapi({ example: "09:00", description: "Asia/Dhaka" });
const Emails = z.array(z.string().trim().toLowerCase().email("Enter valid email addresses.")).max(20).default([]);

const scheduleFields = {
  reportId: z.string().min(1).max(60),
  params: Params,
  frequency: z.preprocess(upper, z.enum(FREQUENCIES)).openapi({ type: "string", enum: [...FREQUENCIES] }),
  dayOfWeek: z.coerce.number().int().min(0).max(6).nullable().optional().openapi({ description: "WEEKLY: 0 = Sunday … 6 = Saturday" }),
  dayOfMonth: z.coerce.number().int().min(1).max(31).nullable().optional().openapi({ description: "MONTHLY: 1–31 (31 = the last day of every month)" }),
  time: Time,
  format: z.preprocess(upper, z.enum(FILE_FORMATS)).openapi({ type: "string", enum: [...FILE_FORMATS] }),
  recipientUserIds: z.array(z.string().uuid()).max(50).default([]),
  externalEmails: Emails.openapi({ description: "Reports FULL only" }),
  isActive: z.boolean().default(true),
};

export const CreateScheduleSchema = z
  .object(scheduleFields)
  .strict()
  .transform((v) => ({ ...v, dayOfWeek: v.dayOfWeek ?? null, dayOfMonth: v.dayOfMonth ?? null }))
  .openapi("CreateReportScheduleRequest");

export const UpdateScheduleSchema = z
  .object({
    reportId: scheduleFields.reportId.optional(),
    params: Params.optional(),
    frequency: scheduleFields.frequency.optional(),
    dayOfWeek: scheduleFields.dayOfWeek,
    dayOfMonth: scheduleFields.dayOfMonth,
    time: Time.optional(),
    format: scheduleFields.format.optional(),
    recipientUserIds: z.array(z.string().uuid()).max(50).optional(),
    externalEmails: z.array(z.string().trim().toLowerCase().email("Enter valid email addresses.")).max(20).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .openapi("UpdateReportScheduleRequest");

export const ScheduleListQuerySchema = listQuerySchema({
  sortFields: ["createdAt", "nextRunAt", "reportId"],
  defaultSort: "-createdAt",
  filters: {
    reportId: z.string().max(60).optional(),
    ownerId: z.string().uuid().optional().openapi({ description: "Reports FULL only (others always see their own)" }),
  },
});

export const RunsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const ProductLookupQuerySchema = z.object({ q: z.string().trim().max(100).default("") });
