-- Import documents on GRN (Imported): shipment documents, typed attachments, line origin,
-- and the "required before posting" setting.
-- Expand → migrate → contract: the new table is created and filled before the old
-- StockEntry.billOfEntryNo column is dropped (lcNo stays on StockEntry).

-- ── expand ──
-- CreateEnum
CREATE TYPE "ImportDocType" AS ENUM ('BL', 'CO', 'PL', 'CI', 'BOE', 'OTHER');

-- CreateEnum
CREATE TYPE "Incoterm" AS ENUM ('EXW', 'FOB', 'CFR', 'CIF', 'OTHER');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "docType" "ImportDocType",
ADD COLUMN     "thumbnailKey" TEXT;

-- AlterTable
ALTER TABLE "InventorySettings" ADD COLUMN     "importDocsRequiredToPost" "ImportDocType"[] DEFAULT ARRAY['CI', 'BOE']::"ImportDocType"[];

-- AlterTable
ALTER TABLE "StockEntryLine" ADD COLUMN     "countryOfOrigin" TEXT;

-- CreateTable
CREATE TABLE "ImportShipment" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "blNo" TEXT,
    "blDate" DATE,
    "shippingLine" TEXT,
    "vesselVoyage" TEXT,
    "portOfLoading" TEXT,
    "portOfDischarge" TEXT,
    "containerNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coNo" TEXT,
    "coDate" DATE,
    "countryOfOrigin" TEXT,
    "coIssuingAuthority" TEXT,
    "plNo" TEXT,
    "plDate" DATE,
    "packageCount" INTEGER,
    "grossWeightKg" DECIMAL(14,3),
    "netWeightKg" DECIMAL(14,3),
    "ciNo" TEXT,
    "ciDate" DATE,
    "ciCurrency" "CurrencyCode",
    "ciValue" DECIMAL(14,2),
    "incoterm" "Incoterm",
    "boeNo" TEXT,
    "boeDate" DATE,
    "customsStation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportShipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportShipment_entryId_key" ON "ImportShipment"("entryId");

-- CreateIndex
CREATE INDEX "ImportShipment_blNo_idx" ON "ImportShipment"("blNo");

-- CreateIndex
CREATE INDEX "ImportShipment_ciNo_idx" ON "ImportShipment"("ciNo");

-- CreateIndex
CREATE INDEX "ImportShipment_boeNo_idx" ON "ImportShipment"("boeNo");

-- CreateIndex
CREATE INDEX "ImportShipment_coNo_idx" ON "ImportShipment"("coNo");

-- CreateIndex
CREATE INDEX "ImportShipment_plNo_idx" ON "ImportShipment"("plNo");

-- CreateIndex
CREATE INDEX "ImportShipment_countryOfOrigin_idx" ON "ImportShipment"("countryOfOrigin");

-- CreateIndex
CREATE INDEX "ImportShipment_customsStation_idx" ON "ImportShipment"("customsStation");

-- CreateIndex
CREATE INDEX "ImportShipment_containerNumbers_idx" ON "ImportShipment" USING GIN ("containerNumbers");

-- CreateIndex
CREATE INDEX "Attachment_entityType_entityId_docType_idx" ON "Attachment"("entityType", "entityId", "docType");

-- AddForeignKey
ALTER TABLE "ImportShipment" ADD CONSTRAINT "ImportShipment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "StockEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── migrate: copy every existing B/E number into its entry's shipment row ──
INSERT INTO "ImportShipment" ("id", "entryId", "boeNo", "createdAt", "updatedAt")
SELECT gen_random_uuid(), e."id", e."billOfEntryNo", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "StockEntry" e
WHERE e."billOfEntryNo" IS NOT NULL AND btrim(e."billOfEntryNo") <> '';

-- ── contract: only after the copy ──
ALTER TABLE "StockEntry" DROP COLUMN "billOfEntryNo";
