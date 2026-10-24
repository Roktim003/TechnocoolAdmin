-- CreateEnum
CREATE TYPE "PurchaseOrderType" AS ENUM ('LOCAL', 'IMPORTED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'REJECTED', 'APPROVED', 'SENT', 'PARTLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "defaultSupplierId" UUID;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "brandsSupplied" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paymentTermsNote" TEXT;

-- AlterTable
ALTER TABLE "StockEntry" ADD COLUMN     "purchaseOrderId" UUID;

-- AlterTable
ALTER TABLE "StockEntryLine" ADD COLUMN     "purchaseOrderLineId" UUID;

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" UUID NOT NULL,
    "number" TEXT,
    "draftRef" TEXT NOT NULL,
    "supplierId" UUID NOT NULL,
    "type" "PurchaseOrderType" NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'BDT',
    "exchangeRate" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "poDate" DATE NOT NULL,
    "expectedDeliveryDate" DATE,
    "deliverToWarehouseId" UUID NOT NULL,
    "projectId" UUID,
    "supplierQuoteRef" TEXT,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vatPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalBdt" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "terms" TEXT,
    "notes" TEXT,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" UUID,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "closedById" UUID,
    "closedAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "cancelledById" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" UUID NOT NULL,
    "poId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,4) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "receivedQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "pendingReceiptQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderRevision" (
    "id" UUID NOT NULL,
    "poId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "changedById" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchasingSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "defaultTerms" TEXT,
    "defaultVatPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchasingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_number_key" ON "PurchaseOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_draftRef_key" ON "PurchaseOrder"("draftRef");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_poDate_idx" ON "PurchaseOrder"("supplierId", "poDate");

-- CreateIndex
CREATE INDEX "PurchaseOrder_deliverToWarehouseId_status_idx" ON "PurchaseOrder"("deliverToWarehouseId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_projectId_idx" ON "PurchaseOrder"("projectId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_poDate_idx" ON "PurchaseOrder"("poDate");

-- CreateIndex
CREATE INDEX "PurchaseOrder_expectedDeliveryDate_idx" ON "PurchaseOrder"("expectedDeliveryDate");

-- CreateIndex
CREATE INDEX "PurchaseOrder_createdById_idx" ON "PurchaseOrder"("createdById");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_productId_idx" ON "PurchaseOrderLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderLine_poId_productId_key" ON "PurchaseOrderLine"("poId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderRevision_poId_revision_key" ON "PurchaseOrderRevision"("poId", "revision");

-- CreateIndex
CREATE INDEX "Product_defaultSupplierId_idx" ON "Product"("defaultSupplierId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- CreateIndex
CREATE INDEX "StockEntry_purchaseOrderId_idx" ON "StockEntry"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "StockEntryLine_purchaseOrderLineId_idx" ON "StockEntryLine"("purchaseOrderLineId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_defaultSupplierId_fkey" FOREIGN KEY ("defaultSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntryLine" ADD CONSTRAINT "StockEntryLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_deliverToWarehouseId_fkey" FOREIGN KEY ("deliverToWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderRevision" ADD CONSTRAINT "PurchaseOrderRevision_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderRevision" ADD CONSTRAINT "PurchaseOrderRevision_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─────────────── Supplier codes: SUP-001, SUP-002… for existing suppliers (oldest first) ───────────────
UPDATE "Supplier" s SET "code" = 'SUP-' || lpad(x.n::text, 3, '0')
FROM (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS n FROM "Supplier") x
WHERE s.id = x.id;

INSERT INTO "DocumentSequence" ("docType", "fiscalYear", "lastNumber")
SELECT 'SUPPLIER', 'ALL', COUNT(*)::int FROM "Supplier"
ON CONFLICT ("docType", "fiscalYear") DO UPDATE SET "lastNumber" = GREATEST("DocumentSequence"."lastNumber", EXCLUDED."lastNumber");

ALTER TABLE "Supplier" ALTER COLUMN "code" SET NOT NULL;

-- ─────────────── PO lines: quantities can never go negative or over the ordered quantity ───────────────
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_qty_positive" CHECK ("qty" > 0);
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_price_nonnegative" CHECK ("unitPrice" >= 0);
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_received_nonnegative" CHECK ("receivedQty" >= 0 AND "pendingReceiptQty" >= 0);
-- Over-receipt is blocked in the application; this is the last line of defence.
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_no_over_receipt" CHECK ("receivedQty" + "pendingReceiptQty" <= "qty");

-- ─────────────── Product.defaultSupplierName → defaultSupplierId ───────────────
-- Matches the free text against supplier names the way the app compares names (trimmed, single
-- spaces, case-insensitive). Matched products get the link and lose the text; unmatched ones keep
-- their text. Returns the unmatched products. Safe to run again (e.g. after adding suppliers):
--   SELECT * FROM link_product_default_suppliers();
CREATE OR REPLACE FUNCTION link_product_default_suppliers()
RETURNS TABLE (product_code TEXT, supplier_name TEXT)
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "Product" p
  SET "defaultSupplierId" = s.id, "defaultSupplierName" = NULL
  FROM "Supplier" s
  WHERE p."defaultSupplierId" IS NULL
    AND p."defaultSupplierName" IS NOT NULL
    AND btrim(p."defaultSupplierName") <> ''
    AND s."nameKey" = lower(regexp_replace(btrim(p."defaultSupplierName"), '\s+', ' ', 'g'));

  RETURN QUERY
    SELECT p.code, p."defaultSupplierName"
    FROM "Product" p
    WHERE p."defaultSupplierId" IS NULL AND p."defaultSupplierName" IS NOT NULL AND btrim(p."defaultSupplierName") <> ''
    ORDER BY p.code;
END;
$$;

-- Report: NOTICE lines in the migration output, plus one audit-log row listing what didn't match.
DO $$
DECLARE
  r RECORD;
  n INT := 0;
  rows JSONB := '[]'::jsonb;
  linked INT;
BEGIN
  FOR r IN SELECT * FROM link_product_default_suppliers() LOOP
    n := n + 1;
    rows := rows || jsonb_build_object('product', r.product_code, 'defaultSupplierName', r.supplier_name);
    RAISE NOTICE 'Default supplier not matched: product % keeps text "%"', r.product_code, r.supplier_name;
  END LOOP;
  SELECT COUNT(*) INTO linked FROM "Product" WHERE "defaultSupplierId" IS NOT NULL;
  RAISE NOTICE 'Default suppliers: % product(s) linked, % unmatched (text kept).', linked, n;
  INSERT INTO "AuditLog" ("id", "userId", "action", "entityType", "entityId", "after", "createdAt")
  VALUES (gen_random_uuid(), NULL, 'migration.product_default_supplier', 'Product', NULL,
          jsonb_build_object('linked', linked, 'unmatched', rows), CURRENT_TIMESTAMP);
END;
$$;
