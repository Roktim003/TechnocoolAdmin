import type { ActorContext } from "@/modules/audit/application/audit.service";
import { hasLevel } from "@/shared/rbac/levels";
import type { ListQuery } from "@/shared/pagination/list-query";
import { ReportErrors } from "../domain/errors";
import { describeSchedule, dhakaDate, nextRunAt } from "../domain/schedule";
import type { ReportViewer } from "../domain/types";
import { intersectFlags } from "../domain/visibility";
import type { ReportFiles } from "./export.service";
import type { AuditSink, FileAudience, FileStore, ReportMailer, RunFile, ScheduleFilters, ScheduleInput, ScheduleRecord, ScheduleStore, ViewerSource } from "./ports";
import type { ReportService } from "./report.service";

const isFull = (v: ReportViewer) => hasLevel(v.permissions.reports, "FULL");
const canReport = (v: ReportViewer) => hasLevel(v.permissions.reports, "VIEW");
const audienceKey = (a: FileAudience) => `${+a.flags.seeCost}${+a.flags.seeProfit}${+a.flags.seeMargin}|${[...a.warehouseIds].sort().join(",")}`;

/** A file a viewer may download: they see at least what it was generated for. */
export function covers(viewer: ReportViewer, a: FileAudience): boolean {
  const flagsOk = (Object.keys(a.flags) as (keyof FileAudience["flags"])[]).every((f) => !a.flags[f] || viewer.flags[f]);
  return flagsOk && a.warehouseIds.every((w) => viewer.warehouseIds.includes(w));
}

export type ScheduleDto = ReturnType<ScheduleService["toDto"]>;

export class ScheduleService {
  constructor(
    private readonly d: {
      store: ScheduleStore;
      reports: ReportService;
      files: ReportFiles;
      fileStore: FileStore;
      viewers: ViewerSource;
      mailer: ReportMailer;
      audit: AuditSink;
      enqueueRun: (runId: string) => Promise<void>;
      appUrl: () => string;
      now?: () => Date;
    },
  ) {}

  private now() {
    return this.d.now?.() ?? new Date();
  }

  toDto(s: ScheduleRecord) {
    const def = this.d.reports.definition(s.reportId);
    return { ...s, reportTitle: def.meta.title, reportNumber: def.meta.number, description: describeSchedule(s) };
  }

  private async load(viewer: ReportViewer, id: string) {
    const s = await this.d.store.get(id);
    if (!s || (s.owner.id !== viewer.userId && !isFull(viewer))) throw ReportErrors.scheduleNotFound();
    return s;
  }

  /** VIEW: own schedules; FULL: everyone's (optionally one owner's). */
  async list(viewer: ReportViewer, q: ListQuery<ScheduleFilters>) {
    const filters = isFull(viewer) ? q.filters : { ...q.filters, ownerId: viewer.userId };
    const r = await this.d.store.list({ ...q, filters });
    return { items: r.items.map((s) => this.toDto(s)), total: r.total };
  }

  count(viewer: ReportViewer) {
    return this.d.store.count(isFull(viewer) ? {} : { ownerId: viewer.userId });
  }

  async get(viewer: ReportViewer, id: string) {
    return this.toDto(await this.load(viewer, id));
  }

  /** Rules shared by create and edit: a report the owner can run, valid filters, allowed recipients. */
  private async validate(viewer: ReportViewer, input: ScheduleInput) {
    if (input.frequency === "WEEKLY" && (input.dayOfWeek === null || input.dayOfWeek === undefined)) throw ReportErrors.dayRequired("dayOfWeek");
    if (input.frequency === "MONTHLY" && !input.dayOfMonth) throw ReportErrors.dayRequired("dayOfMonth");
    const p = await this.d.reports.prepare(viewer, input.reportId, input.params);
    if (input.externalEmails.length && !isFull(viewer)) throw ReportErrors.externalForbidden();
    const ids = [...new Set(input.recipientUserIds)];
    if (!ids.length && !input.externalEmails.length) throw ReportErrors.recipientsRequired();
    const users = await this.d.store.users(ids);
    if (users.length !== ids.length) throw ReportErrors.unknownUsers();
    const without: string[] = [];
    for (const u of users) {
      const v = await this.d.viewers.forUser(u.id);
      if (!v || !canReport(v)) without.push(u.name);
    }
    if (without.length) throw ReportErrors.recipientWithoutAccess(without.join(", "));
    return {
      ...input,
      params: p.raw,
      recipientUserIds: ids,
      externalEmails: [...new Set(input.externalEmails.map((e) => e.trim().toLowerCase()))],
      dayOfWeek: input.frequency === "WEEKLY" ? input.dayOfWeek : null,
      dayOfMonth: input.frequency === "MONTHLY" ? input.dayOfMonth : null,
    };
  }

  async create(viewer: ReportViewer, actor: ActorContext, input: ScheduleInput) {
    const data = await this.validate(viewer, input);
    const s = await this.d.store.create(viewer.userId, data, data.isActive ? nextRunAt(data, this.now()) : null);
    await this.d.audit(actor, { action: "report_schedule.create", entityType: "ReportSchedule", entityId: s.id, after: this.auditView(s) });
    return this.toDto(s);
  }

  async update(viewer: ReportViewer, actor: ActorContext, id: string, patch: Partial<ScheduleInput>) {
    const before = await this.load(viewer, id);
    const merged: ScheduleInput = { ...pick(before), ...patch };
    // Editing as a non-FULL owner keeps the rule: external addresses need FULL.
    const data = await this.validate(viewer, merged);
    const timingChanged = ["frequency", "dayOfWeek", "dayOfMonth", "time", "isActive"].some((k) => k in patch);
    const next = timingChanged ? (data.isActive ? nextRunAt(data, this.now()) : null) : undefined;
    const s = await this.d.store.update(id, data, next);
    await this.d.audit(actor, { action: "report_schedule.update", entityType: "ReportSchedule", entityId: id, before: this.auditView(before), after: this.auditView(s) });
    return this.toDto(s);
  }

  async remove(viewer: ReportViewer, actor: ActorContext, id: string) {
    const s = await this.load(viewer, id);
    await this.d.store.delete(id);
    await this.d.audit(actor, { action: "report_schedule.delete", entityType: "ReportSchedule", entityId: id, before: this.auditView(s) });
  }

  async setActive(viewer: ReportViewer, actor: ActorContext, id: string, active: boolean) {
    const before = await this.load(viewer, id);
    const s = await this.d.store.update(id, { isActive: active }, active ? nextRunAt(before, this.now()) : null);
    await this.d.audit(actor, { action: active ? "report_schedule.resume" : "report_schedule.pause", entityType: "ReportSchedule", entityId: id, before: { isActive: before.isActive }, after: { isActive: active, nextRunAt: s.nextRunAt } });
    return this.toDto(s);
  }

  /** Queues an immediate run (the regular schedule is unchanged). */
  async runNow(viewer: ReportViewer, actor: ActorContext, id: string) {
    await this.load(viewer, id);
    const runId = await this.d.store.startRun(id, "MANUAL");
    await this.d.audit(actor, { action: "report_schedule.run_now", entityType: "ReportSchedule", entityId: id, after: { runId } });
    await this.d.enqueueRun(runId);
    return { runId, status: "RUNNING" as const };
  }

  async runs(viewer: ReportViewer, id: string, page: number, pageSize: number) {
    await this.load(viewer, id);
    const r = await this.d.store.runs(id, page, pageSize);
    return {
      total: r.total,
      items: r.items.map((run) => ({
        ...run,
        files: run.files.map((f, index) => ({ index, name: f.name, format: f.format, downloadable: covers(viewer, f.audience) })),
      })),
    };
  }

  /** A run's file, only for someone who can see at least what it was made for. */
  async file(viewer: ReportViewer, id: string, runId: string, index: number) {
    await this.load(viewer, id);
    const run = await this.d.store.run(runId);
    if (!run || run.scheduleId !== id) throw ReportErrors.runNotFound();
    const f = run.files[index];
    if (!f) throw ReportErrors.runNotFound();
    if (!covers(viewer, f.audience)) throw ReportErrors.fileHidden();
    const obj = await this.d.fileStore.get(f.key);
    if (!obj) throw ReportErrors.runNotFound();
    return { body: obj.body, contentType: obj.contentType, fileName: f.name };
  }

  /* ───────────── worker ───────────── */

  /** Scheduler tick: claims due schedules (each exactly once, even with several workers) and queues their runs. */
  async tick(now: Date = this.now(), limit = 50) {
    const claimed = await this.d.store.claimDue(now, (s) => nextRunAt(s, now), limit);
    for (const c of claimed) await this.d.enqueueRun(c.runId);
    return { claimed: claimed.length, runIds: claimed.map((c) => c.runId) };
  }

  private async fail(runId: string, s: ScheduleRecord, error: string, notify: boolean) {
    await this.d.store.finishRun(runId, { status: "FAILED", error });
    if (notify) {
      const def = this.d.reports.definition(s.reportId);
      await this.d.mailer.notifyAdmins(`Scheduled report skipped: ${def.meta.title}`, `${s.owner.name}'s scheduled “${def.meta.title}” (${describeSchedule(s)}) did not run: ${error}`, "/reports?tab=schedules");
    }
    return { status: "FAILED" as const, error };
  }

  /**
   * Runs a schedule as its owner, with the owner's permissions *now*. Each user recipient must
   * have Reports ≥ VIEW themselves and gets a file limited to what both they and the owner can
   * see (flags and warehouses). External addresses get the owner's view, only while the owner has FULL.
   */
  async execute(runId: string) {
    const run = await this.d.store.run(runId);
    if (!run || run.status !== "RUNNING") return { status: "SKIPPED" as const };
    const s = await this.d.store.get(run.scheduleId);
    if (!s) return { status: "SKIPPED" as const };
    const owner = await this.d.viewers.forUser(s.owner.id);
    if (!owner) return this.fail(runId, s, `the owner (${s.owner.name}) is disabled.`, true);
    if (!canReport(owner)) return this.fail(runId, s, `the owner (${s.owner.name}) no longer has access to Reports.`, true);
    const def = this.d.reports.definition(s.reportId);

    try {
      // Owner's view first (validates params and scope; kept in the run history).
      try {
        await this.d.reports.prepare(owner, s.reportId, s.params);
      } catch (err) {
        return this.fail(runId, s, `the owner can no longer run it with these filters (${(err as Error).message})`, true);
      }
      const ownerAudience: FileAudience = { flags: owner.flags, warehouseIds: [...owner.warehouseIds] };
      const groups = new Map<string, { audience: FileAudience; emails: string[] }>([[audienceKey(ownerAudience), { audience: ownerAudience, emails: [] }]]);
      const skipped: string[] = [];
      for (const u of await this.d.store.users(s.recipientUserIds)) {
        const v = await this.d.viewers.forUser(u.id);
        if (!v || !canReport(v) || !u.email) {
          skipped.push(u.name);
          continue;
        }
        const audience: FileAudience = { flags: intersectFlags(owner.flags, v.flags), warehouseIds: owner.warehouseIds.filter((w) => v.warehouseIds.includes(w)) };
        if (!audience.warehouseIds.length) {
          skipped.push(u.name);
          continue;
        }
        const k = audienceKey(audience);
        const g = groups.get(k) ?? { audience, emails: [] };
        g.emails.push(u.email);
        groups.set(k, g);
      }
      if (isFull(owner)) groups.get(audienceKey(ownerAudience))!.emails.push(...s.externalEmails);

      const formats = s.format === "BOTH" ? (["xlsx", "pdf"] as const) : s.format === "PDF" ? (["pdf"] as const) : (["xlsx"] as const);
      const files: RunFile[] = [];
      let rowCount: number | null = null;
      let emailed = 0;
      let n = 0;
      for (const g of groups.values()) {
        const viewer: ReportViewer = { ...owner, flags: g.audience.flags, warehouseIds: g.audience.warehouseIds };
        let p;
        try {
          p = await this.d.reports.prepare(viewer, s.reportId, s.params);
        } catch {
          skipped.push(...g.emails);
          continue; // e.g. the chosen warehouse is outside this recipient's scope
        }
        const attachments: { filename: string; fileKey: string; contentType: string }[] = [];
        for (const format of formats) {
          const built = await this.d.files.build(p, format, `${owner.name} (scheduled)`);
          const key = `reports/schedules/${s.id}/${runId}/${++n}-${built.fileName}`;
          await this.d.fileStore.put(key, built.bytes, built.contentType);
          files.push({ key, name: built.fileName, format: format === "xlsx" ? "XLSX" : "PDF", audience: g.audience });
          attachments.push({ filename: built.fileName, fileKey: key, contentType: built.contentType });
          rowCount ??= built.rows;
        }
        for (const to of g.emails) {
          await this.d.mailer.send(
            to,
            `StockBook — ${def.meta.title} (${dhakaDate(this.now())})`,
            {
              title: def.meta.title,
              paragraphs: [
                `Your scheduled report is attached (${describeSchedule(s)}).`,
                `Filters: ${(await this.d.reports.filters(p)).map((f) => `${f.label}: ${f.value}`).join(" · ") || "none"}.`,
                `Scheduled by ${owner.name}. You only receive the columns and warehouses you are allowed to see in StockBook.`,
              ],
              link: `${this.d.appUrl().replace(/\/$/, "")}/reports?r=${def.meta.id}`,
              linkLabel: "Open the report in StockBook",
            },
            attachments,
          );
          emailed++;
        }
      }
      await this.d.store.finishRun(runId, { status: "SUCCESS", rowCount, files, emailed, error: skipped.length ? `Not sent to: ${skipped.join(", ")} (no access, no email or no shared warehouse).` : null });
      return { status: "SUCCESS" as const, files: files.length, emailed, skipped };
    } catch (err) {
      return this.fail(runId, s, (err as Error).message || "The report could not be generated.", false);
    }
  }

  private auditView(s: ScheduleRecord) {
    return { reportId: s.reportId, params: s.params, frequency: s.frequency, dayOfWeek: s.dayOfWeek, dayOfMonth: s.dayOfMonth, time: s.time, format: s.format, recipientUserIds: s.recipientUserIds, externalEmails: s.externalEmails, isActive: s.isActive, ownerId: s.owner.id };
  }
}

function pick(s: ScheduleRecord): ScheduleInput {
  return { reportId: s.reportId, params: s.params, frequency: s.frequency, dayOfWeek: s.dayOfWeek, dayOfMonth: s.dayOfMonth, time: s.time, format: s.format, recipientUserIds: s.recipientUserIds, externalEmails: s.externalEmails, isActive: s.isActive };
}
