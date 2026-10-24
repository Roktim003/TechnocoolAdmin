-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('OFFICE', 'HOSPITAL', 'INSTITUTION', 'RETAIL', 'INDUSTRIAL', 'RESIDENTIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectCostCategory" AS ENUM ('LABOUR', 'TRANSPORT', 'OTHER');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "actualEndDate" DATE,
ADD COLUMN     "clientContactPerson" TEXT,
ADD COLUMN     "clientEmail" TEXT,
ADD COLUMN     "clientPhone" TEXT,
ADD COLUMN     "closeReason" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedById" UUID,
ADD COLUMN     "contractValue" DECIMAL(14,2),
ADD COLUMN     "costAlertLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "expectedEndDate" DATE,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "projectType" "ProjectType" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "siteEngineerName" TEXT,
ADD COLUMN     "siteEngineerUserId" UUID,
ADD COLUMN     "startDate" DATE;

-- CreateTable
CREATE TABLE "ProjectCost" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "category" "ProjectCostCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "vendorOrPayee" TEXT,
    "referenceNo" TEXT,
    "createdById" UUID NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedById" UUID,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStatusHistory" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "fromStatus" "ProjectStatus",
    "toStatus" "ProjectStatus" NOT NULL,
    "changedById" UUID NOT NULL,
    "reason" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectCost_projectId_date_idx" ON "ProjectCost"("projectId", "date");

-- CreateIndex
CREATE INDEX "ProjectStatusHistory_projectId_at_idx" ON "ProjectStatusHistory"("projectId", "at");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_siteEngineerUserId_idx" ON "Project"("siteEngineerUserId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_siteEngineerUserId_fkey" FOREIGN KEY ("siteEngineerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStatusHistory" ADD CONSTRAINT "ProjectStatusHistory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStatusHistory" ADD CONSTRAINT "ProjectStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Integrity checks (the services enforce the same rules with friendly errors).
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_void_complete" CHECK (("voidedAt" IS NULL) = ("voidedById" IS NULL) AND ("voidedAt" IS NULL OR "voidReason" IS NOT NULL));
ALTER TABLE "Project" ADD CONSTRAINT "Project_contractValue_nonnegative" CHECK ("contractValue" IS NULL OR "contractValue" >= 0);
ALTER TABLE "Project" ADD CONSTRAINT "Project_costAlertLevel_valid" CHECK ("costAlertLevel" IN (0, 90, 100));
