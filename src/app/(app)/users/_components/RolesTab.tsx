"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox, FieldGroup, SelectField, TextField } from "@/components/ui/Field";
import { FormProblems } from "@/components/ui/FormProblems";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { Tag } from "@/components/ui/Tag";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { collect, rules } from "@/lib/validation";
import { FLAG_LABELS, MODULE_KEYS, MODULE_LABELS, PERMISSION_LEVELS, SENSITIVE_FLAGS, type PermissionMap, type SensitiveFlags } from "@/shared/rbac/levels";
import { LEVEL_LABEL, LEVEL_TAG, type Notify, type RoleDto, type RoleMatrixDto } from "./types";
import styles from "./users.module.css";

interface Draft {
  name: string;
  permissions: PermissionMap;
  flags: SensitiveFlags;
}

const draftOf = (r: RoleDto): Draft => ({ name: r.name, permissions: { ...r.permissions }, flags: { ...r.flags } });

const ROLE_LABELS: Record<string, string> = { name: "Role name", copyFromRoleId: "Start with permissions of" };

/** Same rule as the server's RoleNameSchema: 2–50 characters. */
const roleNameProblem = (name: string) => rules.required(name, "a role name") ?? (name.trim().length < 2 ? "Use at least 2 characters." : rules.maxLength(name, 50));

export function RolesTab({ roles, reloadRoles, notify }: { roles: RoleDto[]; reloadRoles: () => Promise<void>; notify: Notify }) {
  const [matrix, setMatrix] = useState<RoleMatrixDto | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [attempt, setAttempt] = useState(false);
  const [serverNameError, setServerNameError] = useState<string | undefined>();

  const loadMatrix = useCallback(async () => {
    try {
      setMatrix((await api<{ data: RoleMatrixDto }>("/roles/matrix")).data);
    } catch (err) {
      notify({ kind: "error", title: "Could not load the permission matrix", message: errorMessage(err) });
    }
  }, [notify]);

  useEffect(() => {
    void loadMatrix();
  }, [loadMatrix]);

  const selected = useMemo(() => roles.find((r) => r.id === selectedId) ?? roles.find((r) => !r.isLocked) ?? roles[0] ?? null, [roles, selectedId]);

  useEffect(() => {
    setDraft(selected ? draftOf(selected) : null);
    setAttempt(false);
    setServerNameError(undefined);
  }, [selected]);

  const refresh = async () => {
    await Promise.all([reloadRoles(), loadMatrix()]);
  };

  const dirty = !!(selected && draft && JSON.stringify(draftOf(selected)) !== JSON.stringify(draft));

  // Browser-side check of the role name; shown after the first save attempt and re-checked as you type.
  const nameProblem = draft ? roleNameProblem(draft.name) : undefined;
  const nameError = (attempt ? nameProblem : undefined) ?? serverNameError;

  async function save() {
    if (!selected || !draft) return;
    setAttempt(true);
    if (nameProblem) return;
    setServerNameError(undefined);
    setSaving(true);
    try {
      const changedPermissions = Object.fromEntries(MODULE_KEYS.filter((m) => draft.permissions[m] !== selected.permissions[m]).map((m) => [m, draft.permissions[m]]));
      const changedFlags = Object.fromEntries(SENSITIVE_FLAGS.filter((f) => draft.flags[f] !== selected.flags[f]).map((f) => [f, draft.flags[f]]));
      await api(`/roles/${selected.id}`, {
        method: "PATCH",
        body: {
          ...(draft.name.trim() !== selected.name ? { name: draft.name.trim() } : {}),
          ...(Object.keys(changedPermissions).length ? { permissions: changedPermissions } : {}),
          ...(Object.keys(changedFlags).length ? { flags: changedFlags } : {}),
        },
      });
      await refresh();
      notify({ kind: "success", title: "Role saved", message: `${draft.name.trim()} permissions apply to its users on their next action.` });
    } catch (err) {
      const fieldName = err instanceof ApiError ? err.fieldErrors().name : undefined;
      if (fieldName) setServerNameError(fieldName);
      else notify({ kind: "error", title: "Could not save role", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selected) return;
    setSaving(true);
    try {
      await api(`/roles/${selected.id}`, { method: "DELETE" });
      setConfirmDelete(false);
      setSelectedId(null);
      await refresh();
      notify({ kind: "success", title: "Role deleted", message: `${selected.name} was deleted.` });
    } catch (err) {
      setConfirmDelete(false);
      notify({ kind: "error", title: `Cannot delete ${selected.name}`, message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className={styles.tile} aria-labelledby="matrix-title">
        <div className={styles.tileHeader}>
          <div>
            <h2 id="matrix-title" className={styles.sectionTitle}>
              Permission matrix
            </h2>
            <p className={styles.sectionHelp}>Levels: None &lt; View &lt; Create &lt; Approve &lt; Full.</p>
          </div>
        </div>
        <div className={styles.matrixScroll} tabIndex={0} role="region" aria-label="Permission matrix">
          <table className={styles.matrix}>
            <thead>
              <tr>
                <th scope="col">Module</th>
                {matrix?.roles.map((r) => (
                  <th key={r.id} scope="col">
                    {r.name}
                    {r.isLocked ? " 🔒" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(matrix?.modules ?? []).map((m) => (
                <tr key={m.key}>
                  <th scope="row">{m.label}</th>
                  {matrix!.roles.map((r) => (
                    <td key={r.id}>
                      <Tag kind={LEVEL_TAG[r.permissions[m.key]]}>{LEVEL_LABEL[r.permissions[m.key]]}</Tag>
                    </td>
                  ))}
                </tr>
              ))}
              {matrix
                ? SENSITIVE_FLAGS.map((f) => (
                    <tr key={f} className={styles.flagRow}>
                      <th scope="row">{FLAG_LABELS[f]}</th>
                      {matrix.roles.map((r) => (
                        <td key={r.id}>{r.flags[f] ? <span className={styles.yes}>✓ Yes</span> : "—"}</td>
                      ))}
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.tile} aria-labelledby="editor-title">
        <div className={styles.tileHeader}>
          <div>
            <h2 id="editor-title" className={styles.sectionTitle}>
              Edit role
            </h2>
            <p className={styles.sectionHelp}>Pick a role to change its access. Numbers show how many users have the role.</p>
          </div>
          <Button kind="secondary" onClick={() => setCreating(true)}>
            + New role
          </Button>
        </div>

        <div className={styles.chips} role="radiogroup" aria-label="Role">
          {roles.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={selected?.id === r.id}
              className={`${styles.chip} ${selected?.id === r.id ? styles.chipSelected : ""}`}
              onClick={() => setSelectedId(r.id)}
            >
              {r.name}
              <span className={styles.chipCount} aria-label={`${r.userCount} users`}>
                {r.userCount}
              </span>
            </button>
          ))}
        </div>

        {selected && draft ? (
          <div className={styles.editor}>
            {attempt && nameProblem ? <FormProblems problems={{ name: nameProblem }} labels={ROLE_LABELS} /> : null}
            {selected.isLocked ? (
              <Notification kind="info" title="The Admin role is locked">
                Admin always has Full access to every module and can see cost, profit and margin. It cannot be edited or deleted.
              </Notification>
            ) : null}
            <TextField
              label="Role name"
              value={draft.name}
              onChange={(e) => {
                setDraft({ ...draft, name: e.target.value });
                setServerNameError(undefined);
              }}
              error={nameError}
              disabled={selected.isLocked}
              fieldClassName={styles.filterField}
            />
            <div className={styles.levelGrid}>
              {MODULE_KEYS.map((m) => (
                <SelectField
                  key={m}
                  label={MODULE_LABELS[m]}
                  helper={m === "overheads" ? "Store charge, holding and established cost. Amounts also need “See cost”." : undefined}
                  value={draft.permissions[m]}
                  disabled={selected.isLocked}
                  onChange={(e) => setDraft({ ...draft, permissions: { ...draft.permissions, [m]: e.target.value } })}
                >
                  {PERMISSION_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {LEVEL_LABEL[l]}
                    </option>
                  ))}
                </SelectField>
              ))}
            </div>
            <FieldGroup legend="Sensitive data">
              <div className={styles.checkboxes}>
                {SENSITIVE_FLAGS.map((f) => (
                  <Checkbox
                    key={f}
                    label={FLAG_LABELS[f]}
                    checked={draft.flags[f]}
                    disabled={selected.isLocked}
                    onChange={(e) => setDraft({ ...draft, flags: { ...draft.flags, [f]: e.target.checked } })}
                  />
                ))}
              </div>
            </FieldGroup>
            {!selected.isLocked ? (
              <div className={styles.editorActions}>
                <Button kind="danger" onClick={() => (selected.userCount > 0 ? remove() : setConfirmDelete(true))} disabled={saving}>
                  Delete role
                </Button>
                <div className={styles.rowActions}>
                  <Button kind="secondary" onClick={() => setDraft(draftOf(selected))} disabled={!dirty || saving}>
                    Reset
                  </Button>
                  <Button onClick={save} disabled={!dirty || saving}>
                    {saving ? "Saving…" : "Save role"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {creating ? (
        <NewRoleModal
          roles={roles}
          onClose={() => setCreating(false)}
          onCreated={async (role) => {
            setCreating(false);
            await refresh();
            setSelectedId(role.id);
            notify({ kind: "success", title: "Role created", message: `${role.name} is ready. Adjust its permissions below.` });
          }}
        />
      ) : null}

      <Modal
        open={confirmDelete}
        size="sm"
        label="Delete role"
        title={`Delete ${selected?.name ?? ""}?`}
        primaryText="Delete"
        primaryKind="danger"
        submitting={saving}
        onClose={() => setConfirmDelete(false)}
        onSubmit={remove}
      >
        <p>This cannot be undone.</p>
      </Modal>
    </>
  );
}

function NewRoleModal({ roles, onClose, onCreated }: { roles: RoleDto[]; onClose: () => void; onCreated: (r: RoleDto) => void }) {
  const [name, setName] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(false);

  const problems = collect(["name", roleNameProblem(name)]);
  const shownErrors = { ...errors, ...(attempt ? problems : {}) };

  // A server error on a field disappears once the form is edited.
  useEffect(() => setErrors({}), [name, copyFrom]);

  async function submit() {
    setAttempt(true);
    setFormError(null);
    if (Object.keys(problems).length) return;
    setErrors({});
    setSaving(true);
    try {
      const res = await api<{ data: RoleDto }>("/roles", { method: "POST", body: { name: name.trim(), ...(copyFrom ? { copyFromRoleId: copyFrom } : {}) } });
      onCreated(res.data);
    } catch (err) {
      const fields = err instanceof ApiError ? err.fieldErrors() : {};
      setErrors(fields);
      setFormError(Object.keys(fields).length ? "Some details need fixing. The fields are marked in red below." : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open size="sm" label="Roles" title="New role" primaryText="Create role" onClose={onClose} onSubmit={submit} submitting={saving}>
      {attempt ? <FormProblems problems={problems} labels={ROLE_LABELS} /> : null}
      {formError ? (
        <Notification kind="error" title="Could not create role" onClose={() => setFormError(null)}>
          {formError}
        </Notification>
      ) : null}
      <TextField label="Role name" value={name} onChange={(e) => setName(e.target.value)} error={shownErrors.name} placeholder="e.g. Site Engineer" helper="2–50 characters." />
      <SelectField searchable label="Start with permissions of" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} error={shownErrors.copyFromRoleId}>
        <option value="">Blank (no access)</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </SelectField>
    </Modal>
  );
}
