"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Checkbox, TextAreaField, TextField } from "@/components/ui/Field";
import { FormProblems } from "@/components/ui/FormProblems";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { Pagination } from "@/components/ui/Pagination";
import { Tag } from "@/components/ui/Tag";
import { api, ApiError, errorMessage, type Page } from "@/lib/api-client";
import { collect, revealProblems, rules, type Problems } from "@/lib/validation";
import type { CustomerDto } from "../stock/_components/types";
import styles from "../stock/_components/stock.module.css";

type TabKey = "customers";
type Row = CustomerDto;
type Form = Record<string, string>;

interface Config {
  noun: string;
  columns: Column<Row>[];
  empty: (r?: Row) => Form;
  fields: (f: Form, set: (k: string, v: string) => void, errors: Record<string, string>, editing: boolean) => ReactNode;
  toBody: (f: Form) => Record<string, unknown>;
  /** Browser-side checks mirroring the server DTO; every problem is shown at once. */
  check: (f: Form) => Problems;
  /** Field names for the problem summary. */
  labels: Record<string, string>;
}

const nul = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
const activeTag = (r: Row) => (r.isActive ? null : <Tag kind="gray">Inactive</Tag>);

function configs(): Record<TabKey, Config> {
  const contact = (f: Form, set: (k: string, v: string) => void, errors: Record<string, string>) => (
    <>
      <TextField label="Contact person" value={f.contactPerson ?? ""} onChange={(e) => set("contactPerson", e.target.value)} error={errors.contactPerson} />
      <TextField label="Phone" kind="phone" placeholder="e.g. 01711-000000" value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} error={errors.phone} />
      {/* Not type="email": the Modal form has no noValidate, so the browser's own check would hide ours. */}
      <TextField label="Email" inputMode="email" autoComplete="email" spellCheck={false} placeholder="name@company.com" value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} error={errors.email} />
      <TextAreaField label="Address" rows={2} value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} error={errors.address} fieldClassName={styles.full} />
    </>
  );
  const contactBody = (f: Form) => ({ contactPerson: nul(f.contactPerson), phone: nul(f.phone), email: nul(f.email), address: nul(f.address) });
  // Same limits as the server's customerShape (inventory dto.ts): contactPerson 100, phone 30, email 200, address 300.
  const contactChecks = (f: Form): [string, string | undefined][] => [
    ["contactPerson", rules.maxLength(f.contactPerson, 100)],
    ["phone", rules.phone(f.phone)],
    ["email", rules.email(f.email)],
    ["address", rules.maxLength(f.address, 300)],
  ];
  const contactLabels = { contactPerson: "Contact person", phone: "Phone", email: "Email", address: "Address" };
  const contactOf = (r?: Row) => {
    const c = r as CustomerDto | undefined;
    return { contactPerson: c?.contactPerson ?? "", phone: c?.phone ?? "", email: c?.email ?? "", address: c?.address ?? "" };
  };

  return {
    customers: {
      noun: "customer",
      columns: [
        { key: "name", header: "Name", render: (r) => <>{r.name} {activeTag(r)}</> },
        { key: "contact", header: "Contact", render: (r) => [(r as CustomerDto).contactPerson, (r as CustomerDto).phone].filter(Boolean).join(" · ") || "—" },
        { key: "address", header: "Address", render: (r) => (r as CustomerDto).address ?? "—" },
      ],
      empty: (r) => ({ name: r?.name ?? "", ...contactOf(r) }),
      fields: (f, set, errors) => (
        <>
          <TextField label="Name *" value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} error={errors.name} aria-required="true" fieldClassName={styles.full} />
          {contact(f, set, errors)}
        </>
      ),
      toBody: (f) => ({ name: f.name?.trim(), ...contactBody(f) }),
      check: (f) => collect(["name", rules.required(f.name, "the customer's name") ?? rules.maxLength(f.name, 150)], ...contactChecks(f)),
      labels: { name: "Name", ...contactLabels },
    },
  };
}

/** Customers (projects moved to /projects in Module 5, suppliers to /purchases in Module 4). */
export function MastersAdmin({ canManage }: { canManage: boolean }) {
  return <MasterTab path="customers" config={configs().customers} canManage={canManage} />;
}

function MasterTab({ path, config, canManage }: { path: TabKey; config: Config; canManage: boolean }) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<Page<Row> | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [form, setForm] = useState<Form>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(false);
  const [saving, setSaving] = useState(false);

  const problems = editing ? config.check(form) : {};
  const shownErrors = { ...errors, ...(attempt ? problems : {}) };

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await api<Page<Row>>(`/${path}`, { query: { page, pageSize, q: debouncedQ, active: showInactive ? undefined : "true" } }));
    } catch (err) {
      setNotice({ kind: "error", message: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  }, [path, page, pageSize, debouncedQ, showInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (r: Row | "new") => {
    setEditing(r);
    setForm(config.empty(r === "new" ? undefined : r));
    setErrors({});
    setFormError(null);
    setAttempt(false);
  };

  async function save() {
    setAttempt(true);
    setFormError(null);
    if (Object.keys(problems).length) {
      revealProblems();
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const body = config.toBody(form);
      if (editing === "new") await api(`/${path}`, { method: "POST", body });
      else if (editing) await api(`/${path}/${editing.id}`, { method: "PATCH", body });
      setNotice({ kind: "success", message: `${config.noun.charAt(0).toUpperCase()}${config.noun.slice(1)} saved.` });
      setEditing(null);
      await load();
    } catch (err) {
      const fields = err instanceof ApiError ? err.fieldErrors() : {};
      setErrors(fields);
      // Field problems are marked on the fields; only say something general when there are none.
      setFormError(Object.keys(fields).length ? "Some details need fixing. The fields are marked in red below." : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(r: Row) {
    try {
      if (r.isActive) await api(`/${path}/${r.id}/deactivate`, { method: "POST" });
      else await api(`/${path}/${r.id}`, { method: "PATCH", body: { isActive: true } });
      setEditing(null);
      setNotice({ kind: "success", message: r.isActive ? `${r.name} deactivated. It can't be picked on new entries.` : `${r.name} reactivated.` });
      await load();
    } catch (err) {
      setNotice({ kind: "error", message: errorMessage(err) });
    }
  }

  const columns: Column<Row>[] = config.columns;

  return (
    <div className={styles.stack}>
      {notice ? (
        <Notification kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.message}
        </Notification>
      ) : null}
      <DataTable
        caption={path.charAt(0).toUpperCase() + path.slice(1)}
        columns={columns}
        rows={result?.data ?? []}
        rowKey={(r) => r.id}
        loading={loading}
        onRowClick={canManage ? open : undefined}
        rowLabel={(r) => `Edit ${r.name}`}
        emptyMessage={`No ${path} yet.`}
        toolbar={
          <div className={styles.toolbar}>
            <TextField label="Search" value={q} onChange={(e) => setQ(e.target.value)} fieldClassName={styles.search} />
            <Checkbox label="Show inactive" checked={showInactive} onChange={(e) => (setShowInactive(e.target.checked), setPage(1))} />
            {canManage ? (
              <div className={styles.toolbarActions}>
                <Button onClick={() => open("new")}>+ Add {config.noun}</Button>
              </div>
            ) : null}
          </div>
        }
        footer={result ? <Pagination page={page} pageSize={pageSize} total={result.meta.total} onChange={(p, s) => (setPage(p), setPageSize(s))} /> : null}
      />

      <Modal
        open={!!editing}
        title={editing === "new" ? `Add ${config.noun}` : `Edit ${config.noun}`}
        submitting={saving}
        onClose={() => setEditing(null)}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {formError ? (
          <Notification kind="error" title={`Couldn't save the ${config.noun}`} onClose={() => setFormError(null)}>
            {formError}
          </Notification>
        ) : null}
        {attempt ? <FormProblems problems={problems} labels={config.labels} /> : null}
        <div className={styles.grid}>
          {config.fields(
            form,
            (k, v) => {
              setForm((f) => ({ ...f, [k]: v }));
              // A server error on a field disappears once the form is edited.
              setErrors({});
            },
            shownErrors,
            editing !== "new",
          )}
        </div>
        {editing && editing !== "new" ? (
          <div style={{ marginTop: "var(--space-6)" }}>
            <Button kind={editing.isActive ? "danger" : "secondary"} size="sm" onClick={() => toggleActive(editing)}>
              {editing.isActive ? `Deactivate ${config.noun}` : `Reactivate ${config.noun}`}
            </Button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
