import { logger } from "@/shared/logger/logger";

/**
 * "Business data changed" signals. Modules that own data publish after a transaction commits;
 * readers that cache derived data (the dashboard) subscribe in `wireModules()`. Publishers never
 * know who listens, so no module depends on the reporting module.
 */
export type ChangeTopic = "stock" | "purchasing" | "projects";

type Listener = (topic: ChangeTopic) => void | Promise<void>;

const globalForEvents = globalThis as unknown as { changeListeners?: Set<Listener> };
const listeners = () => (globalForEvents.changeListeners ??= new Set());

export function onDataChange(listener: Listener): () => void {
  listeners().add(listener);
  return () => listeners().delete(listener);
}

/** Runs every listener; a failing listener is logged and never fails the publisher. */
export async function publishDataChange(topic: ChangeTopic): Promise<void> {
  for (const l of listeners()) {
    try {
      await l(topic);
    } catch (err) {
      logger.error({ err, topic }, "data change listener failed");
    }
  }
}
