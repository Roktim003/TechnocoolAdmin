-- Overhead costs: store charge, holding cost, established cost.
-- Manual amounts on projects (ProjectCost) and per warehouse / company per month (WarehouseCost).
-- They never change stock unit cost, average cost or stock value.

-- CreateEnum
CREATE TYPE "WarehouseCostScope" AS ENUM ('WAREHOUSE', 'COMPANY');

-- CreateEnum
CREATE TYPE "WarehouseCostCategory" AS ENUM ('STORE_CHARGE', 'HOLDING', 'ESTABLISHMENT');

-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'overheads';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProjectCostCategory" ADD VALUE 'STORE_CHARGE';
ALTER TYPE "ProjectCostCategory" ADD VALUE 'HOLDING';
ALTER TYPE "ProjectCostCategory" ADD VALUE 'ESTABLISHMENT';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "fullCostAlertLevel" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProjectCost" ADD COLUMN     "basisNote" TEXT,
ADD COLUMN     "periodFrom" DATE,
ADD COLUMN     "periodTo" DATE,
ADD COLUMN     "updatedById" UUID;

-- CreateTable
CREATE TABLE "WarehouseCost" (
    "id" UUID NOT NULL,
    "scope" "WarehouseCostScope" NOT NULL,
    "warehouseId" UUID,
    "category" "WarehouseCostCategory" NOT NULL,
    "month" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "vendorOrPayee" TEXT,
    "referenceNo" TEXT,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,
    "voidedAt" TIMESTAMP(3),
    "voidedById" UUID,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WarehouseCost_warehouseId_month_category_idx" ON "WarehouseCost"("warehouseId", "month", "category");

-- CreateIndex
CREATE INDEX "WarehouseCost_scope_month_idx" ON "WarehouseCost"("scope", "month");

-- CreateIndex
CREATE INDEX "WarehouseCost_month_idx" ON "WarehouseCost"("month");

-- CreateIndex
CREATE INDEX "ProjectCost_projectId_category_idx" ON "ProjectCost"("projectId", "category");

-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseCost" ADD CONSTRAINT "WarehouseCost_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseCost" ADD CONSTRAINT "WarehouseCost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseCost" ADD CONSTRAINT "WarehouseCost_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseCost" ADD CONSTRAINT "WarehouseCost_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Scope and category must agree: warehouse lines are store charge or holding (with a warehouse),
-- the company line is the established cost (no warehouse). Amounts above 0; month = first day.
ALTER TABLE "WarehouseCost" ADD CONSTRAINT "WarehouseCost_scope_category_check" CHECK (
  ("scope" = 'WAREHOUSE' AND "warehouseId" IS NOT NULL AND "category" IN ('STORE_CHARGE', 'HOLDING'))
  OR ("scope" = 'COMPANY' AND "warehouseId" IS NULL AND "category" = 'ESTABLISHMENT')
);
ALTER TABLE "WarehouseCost" ADD CONSTRAINT "WarehouseCost_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "WarehouseCost" ADD CONSTRAINT "WarehouseCost_month_first_day" CHECK (EXTRACT(DAY FROM "month") = 1);

-- No overheads exist yet, so the full-cost alert level starts where the direct one is.
UPDATE "Project" SET "fullCostAlertLevel" = "costAlertLevel";
