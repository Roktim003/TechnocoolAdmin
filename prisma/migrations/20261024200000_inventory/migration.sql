-- CreateEnum
CREATE TYPE "SupplierType" AS ENUM ('LOCAL', 'FOREIGN');

-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('BDT', 'USD', 'EUR', 'CNY', 'MYR', 'THB');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'RUNNING', 'ON_HOLD', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "StockEntryType" AS ENUM ('GRN_IMPORT', 'GRN_LOCAL', 'RETURN_FROM_SITE', 'OPENING', 'ISSUE_TO_PROJECT', 'SALE', 'RETURN_TO_SUPPLIER', 'DAMAGE_WRITE_OFF', 'TRANSFER', 'REVERSAL');

-- CreateEnum
CREATE TYPE "StockEntryStatus" AS ENUM ('DRAFT', 'PENDING', 'POSTED', 'REJECTED', 'CANCELLED', 'REVERSED', 'DISPATCHED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "StockCondition" AS ENUM ('GOOD', 'DAMAGED');

-- CreateEnum
CREATE TYPE "LandedChargeType" AS ENUM ('CUSTOMS_DUTY', 'AIT', 'IMPORT_VAT', 'FREIGHT', 'INSURANCE', 'CNF', 'OTHER');

-- CreateEnum
CREATE TYPE "LandedChargeMode" AS ENUM ('PERCENT_OF_GOODS', 'AMOUNT_BDT');

-- CreateEnum
CREATE TYPE "SerialStatus" AS ENUM ('IN_STOCK', 'RESERVED', 'IN_TRANSIT', 'ISSUED', 'SOLD', 'RETURNED_TO_SUPPLIER', 'WRITTEN_OFF', 'DAMAGED');

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "type" "SupplierType" NOT NULL DEFAULT 'LOCAL',
    "currency" "CurrencyCode" NOT NULL DEFAULT 'BDT',
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientName" TEXT,
    "siteAddress" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "defaultWarehouseId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "docType" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("docType","fiscalYear")
);

-- CreateTable
CREATE TABLE "InventorySettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "defaultSalesVatPercent" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "adminWriteOffNeedsApproval" BOOLEAN NOT NULL DEFAULT false,
    "allowAdminBelowCostSale" BOOLEAN NOT NULL DEFAULT true,
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventorySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockEntry" (
    "id" UUID NOT NULL,
    "number" TEXT,
    "draftRef" TEXT NOT NULL,
    "type" "StockEntryType" NOT NULL,
    "status" "StockEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "entryDate" DATE NOT NULL,
    "warehouseId" UUID NOT NULL,
    "toWarehouseId" UUID,
    "supplierId" UUID,
    "customerId" UUID,
    "projectId" UUID,
    "originalEntryId" UUID,
    "reversalOfId" UUID,
    "relatedEntryId" UUID,
    "poNumberText" TEXT,
    "supplierInvoiceNo" TEXT,
    "lcNo" TEXT,
    "billOfEntryNo" TEXT,
    "challanNo" TEXT,
    "siteAddress" TEXT,
    "receivedBy" TEXT,
    "vehicle" TEXT,
    "reason" TEXT,
    "description" TEXT,
    "customerPhone" TEXT,
    "customerAddress" TEXT,
    "notes" TEXT,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'BDT',
    "exchangeRate" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vatPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "belowCostConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "postedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "receivedById" UUID,
    "receivedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockEntryLine" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "unitCostBdt" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "landedUnitCost" DECIMAL(14,4),
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "condition" "StockCondition" NOT NULL DEFAULT 'GOOD',
    "originalLineId" UUID,
    "receivedQty" DECIMAL(14,3),
    "note" TEXT,

    CONSTRAINT "StockEntryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandedCostCharge" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "type" "LandedChargeType" NOT NULL,
    "mode" "LandedChargeMode" NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,
    "includeInCost" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT,
    "amountBdt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LandedCostCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBalance" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "condition" "StockCondition" NOT NULL,
    "qtyOnHand" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "qtyReserved" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReservation" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "condition" "StockCondition" NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockInTransit" (
    "id" UUID NOT NULL,
    "transferEntryId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockInTransit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCost" (
    "productId" UUID NOT NULL,
    "totalQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "totalValue" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "avgCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCost_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "entryId" UUID NOT NULL,
    "lineId" UUID,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "condition" "StockCondition" NOT NULL,
    "qtyChange" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "valueChange" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,3) NOT NULL,
    "avgCostAfter" DECIMAL(14,4) NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerialNumber" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "serial" TEXT NOT NULL,
    "status" "SerialStatus" NOT NULL,
    "warehouseId" UUID,
    "projectId" UUID,
    "customerId" UUID,
    "supplierId" UUID,
    "reservedEntryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SerialNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerialMovement" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "serialId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "fromStatus" "SerialStatus",
    "toStatus" "SerialStatus" NOT NULL,
    "fromWarehouseId" UUID,
    "toWarehouseId" UUID,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SerialMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryLineSerial" (
    "id" UUID NOT NULL,
    "lineId" UUID NOT NULL,
    "serial" TEXT NOT NULL,
    "serialId" UUID,
    "received" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EntryLineSerial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "label" TEXT,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_nameKey_key" ON "Supplier"("nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_nameKey_key" ON "Customer"("nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StockEntry_number_key" ON "StockEntry"("number");

-- CreateIndex
CREATE UNIQUE INDEX "StockEntry_draftRef_key" ON "StockEntry"("draftRef");

-- CreateIndex
CREATE UNIQUE INDEX "StockEntry_reversalOfId_key" ON "StockEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "StockEntry_type_status_idx" ON "StockEntry"("type", "status");

-- CreateIndex
CREATE INDEX "StockEntry_status_idx" ON "StockEntry"("status");

-- CreateIndex
CREATE INDEX "StockEntry_warehouseId_entryDate_idx" ON "StockEntry"("warehouseId", "entryDate");

-- CreateIndex
CREATE INDEX "StockEntry_toWarehouseId_status_idx" ON "StockEntry"("toWarehouseId", "status");

-- CreateIndex
CREATE INDEX "StockEntry_projectId_idx" ON "StockEntry"("projectId");

-- CreateIndex
CREATE INDEX "StockEntry_customerId_idx" ON "StockEntry"("customerId");

-- CreateIndex
CREATE INDEX "StockEntry_supplierId_idx" ON "StockEntry"("supplierId");

-- CreateIndex
CREATE INDEX "StockEntry_createdById_idx" ON "StockEntry"("createdById");

-- CreateIndex
CREATE INDEX "StockEntry_entryDate_idx" ON "StockEntry"("entryDate");

-- CreateIndex
CREATE INDEX "StockEntryLine_entryId_idx" ON "StockEntryLine"("entryId");

-- CreateIndex
CREATE INDEX "StockEntryLine_productId_idx" ON "StockEntryLine"("productId");

-- CreateIndex
CREATE INDEX "StockEntryLine_originalLineId_idx" ON "StockEntryLine"("originalLineId");

-- CreateIndex
CREATE INDEX "LandedCostCharge_entryId_idx" ON "LandedCostCharge"("entryId");

-- CreateIndex
CREATE INDEX "StockBalance_warehouseId_idx" ON "StockBalance"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBalance_productId_warehouseId_condition_key" ON "StockBalance"("productId", "warehouseId", "condition");

-- CreateIndex
CREATE INDEX "StockReservation_productId_warehouseId_idx" ON "StockReservation"("productId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "StockReservation_entryId_productId_warehouseId_condition_key" ON "StockReservation"("entryId", "productId", "warehouseId", "condition");

-- CreateIndex
CREATE INDEX "StockInTransit_productId_idx" ON "StockInTransit"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "StockInTransit_transferEntryId_productId_key" ON "StockInTransit"("transferEntryId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_seq_key" ON "StockMovement"("seq");

-- CreateIndex
CREATE INDEX "StockMovement_productId_seq_idx" ON "StockMovement"("productId", "seq");

-- CreateIndex
CREATE INDEX "StockMovement_warehouseId_seq_idx" ON "StockMovement"("warehouseId", "seq");

-- CreateIndex
CREATE INDEX "StockMovement_entryId_idx" ON "StockMovement"("entryId");

-- CreateIndex
CREATE INDEX "StockMovement_postedAt_idx" ON "StockMovement"("postedAt");

-- CreateIndex
CREATE INDEX "SerialNumber_serial_idx" ON "SerialNumber"("serial");

-- CreateIndex
CREATE INDEX "SerialNumber_status_warehouseId_idx" ON "SerialNumber"("status", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "SerialNumber_productId_serial_key" ON "SerialNumber"("productId", "serial");

-- CreateIndex
CREATE UNIQUE INDEX "SerialMovement_seq_key" ON "SerialMovement"("seq");

-- CreateIndex
CREATE INDEX "SerialMovement_serialId_seq_idx" ON "SerialMovement"("serialId", "seq");

-- CreateIndex
CREATE INDEX "SerialMovement_entryId_idx" ON "SerialMovement"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "EntryLineSerial_lineId_serial_key" ON "EntryLineSerial"("lineId", "serial");

-- CreateIndex
CREATE INDEX "Attachment_entityType_entityId_idx" ON "Attachment"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_defaultWarehouseId_fkey" FOREIGN KEY ("defaultWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_originalEntryId_fkey" FOREIGN KEY ("originalEntryId") REFERENCES "StockEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "StockEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_relatedEntryId_fkey" FOREIGN KEY ("relatedEntryId") REFERENCES "StockEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntryLine" ADD CONSTRAINT "StockEntryLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "StockEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntryLine" ADD CONSTRAINT "StockEntryLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntryLine" ADD CONSTRAINT "StockEntryLine_originalLineId_fkey" FOREIGN KEY ("originalLineId") REFERENCES "StockEntryLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandedCostCharge" ADD CONSTRAINT "LandedCostCharge_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "StockEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "StockEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockInTransit" ADD CONSTRAINT "StockInTransit_transferEntryId_fkey" FOREIGN KEY ("transferEntryId") REFERENCES "StockEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockInTransit" ADD CONSTRAINT "StockInTransit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCost" ADD CONSTRAINT "ProductCost_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "StockEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "StockEntryLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialNumber" ADD CONSTRAINT "SerialNumber_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialNumber" ADD CONSTRAINT "SerialNumber_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialNumber" ADD CONSTRAINT "SerialNumber_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialNumber" ADD CONSTRAINT "SerialNumber_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialNumber" ADD CONSTRAINT "SerialNumber_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialMovement" ADD CONSTRAINT "SerialMovement_serialId_fkey" FOREIGN KEY ("serialId") REFERENCES "SerialNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialMovement" ADD CONSTRAINT "SerialMovement_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "StockEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryLineSerial" ADD CONSTRAINT "EntryLineSerial_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "StockEntryLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryLineSerial" ADD CONSTRAINT "EntryLineSerial_serialId_fkey" FOREIGN KEY ("serialId") REFERENCES "SerialNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Guards (defence in depth: the posting engine already enforces these) ───

-- Stock can never be negative, and never more reserved than on hand.
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_qty_non_negative" CHECK ("qtyOnHand" >= 0 AND "qtyReserved" >= 0 AND "qtyReserved" <= "qtyOnHand");
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_qty_positive" CHECK ("qty" > 0);
ALTER TABLE "StockInTransit" ADD CONSTRAINT "StockInTransit_qty_non_negative" CHECK ("qty" >= 0);
ALTER TABLE "ProductCost" ADD CONSTRAINT "ProductCost_non_negative" CHECK ("totalQty" >= 0 AND "avgCost" >= 0);
ALTER TABLE "StockEntryLine" ADD CONSTRAINT "StockEntryLine_qty_positive" CHECK ("qty" > 0);

-- The stock ledger is append-only.
CREATE FUNCTION stock_movement_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'StockMovement is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockMovement_append_only"
  BEFORE UPDATE OR DELETE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION stock_movement_append_only();

CREATE TRIGGER "SerialMovement_append_only"
  BEFORE UPDATE OR DELETE ON "SerialMovement"
  FOR EACH ROW EXECUTE FUNCTION stock_movement_append_only();
