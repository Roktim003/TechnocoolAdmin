import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/shell/PageStates";
import { inventory } from "@/modules/inventory/interface/container";
import { toCountDto } from "@/modules/inventory/interface/mappers";
import { ForbiddenError, NotFoundError } from "@/shared/errors/app-error";
import { filterSensitiveFields } from "@/shared/rbac/sensitive-fields";
import { UuidSchema } from "@/shared/validation/zod";
import { stockContext } from "../../_lib/access";
import { CountWork } from "../_components/CountWork";
import type { CountDto } from "../_components/count-types";

export const metadata: Metadata = { title: "Stock count" };

export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await stockContext("/stock/counts");
  if (!ctx) return <AccessDenied what="Stock counts" />;
  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) notFound();
  const counts = inventory().counts;
  try {
    const c = await counts.get(ctx.actor, id);
    const dto = filterSensitiveFields(toCountDto(c, ctx.actor, counts.canSeeSystem(ctx.actor, c)), { flags: { seeCost: ctx.actor.canSeeCost, seeProfit: ctx.actor.canSeeProfit, seeMargin: false } });
    return <CountWork key={dto.status} caps={ctx.caps} initial={dto as unknown as CountDto} />;
  } catch (err) {
    if (err instanceof ForbiddenError) return <AccessDenied what="this warehouse's counts" />;
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}
