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
import styles from "./catalog.module.css";

type Kind = "catalogs" | "categories" | "units";

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
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      onNotice({ kind: "success", title: success });
      await load();
      return true;
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors()).length) setErrors(err.fieldErrors());
      onNotice({ kind: "error", title: "Could not save", message: errorMessage(err) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Enter a name.";
    if (cfg.hasCode && !/^[a-zA-Z][a-zA-Z0-9.]{0,9}$/.test(code.trim())) e.code = "1–10 letters/digits, starting with a letter.";
    setErrors(e);
    if (Object.keys(e).length) return;
    const ok = await run(() => api(`/${kind}`, { method: "POST", body: cfg.hasCode ? { code: code.trim(), name: name.trim() } : { name: name.trim() } }), `${name.trim()} added`);
    if (ok) {
      setName("");
      setCode("");
    }
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
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => api(`/${kind}/${r.id}`, { method: "PATCH", body: { name: editing.name } }), "Renamed").then((ok) => ok && setEditing(null));
            }}
          >
            <TextField label={<span className="visually-hidden">New name</span>} value={editing.name} onChange={(e) => setEditing({ id: r.id, name: e.target.value })} autoFocus />
            <Button type="submit" size="sm" disabled={busy}>
              Save
            </Button>
            <Button kind="ghost" size="sm" onClick={() => setEditing(null)}>
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
          <Button kind="ghost" size="sm" onClick={() => setEditing({ id: r.id, name: r.name })} disabled={busy}>
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
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          {cfg.hasCode ? <TextField label="Code" value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} error={errors.code} mono placeholder="pair" /> : null}
          <TextField label={`New ${cfg.singular}`} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder={kind === "catalogs" ? "e.g. Gree" : kind === "categories" ? "e.g. Ventilation fan" : "e.g. Pair"} />
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
