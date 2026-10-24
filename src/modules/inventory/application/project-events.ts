import type { EntryRecord, ProjectStockListener } from "./ports";

/*
 * The registered ProjectStockListener (the projects module registers it at startup, like
 * purchasing's ReceiptListener). Optional: without it, postings simply don't notify projects.
 */
const g = globalThis as unknown as { __stockbookProjectStockListener?: ProjectStockListener | null };

export function registerProjectStockListener(listener: ProjectStockListener | null): void {
  g.__stockbookProjectStockListener = listener;
}

/** After commit: an issue to / return from a project was posted, approved or reversed. */
export async function notifyProjectMaterial(e: EntryRecord): Promise<void> {
  const l = g.__stockbookProjectStockListener;
  if (!l || !e.project || (e.type !== "ISSUE_TO_PROJECT" && e.type !== "RETURN_FROM_SITE")) return;
  await l.materialChanged(e.project.id, { id: e.id, number: e.number, type: e.type }).catch(() => undefined);
}
