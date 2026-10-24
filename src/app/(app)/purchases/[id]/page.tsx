import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/shell/PageStates";
import { purchasesContext } from "../_lib/access";
import { loadPo } from "../_lib/po";
import { PoDetail } from "../_components/PoDetail";

export const metadata: Metadata = { title: "Purchase order" };

export default async function PoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const ctx = await purchasesContext();
  if (!ctx) return <AccessDenied what="Purchases" />;
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const po = await loadPo(ctx.actor, id);
  if (po === "forbidden") return <AccessDenied what="this purchase order" />;
  if (!po) notFound();
  return <PoDetail key={po.updatedAt} caps={ctx.caps} initial={po} saved={saved ?? null} />;
}
