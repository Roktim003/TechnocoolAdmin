-- CreateEnum
CREATE TYPE "AdjustmentDirection" AS ENUM ('GAIN', 'LOSS');

-- CreateEnum
CREATE TYPE "OpeningImportStatus" AS ENUM ('QUEUED', 'VALIDATING', 'VALID', 'INVALID', 'COMMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "StockCountScope" AS ENUM ('ALL', 'CATALOG', 'CATEGORY', 'SELECTED_PRODUCTS');

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'COUNTING', 'SUBMITTED', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CountSerialResult" AS ENUM ('FOUND', 'MISSING', 'UNEXPECTED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- AlterEnum
ALTER TYPE "StockEntryType" ADD VALUE 'STOCK_ADJUSTMENT';

-- AlterTable
ALTER TABLE "StockEntryLine" ADD COLUMN     "adjustDirection" "AdjustmentDirection";

-- AlterTable
ALTER TABLE "Warehouse" ADD COLUMN     "openingLockedAt" TIMESTAMP(3),
ADD COLUMN     "openingLockedById" UUID;

-- CreateTable
CREATE TABLE "OpeningImport" (
    "id" UUID NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "OpeningImportStatus" NOT NULL DEFAULT 'QUEUED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "rows" JSONB,
    "errors" JSONB,
    "warnings" JSONB,
    "summary" JSONB,
    "entryIds" UUID[],
    "failedReason" TEXT,
    "createdById" UUID NOT NULL,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpeningImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "warehouseId" UUID NOT NULL,
    "scope" "StockCountScope" NOT NULL,
    "scopeIds" UUID[],
    "blindCount" BOOLEAN NOT NULL DEFAULT false,
    "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "recountRequestedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "submittedById" UUID,
    "approvedById" UUID,
    "adjustmentEntryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" UUID NOT NULL,
    "countId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "condition" "StockCondition" NOT NULL DEFAULT 'GOOD',
    "systemQty" DECIMAL(14,3),
    "countedQty" DECIMAL(14,3),
    "notCounted" BOOLEAN NOT NULL DEFAULT false,
    "countedById" UUID,
    "countedAt" TIMESTAMP(3),
    "recountRequested" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountSerial" (
    "id" UUID NOT NULL,
    "lineId" UUID NOT NULL,
    "serial" TEXT NOT NULL,
    "result" "CountSerialResult" NOT NULL,

    CONSTRAINT "StockCountSerial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lowStockRoleIds" UUID[],
    "digestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "digestTime" TEXT NOT NULL DEFAULT '09:00',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LowStockState" (
    "productId" UUID NOT NULL,
    "isLow" BOOLEAN NOT NULL DEFAULT false,
    "since" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LowStockState_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "NotificationType" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "defaultEmail" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NotificationType_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId","type")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" UUID NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "type" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpeningImport_createdAt_idx" ON "OpeningImport"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_number_key" ON "StockCount"("number");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_adjustmentEntryId_key" ON "StockCount"("adjustmentEntryId");

-- CreateIndex
CREATE INDEX "StockCount_warehouseId_status_idx" ON "StockCount"("warehouseId", "status");

-- CreateIndex
CREATE INDEX "StockCount_status_idx" ON "StockCount"("status");

-- CreateIndex
CREATE INDEX "StockCountLine_productId_idx" ON "StockCountLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountLine_countId_productId_condition_key" ON "StockCountLine"("countId", "productId", "condition");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountSerial_lineId_serial_key" ON "StockCountSerial"("lineId", "serial");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");

-- CreateIndex
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_openingLockedById_fkey" FOREIGN KEY ("openingLockedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningImport" ADD CONSTRAINT "OpeningImport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_adjustmentEntryId_fkey" FOREIGN KEY ("adjustmentEntryId") REFERENCES "StockEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_countedById_fkey" FOREIGN KEY ("countedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountSerial" ADD CONSTRAINT "StockCountSerial_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "StockCountLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LowStockState" ADD CONSTRAINT "LowStockState_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Guards
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_countedQty_nonneg" CHECK ("countedQty" IS NULL OR "countedQty" >= 0);
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_systemQty_nonneg" CHECK ("systemQty" IS NULL OR "systemQty" >= 0);

