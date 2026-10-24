import { prisma, type Db } from "@/shared/db/prisma";
import { storage } from "@/shared/storage/storage";
import { inventory } from "@/modules/inventory/interface/container";
import { PoAttachmentService } from "../application/attachment.service";
import type { StockDirectory } from "../application/ports";
import { PurchaseOrderService } from "../application/purchase-order.service";
import { PurchaseReceiptListener } from "../application/receipt-listener";
import { SupplierService } from "../application/supplier.service";
import { prismaPurchasingStore, prismaPurchasingUnitOfWork } from "../infrastructure/prisma-purchasing.store";
import { poDocumentQueue } from "./documents";
import { purchasingNotifier } from "./events";

/** Low-stock suggestions come from the inventory module (purchasing may depend on inventory, never the reverse). */
const stockDirectory: StockDirectory = {
  async lowStock(productIds, warehouseId) {
    const ids = new Set(productIds);
    const rows = await inventory().alerts.rows(warehouseId ? { warehouseId } : {}, null);
    return rows.filter((r) => ids.has(r.product.id)).map((r) => ({ productId: r.product.id, suggestedQty: r.suggestedQty, shortBy: r.shortBy }));
  },
};

/** Composition root of the purchasing module. */
function build() {
  const uow = prismaPurchasingUnitOfWork(prisma);
  const orders = new PurchaseOrderService({ uow, notifier: purchasingNotifier, stock: stockDirectory, documents: poDocumentQueue });
  return {
    uow,
    suppliers: new SupplierService({ uow }),
    orders,
    attachments: new PoAttachmentService({ uow, files: storage(), orders }),
    /** Registered with inventory at startup (see src/modules/bootstrap.ts). */
    receipts: new PurchaseReceiptListener({ storeFor: (db) => prismaPurchasingStore(db as Db), store: () => uow.store, notifier: purchasingNotifier }),
  };
}

let instance: ReturnType<typeof build> | undefined;

export function purchasing() {
  return (instance ??= build());
}
