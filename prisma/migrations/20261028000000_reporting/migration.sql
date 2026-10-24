-- CreateEnum
CREATE TYPE "ReportFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ReportFileFormat" AS ENUM ('XLSX', 'PDF', 'BOTH');

-- CreateEnum
CREATE TYPE "ReportRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportRunTrigger" AS ENUM ('SCHEDULE', 'MANUAL');

-- CreateTable
CREATE TABLE "ReportSchedule" (
    "id" UUID NOT NULL,
    "reportId" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "frequency" "ReportFrequency" NOT NULL,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "time" TEXT NOT NULL,
    "format" "ReportFileFormat" NOT NULL DEFAULT 'XLSX',
    "recipientUserIds" UUID[],
    "externalEmails" TEXT[],
    "ownerId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" "ReportRunStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportScheduleRun" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "trigger" "ReportRunTrigger" NOT NULL DEFAULT 'SCHEDULE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "ReportRunStatus" NOT NULL DEFAULT 'RUNNING',
    "error" TEXT,
    "rowCount" INTEGER,
    "fileKeys" TEXT[],
    "files" JSONB NOT NULL DEFAULT '[]',
    "emailed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReportScheduleRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportSchedule_isActive_nextRunAt_idx" ON "ReportSchedule"("isActive", "nextRunAt");

-- CreateIndex
CREATE INDEX "ReportSchedule_ownerId_idx" ON "ReportSchedule"("ownerId");

-- CreateIndex
CREATE INDEX "ReportScheduleRun_scheduleId_startedAt_idx" ON "ReportScheduleRun"("scheduleId", "startedAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_createdAt_idx" ON "AuditLog"("entityType", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "StockEntry_type_status_entryDate_idx" ON "StockEntry"("type", "status", "entryDate");

-- CreateIndex
CREATE INDEX "StockMovement_warehouseId_postedAt_idx" ON "StockMovement"("warehouseId", "postedAt");

-- CreateIndex
CREATE INDEX "StockMovement_productId_postedAt_idx" ON "StockMovement"("productId", "postedAt");

-- AddForeignKey
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportScheduleRun" ADD CONSTRAINT "ReportScheduleRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ReportSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Schedule rules the application also enforces.
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_time_check" CHECK ("time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_dayOfWeek_check" CHECK ("dayOfWeek" IS NULL OR "dayOfWeek" BETWEEN 0 AND 6);
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_dayOfMonth_check" CHECK ("dayOfMonth" IS NULL OR "dayOfMonth" BETWEEN 1 AND 31);
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_day_check" CHECK (
  ("frequency" = 'DAILY') OR ("frequency" = 'WEEKLY' AND "dayOfWeek" IS NOT NULL) OR ("frequency" = 'MONTHLY' AND "dayOfMonth" IS NOT NULL)
);
