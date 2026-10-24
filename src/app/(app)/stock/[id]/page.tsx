import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/shell/PageStates";
import { stockContext } from "../_lib/access";
import { loadEntry } from "../_lib/entry";
import { EntryDetail } from "../_components/EntryDetail";

export const metadata: Metadata = { title: "Stock entry" };

export default async function EntryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const ctx = await stockContext();
  if (!ctx) return <AccessDenied what="Stock in / out" />;
  const entry = await loadEntry(ctx.actor, (await params).id);
  if (entry === "forbidden") return <AccessDenied what="this warehouse's entries" />;
  if (!entry) notFound();
  const { saved } = await searchParams;
  return <EntryDetail key={entry.updatedAt} caps={ctx.caps} initial={entry} saved={saved ?? null} />;
}
