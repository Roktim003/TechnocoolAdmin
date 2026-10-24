import { inventory } from "@/modules/inventory/interface/container";
import { toEntryDto, type EntryDto } from "@/modules/inventory/interface/mappers";
import type { InventoryActor } from "@/modules/inventory/application/ports";
import { ForbiddenError, NotFoundError } from "@/shared/errors/app-error";
import { filterSensitiveFields } from "@/shared/rbac/sensitive-fields";
import { UuidSchema } from "@/shared/validation/zod";

/** An entry as the API would return it to this actor; "forbidden" when outside their warehouses. */
export async function loadEntry(actor: InventoryActor, id: string): Promise<EntryDto | "forbidden" | null> {
  if (!UuidSchema.safeParse(id).success) return null;
  try {
    const e = await inventory().entries.get(actor, id);
    return filterSensitiveFields(toEntryDto(e, actor), { flags: { seeCost: actor.canSeeCost, seeProfit: actor.canSeeProfit, seeMargin: false } });
  } catch (err) {
    if (err instanceof ForbiddenError) return "forbidden";
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}
