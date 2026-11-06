"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { TextField } from "@/components/ui/Field";
import { Notification } from "@/components/ui/Notification";
import { Tabs } from "@/components/ui/Tabs";
import { Tag } from "@/components/ui/Tag";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { collect, rules } from "@/lib/validation";
import styles from "./catalog.module.css";

type Kind = "catalogs" | "categories" | "units";

// Same limits as the server (catalog dto.ts: RefName max 60; UNIT_CODE_PATTERN after trim + lower-case).
const NAME_MAX = 60;
const UNIT_CODE = /^[a-z][a-z0-9.]{0,9}$/;
const nameProblem = (v: string) => rules.required(v, "a name") ?? rules.maxLength(v, NAME_MAX);

interface Row {
  id: string;
  name: string;
  code?: string;
  isActive: boolean;
  productCount?: number;
}

const KINDS: Record<Kind, { title: string; singular: string; hasCode: boolean; deletable: boolean }> = {
  catalogs: { title: "Catalogs (brands)", singular: "catalog", hasCode: false, deletable: true },
  categories: { title: "Categories", singular: "category", hasCode: false, deletable: true },
  units: { title: "Units of measure", singular: "unit", hasCode: true, deletable: false },
};

function RefTable({ kind, onNotice }: { kind: Kind; onNotice: (n: { kind: "success" | "error"; title: string; message?: string }) => void }) {
  const cfg = KINDS[kind];
  const [rows, setRows] = useState<Row[] | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [addAttempt, setAddAttempt] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [renameAttempt, setRenameAttempt] = useState(false);
  const [renameServerError, setRenameServerError] = useState<string>();
  const [busy, setBusy] = useState(false);

  // Browser-side checks, re-checked live after the first attempt.
  const addProblems = collect(
    ["code", cfg.hasCode ? (rules.required(code, "a code") ?? (UNIT_CODE.test(code.trim()) ? undefined : "Use 1–10 lower-case letters, digits or dots, starting with a letter.")) : undefined],
    ["name", nameProblem(name)],
  );
  const addErrors: Record<string, string | undefined> = { ...errors, ...(addAttempt ? addProblems : {}) };
  const renameProblem = editing ? nameProblem(editing.name) : undefined;
  const renameError = renameServerError ?? (renameAttempt ? renameProblem : undefined);

  const startRename = (r: Row | null) => {
    setEditing(r ? { id: r.id, name: r.name } : null);
    setRenameAttempt(false);
    setRenameServerError(undefined);
  };

  const load = useCallback(async () => {
    try {
      setRows((await api<{ data: Row[] }>(`/${kind}`)).data);
    } catch (err) {
      onNotice({ kind: "error", title: `Could not load ${cfg.title.toLowerCase()}`, message: errorMessage(err) });
    }
  }, [kind, cfg.title, onNotice]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  /** Runs an action; server field errors go to `onFieldErrors` (when given) instead of a general notice. */
  async function run(action: () => Promise<unknown>, success: string, onFieldErrors?: (fields: Record<string, string>) => void) {
    setBusy(true);
    try {
      await action();
      onNotice({ kind: "success", title: success });
      await load();
      return true;
    } catch (err) {
      const fields = err instanceof ApiError ? err.fieldErrors() : {};
      if (onFieldErrors && Object.keys(fields).length) onFieldErrors(fields);
      else onNotice({ kind: "error", title: "Could not save", message: errorMessage(err) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    setAddAttempt(true);
    setErrors({});
    if (Object.keys(addProblems).length) return;
    const ok = await run(() => api(`/${kind}`, { method: "POST", body: cfg.hasCode ? { code: code.trim(), name: name.trim() } : { name: name.trim() } }), `${name.trim()} added`, setErrors);
    if (ok) {
      setName("");
      setCode("");
      setAddAttempt(false);
    }
  }

  async function rename(id: string) {
    setRenameAttempt(true);
    setRenameServerError(undefined);
    if (!editing || renameProblem) return;
    const ok = await run(() => api(`/${kind}/${id}`, { method: "PATCH", body: { name: editing.name.trim() } }), "Renamed", (fields) => setRenameServerError(fields.name ?? Object.values(fields)[0]));
    if (ok) startRename(null);
  }

  const columns: Column<Row>[] = [
    ...(cfg.hasCode ? [{ key: "code", header: "Code", render: (r: Row) => <span className={styles.mono}>{r.code}</span> }] : []),
    {
      key: "name",
      header: "Name",
      render: (r) =>
        editing?.id === r.id ? (
          <form
            className={styles.inlineAdd}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void rename(r.id);
            }}
          >
            <TextField
              label={<span className="visually-hidden">New name</span>}
              value={editing.name}
              onChange={(e) => {
                setEditing({ id: r.id, name: e.target.value });
                setRenameServerError(undefined);
              }}
              error={renameError}
              autoFocus
            />
            <Button type="submit" size="sm" disabled={busy}>
              Save
            </Button>
            <Button kind="ghost" size="sm" onClick={() => startRename(null)}>
              Cancel
            </Button>
          </form>
        ) : (
          <span className={styles.nameCell}>{r.name}</span>
        ),
    },
    ...(cfg.hasCode ? [] : [{ key: "count", header: "Products", align: "end" as const, render: (r: Row) => r.productCount ?? 0 }]),
    { key: "status", header: "Status", render: (r) => <Tag kind={r.isActive ? "green" : "gray"}>{r.isActive ? "Active" : "Inactive"}</Tag> },
    {
      key: "actions",
      header: <span className="visually-hidden">Actions</span>,
      align: "end",
      render: (r) => (
        <div className={styles.detailActions}>
          <Button kind="ghost" size="sm" onClick={() => startRename(r)} disabled={busy}>
            Rename
          </Button>
          <Button
            kind="ghost"
            size="sm"
            disabled={busy}
            onClick={() => run(() => api(`/${kind}/${r.id}`, { method: "PATCH", body: { isActive: !r.isActive } }), `${r.name} ${r.isActive ? "deactivated" : "activated"}`)}
          >
            {r.isActive ? "Deactivate" : "Activate"}
          </Button>
          {cfg.deletable ? (
            <Button
              kind="ghost"
              size="sm"
              disabled={busy || (r.productCount ?? 0) > 0}
              title={(r.productCount ?? 0) > 0 ? "In use by products — deactivate it instead" : undefined}
              onClick={() => run(() => api(`/${kind}/${r.id}`, { method: "DELETE" }), `${r.name} deleted`)}
            >
              Delete
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      caption={cfg.title}
      columns={columns}
      rows={rows ?? []}
      rowKey={(r) => r.id}
      loading={!rows}
      emptyMessage={`No ${cfg.title.toLowerCase()} yet.`}
      toolbar={
        <form
          className={styles.addRow}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          {cfg.hasCode ? (
            <TextField
              label="Code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toLowerCase());
                setErrors({});
              }}
              error={addErrors.code}
              mono
              spellCheck={false}
              maxLength={10}
              placeholder="pair"
            />
          ) : null}
          <TextField
            label={`New ${cfg.singular}`}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors({});
            }}
            error={addErrors.name}
            placeholder={kind === "catalogs" ? "e.g. Gree" : kind === "categories" ? "e.g. Ventilation fan" : "e.g. Pair"} />
          <Button type="submit" disabled={busy}>
            Add {cfg.singular}
          </Button>
        </form>
      }
    />
  );
}

export function CatalogSettings() {
  const [tab, setTab] = useState<Kind>("categories");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; title: string; message?: string } | null>(null);

  return (
    <>
      <p className={styles.breadcrumb}>
        <Link href="/catalog">← Back to the product catalog</Link>
      </p>
      {notice ? (
        <Notification kind={notice.kind} title={notice.title} onClose={() => setNotice(null)} className={styles.notice}>
          {notice.message}
        </Notification>
      ) : null}
      <Tabs
        label="Catalog settings"
        selected={tab}
        onChange={(k) => {
          setTab(k);
          setNotice(null);
        }}
        items={[
          { key: "categories", label: "Categories" },
          { key: "units", label: "Units" },
          { key: "catalogs", label: "Catalogs (brands)" },
        ]}
      />
      <div className={styles.panel} role="tabpanel">
        <RefTable key={tab} kind={tab} onNotice={setNotice} />
      </div>
    </>
  );
}
