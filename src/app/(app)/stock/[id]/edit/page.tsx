import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/shell/PageStates";
import { PageHeader } from "@/components/shell/PageHeader";
import { inventory } from "@/modules/inventory/interface/container";
import { stockContext } from "../../_lib/access";
import { loadEntry } from "../../_lib/entry";
import { EntryForm } from "../../_components/EntryForm";

export const metadata: Metadata = { title: "Edit stock entry" };

export default async function EditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await stockContext();
  if (!ctx || !ctx.caps.canCreate) return <AccessDenied what="Stock in / out" />;
  const entry = await loadEntry(ctx.actor, (await params).id);
  if (entry === "forbidden") return <AccessDenied what="this warehouse's entries" />;
  if (!entry) notFound();
  if (!entry.actions.edit) redirect(`/stock/${entry.id}`);
  const [warehouses, settings] = await Promise.all([inventory().masters.warehouses(), inventory().masters.settings()]);
  return (
    <>
      <PageHeader title={`Edit ${entry.displayNumber}`} description={entry.typeLabel} />
      <EntryForm caps={ctx.caps} warehouses={warehouses} entry={entry} defaultVat={settings.defaultSalesVatPercent} />
    </>
  );
}
