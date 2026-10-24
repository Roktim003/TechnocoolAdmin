"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Notification } from "@/components/ui/Notification";
import { Tabs } from "@/components/ui/Tabs";
import { api, errorMessage } from "@/lib/api-client";
import { REPORT_GROUPS } from "@/modules/reporting/domain/types";
import { ReportView } from "./ReportView";
import { SchedulesPanel } from "./SchedulesPanel";
import type { Lookups, ReportInfo, ReportsCaps } from "./types";
import styles from "./reports.module.css";

type Tab = "reports" | "schedules";
/** URL keys that are not report filters. */
const RESERVED = new Set(["tab", "r", "page", "pageSize", "sort"]);

/**
 * Reports | Scheduled emails. The selected report, its filters, page and sort live in the URL,
 * so a view can be bookmarked, shared with a colleague who has the same access, or reloaded.
 */
export function ReportsWorkspace({ caps }: { caps: ReportsCaps }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [catalog, setCatalog] = useState<ReportInfo[] | null>(null);
  const [scheduleCount, setScheduleCount] = useState(0);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<{ reportId: string; params: Record<string, string> } | null>(null);

  const tab: Tab = search.get("tab") === "schedules" ? "schedules" : "reports";
  const selectedId = search.get("r");

  useEffect(() => {
    Promise.all([api<{ data: ReportInfo[]; scheduleCount: number }>("/reports"), api<{ data: Lookups }>("/reports/lookups")])
      .then(([c, l]) => {
        setCatalog(c.data);
        setScheduleCount(c.scheduleCount);
        setLookups(l.data);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const report = useMemo(() => catalog?.find((r) => r.id === selectedId) ?? catalog?.[0] ?? null, [catalog, selectedId]);
  const filters = useMemo(() => Object.fromEntries([...search.entries()].filter(([k]) => !RESERVED.has(k))), [search]);

  const navigate = useCallback(
    (next: Record<string, string | undefined>, replace = true) => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(next)) if (v !== undefined && v !== "") qs.set(k, v);
      const url = `${pathname}${qs.size ? `?${qs}` : ""}`;
      if (replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [pathname, router],
  );

  const setTab = (t: Tab) => navigate({ tab: t === "schedules" ? "schedules" : undefined, r: report?.id }, false);

  return (
    <div className={styles.workspace}>
      <div className={styles.noPrint}>
        <Tabs<Tab>
          label="Reports"
          items={[
            { key: "reports", label: `Reports (${catalog?.length ?? 14})` },
            { key: "schedules", label: `Scheduled emails (${scheduleCount})` },
          ]}
          selected={tab}
          onChange={setTab}
        />
      </div>
      {error ? (
        <Notification kind="error" title="Reports could not be loaded">
          {error}
        </Notification>
      ) : null}

      {tab === "reports" ? (
        <div className={styles.layout}>
          <nav className={`${styles.list} ${styles.noPrint}`} aria-label="Reports">
            {REPORT_GROUPS.map((g) => {
              const items = catalog?.filter((r) => r.group === g) ?? [];
              if (!items.length) return null;
              return (
                <div key={g} className={styles.group}>
                  <p className={styles.groupTitle}>{g}</p>
                  <ul>
                    {items.map((r) => (
                      <li key={r.id}>
                        <button type="button" className={`${styles.item} ${r.id === report?.id ? styles.itemSelected : ""}`} aria-current={r.id === report?.id ? "page" : undefined} onClick={() => navigate({ r: r.id }, false)}>
                          <span className={styles.itemNo}>{r.number}</span>
                          <span>{r.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {!catalog && !error ? <p className={styles.muted}>Loading…</p> : null}
          </nav>
          <div className={styles.main}>
            {report ? (
              <ReportView
                key={report.id}
                report={report}
                lookups={lookups}
                filters={filters}
                page={Number(search.get("page")) || 1}
                pageSize={Number(search.get("pageSize")) || 50}
                sort={search.get("sort") ?? ""}
                onChange={(next) => navigate({ r: report.id, ...next.filters, page: next.page > 1 ? String(next.page) : undefined, pageSize: next.pageSize !== 50 ? String(next.pageSize) : undefined, sort: next.sort || undefined })}
                onSchedule={(params) => {
                  setPrefill({ reportId: report.id, params });
                  navigate({ tab: "schedules", r: report.id }, false);
                }}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <SchedulesPanel caps={caps} catalog={catalog ?? []} lookups={lookups} prefill={prefill} onPrefillUsed={() => setPrefill(null)} onCount={setScheduleCount} />
      )}
    </div>
  );
}
