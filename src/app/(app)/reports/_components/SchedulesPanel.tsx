"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox, SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { Pagination } from "@/components/ui/Pagination";
import { Tag } from "@/components/ui/Tag";
import { api, ApiError, download, errorMessage, type Page } from "@/lib/api-client";
import { WEEKDAYS } from "@/modules/reporting/domain/schedule";
import { FilterFields } from "./FilterFields";
import { cleanFilters, FORMAT_LABEL, formatDhaka, withDefaults, type Lookups, type ReportInfo, type ReportsCaps, type RunDto, type ScheduleDto } from "./types";
import styles from "./reports.module.css";

interface FormState {
  id: string | null;
  reportId: string;
  params: Record<string, string>;
  frequency: ScheduleDto["frequency"];
  dayOfWeek: string;
  dayOfMonth: string;
  time: string;
  format: ScheduleDto["format"];
  recipientUserIds: string[];
  externalEmails: string;
}

const STATUS_TAG = { SUCCESS: { kind: "green", label: "Sent" }, FAILED: { kind: "red", label: "Failed" }, RUNNING: { kind: "blue", label: "Running" } } as const;
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function SchedulesPanel({
  caps,
  catalog,
  lookups,
  prefill,
  onPrefillUsed,
  onCount,
}: {
  caps: ReportsCaps;
  catalog: ReportInfo[];
  lookups: Lookups | null;
  prefill: { reportId: string; params: Record<string, string> } | null;
  onPrefillUsed: () => void;
  onCount: (n: number) => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [list, setList] = useState<Page<ScheduleDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<ScheduleDto | null>(null);
  const [deleting, setDeleting] = useState<ScheduleDto | null>(null);
  const users = useMemo(() => new Map(lookups?.users.map((u) => [u.id, u.name]) ?? []), [lookups]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<Page<ScheduleDto>>("/report-schedules", { query: { page, pageSize, sort: "-createdAt" } });
      setList(r);
      onCount(r.meta.total);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, onCount]);

  useEffect(() => {
    void load();
  }, [load]);

  const blank = useCallback(
    (reportId: string, params: Record<string, string> = {}): FormState => {
      const r = catalog.find((x) => x.id === reportId) ?? catalog[0];
      return { id: null, reportId: r?.id ?? "", params: withDefaults(r?.params ?? [], params), frequency: "WEEKLY", dayOfWeek: "0", dayOfMonth: "1", time: "09:00", format: "XLSX", recipientUserIds: [caps.userId], externalEmails: "" };
    },
    [catalog, caps.userId],
  );

  useEffect(() => {
    if (prefill && catalog.length) {
      setForm(blank(prefill.reportId, prefill.params));
      onPrefillUsed();
    }
  }, [prefill, catalog, blank, onPrefillUsed]);

  const edit = (s: ScheduleDto) =>
    setForm({
      id: s.id,
      reportId: s.reportId,
      params: { ...s.params },
      frequency: s.frequency,
      dayOfWeek: String(s.dayOfWeek ?? 0),
      dayOfMonth: String(s.dayOfMonth ?? 1),
      time: s.time,
      format: s.format,
      recipientUserIds: [...s.recipientUserIds],
      externalEmails: s.externalEmails.join(", "),
    });

  async function save() {
    if (!form) return;
    setSaving(true);
    setFormErrors({});
    setFormError(null);
    const report = catalog.find((r) => r.id === form.reportId);
    const body = {
      reportId: form.reportId,
      params: cleanFilters(report?.params ?? [], form.params),
      frequency: form.frequency,
      dayOfWeek: form.frequency === "WEEKLY" ? Number(form.dayOfWeek) : null,
      dayOfMonth: form.frequency === "MONTHLY" ? Number(form.dayOfMonth) : null,
      time: form.time,
      format: form.format,
      recipientUserIds: form.recipientUserIds,
      externalEmails: caps.isFull
        ? form.externalEmails
            .split(/[,;\s]+/)
            .map((e) => e.trim())
            .filter(Boolean)
        : [],
    };
    try {
      if (form.id) await api(`/report-schedules/${form.id}`, { method: "PATCH", body });
      else await api("/report-schedules", { method: "POST", body, headers: { "Idempotency-Key": newKey() } });
      setNotice(form.id ? "Schedule saved." : "Schedule created. The first email goes out at the next run.");
      setForm(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormErrors(Object.fromEntries(Object.entries(err.fieldErrors()).map(([k, v]) => [k.split(".")[0]!, v])));
        setFormError(err.message);
      } else setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function act(s: ScheduleDto, action: "pause" | "resume" | "run-now") {
    try {
      await api(`/report-schedules/${s.id}/${action}`, { method: "POST", headers: { "Idempotency-Key": newKey() } });
      setNotice(action === "run-now" ? `“${s.reportTitle}” is running now; the emails go out in a minute or two.` : action === "pause" ? "Schedule paused." : "Schedule resumed.");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove() {
    if (!deleting) return;
    try {
      await api(`/report-schedules/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      setNotice("Schedule deleted.");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const recipients = (s: ScheduleDto) => [...s.recipientUserIds.map((id) => users.get(id) ?? "Unknown user"), ...s.externalEmails].join(", ") || "—";
  const formReport = catalog.find((r) => r.id === form?.reportId);

  return (
    <div className={styles.schedules}>
      <div className={styles.sectionHead}>
        <div>
          <h2 className={styles.sectionTitle}>Scheduled emails</h2>
          <p className={styles.muted}>
            Each run uses the owner’s access at that moment. Recipients only get the columns and warehouses they may see themselves.
            {caps.isFull ? " You manage everyone’s schedules." : " You see the schedules you own."}
          </p>
        </div>
        <Button onClick={() => setForm(blank(catalog[0]?.id ?? ""))} disabled={!catalog.length}>
          New schedule
        </Button>
      </div>
      {notice ? (
        <Notification kind="success" onClose={() => setNotice(null)}>
          {notice}
        </Notification>
      ) : null}
      {error ? (
        <Notification kind="error" onClose={() => setError(null)}>
          {error}
        </Notification>
      ) : null}

      <div className={styles.tableTile}>
        <div className={styles.scroll} role="region" aria-label="Scheduled emails" tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Report</th>
                <th scope="col">Schedule</th>
                <th scope="col">Recipients</th>
                <th scope="col">Format</th>
                <th scope="col">Next run</th>
                <th scope="col">Last status</th>
                <th scope="col" className={styles.end}>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && !list ? (
                <tr>
                  <td colSpan={7} className={styles.message}>
                    Loading…
                  </td>
                </tr>
              ) : !list?.data.length ? (
                <tr>
                  <td colSpan={7} className={styles.message}>
                    <strong>No scheduled emails yet.</strong>
                    <br />
                    Open a report and choose “Email on schedule”, or create one here.
                  </td>
                </tr>
              ) : (
                list.data.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className={styles.itemNo}>{s.reportNumber}</span> {s.reportTitle}
                      {caps.isFull && s.owner.id !== caps.userId ? <div className={styles.muted}>Owner: {s.owner.name}</div> : null}
                    </td>
                    <td>
                      {s.description}
                      {!s.isActive ? (
                        <>
                          {" "}
                          <Tag kind="gray">Paused</Tag>
                        </>
                      ) : null}
                    </td>
                    <td className={styles.recipients}>{recipients(s)}</td>
                    <td>{FORMAT_LABEL[s.format]}</td>
                    <td className={styles.nowrap}>{s.isActive ? formatDhaka(s.nextRunAt) : "—"}</td>
                    <td>{s.lastStatus ? <Tag kind={STATUS_TAG[s.lastStatus].kind}>{STATUS_TAG[s.lastStatus].label}</Tag> : <span className={styles.muted}>Not run yet</span>}</td>
                    <td className={`${styles.end} ${styles.nowrap}`}>
                      <Button kind="ghost" size="sm" onClick={() => edit(s)}>
                        Edit
                      </Button>
                      <Button kind="ghost" size="sm" onClick={() => void act(s, s.isActive ? "pause" : "resume")}>
                        {s.isActive ? "Pause" : "Resume"}
                      </Button>
                      <Button kind="ghost" size="sm" onClick={() => void act(s, "run-now")}>
                        Run now
                      </Button>
                      <Button kind="ghost" size="sm" onClick={() => setHistory(s)}>
                        History
                      </Button>
                      <Button kind="ghost" size="sm" onClick={() => setDeleting(s)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {list && list.meta.total > 0 ? (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={list.meta.total}
            onChange={(p, s) => {
              setPage(s !== pageSize ? 1 : p);
              setPageSize(s);
            }}
          />
        ) : null}
      </div>

      <Modal open={!!form} title={form?.id ? "Edit scheduled email" : "New scheduled email"} label="Reports" onClose={() => setForm(null)} onSubmit={(e) => (e.preventDefault(), void save())} submitting={saving} primaryText={form?.id ? "Save" : "Create schedule"}>
        {form ? (
          <div className={styles.form}>
            {formError ? <Notification kind="error">{formError}</Notification> : null}
            <SelectField label="Report" value={form.reportId} error={formErrors.reportId} onChange={(e) => setForm({ ...form, reportId: e.target.value, params: withDefaults(catalog.find((r) => r.id === e.target.value)?.params ?? [], {}) })}>
              {catalog.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.number}. {r.title}
                </option>
              ))}
            </SelectField>
            {formReport?.params.length ? (
              <fieldset className={styles.fieldset}>
                <legend className={styles.legend}>Filters</legend>
                <div className={styles.filters}>
                  <FilterFields params={formReport.params} values={form.params} lookups={lookups} onChange={(k, v) => setForm({ ...form, params: { ...form.params, [k]: v } })} />
                </div>
                {formErrors.params ? <p className={styles.fieldError}>{formErrors.params}</p> : null}
              </fieldset>
            ) : null}
            <div className={styles.formRow}>
              <SelectField label="How often" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as FormState["frequency"] })}>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </SelectField>
              {form.frequency === "WEEKLY" ? (
                <SelectField label="Day" value={form.dayOfWeek} error={formErrors.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}>
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </SelectField>
              ) : form.frequency === "MONTHLY" ? (
                <SelectField label="Day" value={form.dayOfMonth} error={formErrors.dayOfMonth} onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })}>
                  {Array.from({ length: 30 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {ordinal(i + 1)}
                    </option>
                  ))}
                  <option value="31">Last day of the month</option>
                </SelectField>
              ) : null}
              <TextField label="Time (Dhaka)" type="time" value={form.time} error={formErrors.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
              <SelectField label="Format" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value as FormState["format"] })}>
                <option value="XLSX">Excel</option>
                <option value="PDF">PDF</option>
                <option value="BOTH">Excel + PDF</option>
              </SelectField>
            </div>
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Recipients</legend>
              <p className={styles.muted}>Only users who can open Reports themselves; each gets a file limited to what they may see.</p>
              <div className={styles.recipientList}>
                {lookups?.users.map((u) => (
                  <Checkbox
                    key={u.id}
                    label={`${u.name} (${u.username})`}
                    checked={form.recipientUserIds.includes(u.id)}
                    onChange={(e) => setForm({ ...form, recipientUserIds: e.target.checked ? [...form.recipientUserIds, u.id] : form.recipientUserIds.filter((x) => x !== u.id) })}
                  />
                ))}
              </div>
              {formErrors.recipientUserIds ? <p className={styles.fieldError}>{formErrors.recipientUserIds}</p> : null}
            </fieldset>
            {caps.isFull ? (
              <TextAreaField
                label="External email addresses"
                helper="Comma-separated. They receive the owner’s view of the report, only while the owner has full Reports access."
                rows={2}
                value={form.externalEmails}
                error={formErrors.externalEmails}
                onChange={(e) => setForm({ ...form, externalEmails: e.target.value })}
              />
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal open={!!deleting} title="Delete this schedule?" label="Scheduled emails" size="sm" onClose={() => setDeleting(null)} onSubmit={(e) => (e.preventDefault(), void remove())} primaryText="Delete" primaryKind="danger">
        <p>
          “{deleting?.reportTitle}” ({deleting?.description}) will stop, and its run history is removed.
        </p>
      </Modal>

      {history ? <HistoryDrawer schedule={history} onClose={() => setHistory(null)} /> : null}
    </div>
  );
}

function HistoryDrawer({ schedule, onClose }: { schedule: ScheduleDto; onClose: () => void }) {
  const [runs, setRuns] = useState<RunDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Page<RunDto>>(`/report-schedules/${schedule.id}/runs`, { query: { pageSize: 50 } })
      .then((r) => setRuns(r.data))
      .catch((err) => setError(errorMessage(err)));
  }, [schedule.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.drawerOverlay} onClick={onClose}>
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label="Run history" onClick={(e) => e.stopPropagation()}>
        <header className={styles.drawerHead}>
          <div>
            <p className={styles.eyebrow}>Run history</p>
            <h2 className={styles.sectionTitle}>{schedule.reportTitle}</h2>
            <p className={styles.muted}>{schedule.description}</p>
          </div>
          <button type="button" className={styles.drawerClose} onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {error ? <Notification kind="error">{error}</Notification> : null}
        {!runs && !error ? <p className={styles.muted}>Loading…</p> : null}
        {runs && !runs.length ? <p className={styles.muted}>This schedule has not run yet.</p> : null}
        <ul className={styles.runs}>
          {runs?.map((r) => (
            <li key={r.id} className={styles.run}>
              <div className={styles.runHead}>
                <strong>{formatDhaka(r.startedAt)}</strong>
                <Tag kind={STATUS_TAG[r.status].kind}>{STATUS_TAG[r.status].label}</Tag>
              </div>
              <p className={styles.muted}>
                {r.trigger === "MANUAL" ? "Run now" : "Scheduled"} · {r.rowCount ?? 0} rows · {r.emailed} email{r.emailed === 1 ? "" : "s"}
              </p>
              {r.error ? <p className={r.status === "FAILED" ? styles.fieldError : styles.muted}>{r.error}</p> : null}
              {r.files.length ? (
                <div className={styles.runFiles}>
                  {r.files.map((f) =>
                    f.downloadable ? (
                      <Button key={f.index} kind="ghost" size="sm" onClick={() => void download(`/report-schedules/${schedule.id}/runs/${r.id}/files/${f.index}`, {}, f.name).catch((err) => setError(errorMessage(err)))}>
                        {f.format === "XLSX" ? "Excel" : "PDF"} · {f.name}
                      </Button>
                    ) : (
                      <span key={f.index} className={styles.muted} title="This file was made for a recipient who sees more than you">
                        {f.format === "XLSX" ? "Excel" : "PDF"} (not available to you)
                      </span>
                    ),
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
