import type { IntegrityCheckResult, OpsTrigger } from "../domain/types";
import type { AdminNotifier, OpsLogger, OpsStore } from "./ports";

export interface IntegrityDeps {
  store: OpsStore;
  check: () => Promise<IntegrityCheckResult[]>;
  notifier: AdminNotifier;
  log: OpsLogger;
}

/**
 * The nightly integrity check (2:30 AM Asia/Dhaka, and on demand from System health).
 * It only reports: results are saved and Admins are notified when something doesn't add up.
 * Nothing is ever corrected automatically.
 */
export class IntegrityService {
  constructor(private readonly d: IntegrityDeps) {}

  async run(trigger: OpsTrigger, requestedById: string | null = null): Promise<{ id: string; passed: boolean; checks: IntegrityCheckResult[] }> {
    const id = await this.d.store.startIntegrity(trigger, requestedById);
    let checks: IntegrityCheckResult[];
    try {
      checks = await this.d.check();
    } catch (err) {
      const error = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
      await this.d.store.finishIntegrity(id, { status: "FAILED", passed: null, checks: [], error });
      await this.d.notifier.notify("INTEGRITY_CHECK_FAILED", "Integrity check could not run", error, "/admin/system");
      throw err;
    }
    const failed = checks.filter((c) => !c.passed);
    const passed = failed.length === 0;
    await this.d.store.finishIntegrity(id, { status: "SUCCEEDED", passed, checks, error: null });
    if (!passed) {
      const summary = failed.map((c) => `${c.label}: ${c.problems} problem${c.problems === 1 ? "" : "s"}`).join("; ");
      await this.d.notifier.notify("INTEGRITY_CHECK_FAILED", "Integrity check found problems", `${summary}. Nothing was changed. Open System health for the details.`, "/admin/system");
      this.d.log.warn({ failed: failed.map((c) => c.key) }, "integrity check found problems");
    } else this.d.log.info({ checks: checks.length }, "integrity check passed");
    return { id, passed, checks };
  }
}
