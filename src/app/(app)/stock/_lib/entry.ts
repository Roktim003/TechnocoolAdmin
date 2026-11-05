import { entryDetail } from "@/modules/inventory/interface/http";
import type { InventoryActor } from "@/modules/inventory/application/ports";
import { ForbiddenError, NotFoundError } from "@/shared/errors/app-error";
import { filterSensitiveFields } from "@/shared/rbac/sensitive-fields";
import { UuidSchema } from "@/shared/validation/zod";
import type { EntryDetailDto } from "../_components/import-docs";

/**
 * An entry as GET /stock-entries/:id returns it to this actor (GRN Imported: with its documents
 * checklist, files and warnings); "forbidden" when outside their warehouses.
 */
export async function loadEntry(actor: InventoryActor, id: string): Promise<EntryDetailDto | "forbidden" | null> {
  if (!UuidSchema.safeParse(id).success) return null;
  try {
    const dto = (await entryDetail(actor, id)) as EntryDetailDto;
    return filterSensitiveFields(dto, { flags: { seeCost: actor.canSeeCost, seeProfit: actor.canSeeProfit, seeMargin: false } });
  } catch (err) {
    if (err instanceof ForbiddenError) return "forbidden";
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}
