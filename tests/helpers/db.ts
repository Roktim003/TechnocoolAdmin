import { prisma } from "@/shared/db/prisma";
import { deleteKeys } from "@/shared/redis/redis";
import { seed } from "../../prisma/seed";
import { TEST_ENV } from "../setup/test-env";

const TABLES = [
  "ReportScheduleRun",
  "ReportSchedule",
  "PurchaseOrderRevision",
  "PurchaseOrderLine",
  "PurchaseOrder",
  "PurchasingSettings",
  "StockCountSerial",
  "StockCountLine",
  "StockCount",
  "OpeningImport",
  "AlertSettings",
  "LowStockState",
  "Notification",
  "NotificationPreference",
  "NotificationType",
  "EmailLog",
  "StockMovement",
  "SerialMovement",
  "EntryLineSerial",
  "SerialNumber",
  "StockReservation",
  "StockInTransit",
  "LandedCostCharge",
  "StockEntryLine",
  "StockEntry",
  "StockBalance",
  "ProductCost",
  "DocumentSequence",
  "InventorySettings",
  "Attachment",
  "ProjectCost",
  "ProjectStatusHistory",
  "Project",
  "Supplier",
  "Customer",
  "ProductPhoto", "Product", "Catalog", "Category", "Unit", "AuditLog", "LoginHistory", "RefreshToken", "IdempotencyKey", "UserWarehouse", "User", "RolePermission", "Role", "Warehouse"];

/** Empties every table and Redis key, then runs the real seed (warehouses, 4 roles, admin). */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await deleteKeys("*");
  await seed(prisma, {
    adminUsername: TEST_ENV.ADMIN_USERNAME!,
    adminPassword: TEST_ENV.ADMIN_PASSWORD!,
    adminName: TEST_ENV.ADMIN_NAME!,
    bcryptRounds: Number(TEST_ENV.BCRYPT_ROUNDS),
  });
}

export async function roleId(name: string): Promise<string> {
  return (await prisma.role.findFirstOrThrow({ where: { name } })).id;
}

export async function warehouseId(code: string): Promise<string> {
  return (await prisma.warehouse.findUniqueOrThrow({ where: { code } })).id;
}

export { prisma };
