"use client";

import { useCallback, useEffect, useState } from "react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SelectField, TextField } from "@/components/ui/Field";
import { Pagination } from "@/components/ui/Pagination";
import { Tag, type TagKind } from "@/components/ui/Tag";
import { api, errorMessage, type Page } from "@/lib/api-client";
import { formatDateTime } from "@/shared/time/format";
import type { LoginHistoryDto, Notify, UserDto } from "./types";
import styles from "./users.module.css";

const RESULTS: Record<LoginHistoryDto["result"], { label: string; kind: TagKind }> = {
  SUCCESS: { label: "Success", kind: "green" },
  WRONG_PASSWORD: { label: "Wrong password", kind: "red" },
  LOCKED: { label: "Locked", kind: "yellow" },
  DISABLED: { label: "Disabled", kind: "red" },
  UNKNOWN_USER: { label: "Unknown user", kind: "gray" },
  RATE_LIMITED: { label: "Rate limited", kind: "yellow" },
};

/** Short "Chrome on Windows"-style label from a user-agent string. */
function device(ua: string | null): string {
  if (!ua) return "—";
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iOS/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : null;
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : null;
  if (browser && os) return `${browser} on ${os}`;
  return ua.length > 40 ? `${ua.slice(0, 40)}…` : ua;
}

export function LoginHistoryTab({ notify }: { notify: Notify }) {
  const [users, setUsers] = useState<UserDto[]>([]);
  const [filters, setFilters] = useState({ userId: "", result: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<Page<LoginHistoryDto> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Page<UserDto>>("/users", { query: { pageSize: 100, sort: "name" } })
      .then((r) => setUsers(r.data))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await api<Page<LoginHistoryDto>>("/login-history", { query: { page, pageSize, ...filters } }));
    } catch (err) {
      notify({ kind: "error", title: "Could not load login history", message: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const setFilter = (key: keyof typeof filters) => (e: { target: { value: string } }) => {
    setFilters((f) => ({ ...f, [key]: e.target.value }));
    setPage(1);
  };

  const columns: Column<LoginHistoryDto>[] = [
    { key: "time", header: "Time", render: (h) => <span className={styles.nowrap}>{formatDateTime(h.createdAt)}</span> },
    {
      key: "user",
      header: "User",
      render: (h) =>
        h.user ? (
          <div className={styles.nameCell}>
            <span>{h.user.name}</span>
            <span className={`${styles.subtle} ${styles.mono}`}>{h.user.username}</span>
          </div>
        ) : (
          <span className={styles.mono}>{h.usernameAttempted}</span>
        ),
    },
    { key: "result", header: "Result", render: (h) => <Tag kind={RESULTS[h.result].kind}>{RESULTS[h.result].label}</Tag> },
    { key: "client", header: "Client", render: (h) => (h.client === "mobile" ? "Mobile app" : h.client === "web" ? "Web" : "—") },
    { key: "ip", header: "IP address", render: (h) => <span className={styles.mono}>{h.ip ?? "—"}</span> },
    { key: "device", header: "Device", render: (h) => <span title={h.userAgent ?? undefined}>{device(h.userAgent)}</span> },
  ];

  return (
    <DataTable
      caption="Login history"
      columns={columns}
      rows={result?.data ?? []}
      rowKey={(h) => h.id}
      loading={loading}
      emptyMessage="No login attempts match these filters."
      toolbar={
        <div className={styles.filters}>
          <SelectField label="User" value={filters.userId} onChange={setFilter("userId")}>
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.username})
              </option>
            ))}
          </SelectField>
          <SelectField label="Result" value={filters.result} onChange={setFilter("result")}>
            <option value="">All results</option>
            {Object.entries(RESULTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </SelectField>
          <TextField label="From" type="date" value={filters.from} onChange={setFilter("from")} max={filters.to || undefined} />
          <TextField label="To" type="date" value={filters.to} onChange={setFilter("to")} min={filters.from || undefined} />
        </div>
      }
      footer={
        result ? (
          <Pagination
            page={result.meta.page}
            pageSize={result.meta.pageSize}
            total={result.meta.total}
            onChange={(p, s) => {
              setPage(p);
              setPageSize(s);
            }}
          />
        ) : null
      }
    />
  );
}
