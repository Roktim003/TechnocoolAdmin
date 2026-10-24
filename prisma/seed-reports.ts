/**
 * Sample scheduled report emails for demo installs (SEED_SAMPLE_DATA not "false"), created once,
 * while there are no schedules yet. All owned by the first Admin and sent to the Admin only, so
 * no one receives data they couldn't open in the app:
 *  - Stock summary, weekly on Sunday 09:00, Excel;
 *  - Low stock, daily 08:30, PDF;
 *  - Sales (last month), monthly on the 1st 09:00, Excel + PDF.
 */
import type { PrismaClient } from "@prisma/client";
import { ADMIN_ROLE_NAME } from "@/modules/identity/domain/seed-roles";
import { roleNameKey } from "@/modules/identity/domain/rules";
import { nextRunAt, type ScheduleTiming } from "@/modules/reporting/domain/schedule";

const SAMPLES: (ScheduleTiming & { reportId: string; params: Record<string, string>; format: "XLSX" | "PDF" | "BOTH" })[] = [
  { reportId: "stock-summary", params: {}, frequency: "WEEKLY", dayOfWeek: 0, dayOfMonth: null, time: "09:00", format: "XLSX" },
  { reportId: "low-stock", params: {}, frequency: "DAILY", dayOfWeek: null, dayOfMonth: null, time: "08:30", format: "PDF" },
  { reportId: "sales", params: { dateFrom: "lastMonthStart", dateTo: "lastMonthEnd" }, frequency: "MONTHLY", dayOfWeek: null, dayOfMonth: 1, time: "09:00", format: "BOTH" },
];

export async function seedSampleSchedules(prisma: PrismaClient, log: (msg: string) => void) {
  if ((await prisma.reportSchedule.count()) > 0) return;
  const admin = await prisma.user.findFirst({ where: { role: { nameKey: roleNameKey(ADMIN_ROLE_NAME) }, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!admin) return;
  const now = new Date();
  for (const s of SAMPLES) {
    await prisma.reportSchedule.create({
      data: {
        reportId: s.reportId,
        params: s.params,
        frequency: s.frequency,
        dayOfWeek: s.dayOfWeek ?? null,
        dayOfMonth: s.dayOfMonth ?? null,
        time: s.time,
        format: s.format,
        recipientUserIds: [admin.id],
        externalEmails: [],
        ownerId: admin.id,
        isActive: true,
        nextRunAt: nextRunAt(s, now),
      },
    });
  }
  log(`reports: ${SAMPLES.length} sample scheduled emails (to ${admin.username})`);
}
