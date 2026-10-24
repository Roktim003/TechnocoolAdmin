import { purchasing } from "@/modules/purchasing/interface/container";
import { toPoDetailDto } from "@/modules/purchasing/interface/mappers";
import type { PurchasingActor } from "@/modules/purchasing/application/ports";
import { ForbiddenError, NotFoundError } from "@/shared/errors/app-error";
import { UuidSchema } from "@/shared/validation/zod";
import type { PoDetailDto } from "../_components/types";

/** A PO as the API would return it to this actor; "forbidden" when outside their warehouses. */
export async function loadPo(actor: PurchasingActor, id: string): Promise<PoDetailDto | "forbidden" | null> {
  if (!UuidSchema.safeParse(id).success) return null;
  try {
    return toPoDetailDto(await purchasing().orders.detail(actor, id), actor);
  } catch (err) {
    if (err instanceof ForbiddenError) return "forbidden";
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}
