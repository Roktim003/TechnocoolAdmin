import { z, emptyToUndefined } from "@/shared/validation/zod";
import { listQuerySchema } from "@/shared/pagination/list-query";
import { MoneySchema } from "@/shared/money/money";
import { DateRangeFilters } from "@/shared/time/dates";
import { booleanLike, Email, IsoDate, Name, nullableId, text, upper } from "@/modules/inventory/application/dto";
import { COST_CATEGORIES, PROJECT_STATUSES, PROJECT_TYPES } from "../domain/types";

export const ProjectStatusSchema = z.preprocess(upper, z.enum(PROJECT_STATUSES)).openapi({ type: "string", enum: [...PROJECT_STATUSES] });
export const ProjectTypeSchema = z.preprocess(upper, z.enum(PROJECT_TYPES)).openapi({ type: "string", enum: [...PROJECT_TYPES] });
export const CostCategorySchema = z.preprocess(upper, z.enum(COST_CATEGORIES)).openapi({ type: "string", enum: [...COST_CATEGORIES] });

const nullableDate = z.preprocess((v) => (v === "" ? null : v), IsoDate.nullable().optional());
const Reason = z.string().trim().min(3, "Give a reason (at least 3 characters).").max(500);

const projectFields = {
  clientContactPerson: text(100),
  clientPhone: text(30),
  clientEmail: Email,
  siteAddress: text(300),
  projectType: ProjectTypeSchema.optional(),
  defaultWarehouseId: nullableId.openapi({ description: "Supplying warehouse (default for issues)" }),
  startDate: nullableDate.openapi({ type: "string", example: "2026-11-01" }),
  expectedEndDate: nullableDate.openapi({ type: "string", example: "2027-03-31" }),
  siteEngineerUserId: nullableId.openapi({ description: "A user (notified of status changes)" }),
  siteEngineerName: text(100).openapi({ description: "Free text when the engineer isn't a user" }),
  contractValue: z.preprocess((v) => (v === "" ? null : v), MoneySchema.nullable().optional()).openapi({ type: "string", description: "Only projects FULL + seeMargin" }),
  notes: text(2000),
};

export const CreateProjectSchema = z
  .object({
    name: Name,
    clientName: z.string().trim().min(1, "Client is required.").max(150),
    status: ProjectStatusSchema.default("PLANNING").openapi({ description: "Starting status: PLANNING or RUNNING" }),
    ...projectFields,
  })
  .strict()
  .openapi("CreateProjectRequest");

export const UpdateProjectSchema = z
  .object({ name: Name.optional(), clientName: z.string().trim().min(1, "Client is required.").max(150).optional(), ...projectFields, isActive: z.boolean().optional() })
  .strict()
  .openapi("UpdateProjectRequest");

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

export const ChangeStatusSchema = z
  .object({ toStatus: ProjectStatusSchema, reason: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), Reason.optional()) })
  .strict()
  .openapi("ChangeProjectStatusRequest");

export const ProjectListQuerySchema = listQuerySchema({
  sortFields: ["name", "code", "startDate", "createdAt", "totalCost"],
  defaultSort: "-code",
  filters: {
    status: emptyToUndefined(ProjectStatusSchema),
    projectType: emptyToUndefined(ProjectTypeSchema),
    siteEngineerUserId: emptyToUndefined(z.string().uuid()),
    warehouseId: emptyToUndefined(z.string().uuid()).openapi({ description: "Supplying (default) warehouse" }),
    active: emptyToUndefined(booleanLike).openapi({ type: "boolean" }),
    dateFrom: DateRangeFilters.from.openapi({ description: "Start date from" }),
    dateTo: DateRangeFilters.to.openapi({ description: "Start date to" }),
  },
});

export const ProjectOptionsQuerySchema = z
  .object({
    type: emptyToUndefined(z.preprocess(upper, z.enum(["ISSUE_TO_PROJECT", "RETURN_FROM_SITE"]))).openapi({ description: "Entry type: issues need planning / running projects; returns any status but closed. Omitted: any status but closed." }),
    q: z.string().trim().max(100).optional(),
  })
  .strict();

export const EntriesQuerySchema = listQuerySchema({
  sortFields: ["entryDate"],
  defaultSort: "-entryDate",
  filters: { type: emptyToUndefined(z.preprocess(upper, z.enum(["ISSUE_TO_PROJECT", "RETURN_FROM_SITE", "REVERSAL"]))), status: emptyToUndefined(z.preprocess(upper, z.enum(["PENDING", "POSTED", "REJECTED", "CANCELLED", "REVERSED"]))) },
});

export const CostListQuerySchema = z
  .object({ category: emptyToUndefined(CostCategorySchema), includeVoided: emptyToUndefined(booleanLike).openapi({ type: "boolean" }) })
  .strict();

export const AddCostSchema = z
  .object({
    date: IsoDate.optional().openapi({ description: "Defaults to today (Asia/Dhaka)" }),
    category: CostCategorySchema,
    description: z.string().trim().min(1, "Describe the cost.").max(300),
    amount: MoneySchema.refine((v) => Number(v) > 0, "Enter an amount above 0."),
    vendorOrPayee: text(150),
    referenceNo: text(100),
  })
  .strict()
  .openapi("AddProjectCostRequest");
export type AddCostInput = z.infer<typeof AddCostSchema>;

export const VoidCostSchema = z.object({ reason: Reason }).strict().openapi("VoidProjectCostRequest");
