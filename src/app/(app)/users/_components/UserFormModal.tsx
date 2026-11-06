"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Checkbox, FieldGroup, SelectField, TextField } from "@/components/ui/Field";
import { FormProblems } from "@/components/ui/FormProblems";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { collect, revealProblems, rules } from "@/lib/validation";
import type { RoleDto, UserDto, WarehouseDto } from "./types";
import styles from "./users.module.css";

const LABELS: Record<string, string> = {
  name: "Full name",
  username: "Username",
  phone: "Phone",
  email: "Email",
  roleId: "Role",
  warehouseIds: "Warehouse access",
  password: "Password",
};

interface Props {
  user: UserDto | null;
  roles: RoleDto[];
  warehouses: WarehouseDto[];
  isSelf: boolean;
  onClose: () => void;
  onSaved: (user: UserDto, created: boolean) => void;
}

export function UserFormModal({ user, roles, warehouses, isSelf, onClose, onSaved }: Props) {
  const creating = !user;
  const [form, setForm] = useState({
    name: user?.name ?? "",
    username: user?.username ?? "",
    phone: user?.phone ?? "",
    email: user?.email ?? "",
    roleId: user?.role.id ?? "",
    warehouseIds: user?.warehouses.map((w) => w.id) ?? (warehouses.length === 1 ? [warehouses[0]!.id] : []),
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const toggleWarehouse = (id: string) =>
    setForm((f) => ({ ...f, warehouseIds: f.warehouseIds.includes(id) ? f.warehouseIds.filter((w) => w !== id) : [...f.warehouseIds, id] }));

  // Browser-side checks (same rules as the server); every problem is shown at once.
  const problems = collect(
    ["name", rules.required(form.name, "the full name") ?? rules.maxLength(form.name, 100)],
    ["username", rules.required(form.username, "a username") ?? (/^[a-zA-Z0-9._-]{3,32}$/.test(form.username.trim()) ? undefined : "Use 3–32 letters, digits, '.', '_' or '-' (no spaces).")],
    ["phone", rules.phone(form.phone, 20)],
    ["email", rules.email(form.email)],
    ["roleId", creating || !isSelf ? rules.chosen(form.roleId, "a role") : undefined],
    ["warehouseIds", form.warehouseIds.length === 0 ? "Tick at least one warehouse." : undefined],
    ["password", !creating ? undefined : !form.password ? "Enter a password." : form.password.length < 8 ? "Use at least 8 characters." : form.password.length > 128 ? "Keep it to 128 characters or fewer." : undefined],
  );
  const shownErrors = { ...errors, ...(attempt ? problems : {}) };

  // A server error on a field disappears once the form is edited.
  useEffect(() => setErrors({}), [form]);

  async function submit() {
    setAttempt(true);
    setFormError(null);
    // The modal body is the scroll area that holds the summary.
    if (Object.keys(problems).length) return revealProblems(bodyRef.current?.parentElement);

    setSaving(true);
    setErrors({});
    const payload = {
      name: form.name.trim(),
      username: form.username.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      warehouseIds: form.warehouseIds,
      ...(creating || !isSelf ? { roleId: form.roleId } : {}),
    };
    try {
      const res = creating
        ? await api<{ data: UserDto }>("/users", { method: "POST", body: { ...payload, password: form.password } })
        : await api<{ data: UserDto }>(`/users/${user.id}`, { method: "PATCH", body: payload });
      onSaved(res.data, creating);
    } catch (err) {
      const fields = err instanceof ApiError ? err.fieldErrors() : {};
      setErrors(fields);
      // Field problems are marked on the fields; only say something general when there are none.
      setFormError(Object.keys(fields).length ? "Some details need fixing. The fields are marked in red below." : errorMessage(err));
      revealProblems(bodyRef.current?.parentElement);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open label={creating ? "New user" : "Edit user"} title={creating ? "Add user" : user.name} primaryText={creating ? "Create user" : "Save changes"} onClose={onClose} onSubmit={submit} submitting={saving}>
      {attempt ? <FormProblems problems={problems} labels={LABELS} /> : null}
      {formError ? (
        <Notification kind="error" title="Could not save" onClose={() => setFormError(null)}>
          {formError}
        </Notification>
      ) : null}
      <div ref={bodyRef} className={styles.formGrid}>
        <TextField label="Full name" value={form.name} onChange={set("name")} error={shownErrors.name} autoComplete="off" />
        <TextField
          label="Username"
          value={form.username}
          onChange={set("username")}
          error={shownErrors.username}
          mono
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="off"
          helper="3–32 letters, digits, '.', '_' or '-'. Not case-sensitive."
        />
        <TextField label="Phone (optional)" kind="phone" placeholder="e.g. 01711-000000" value={form.phone} onChange={set("phone")} error={shownErrors.phone} />
        <TextField label="Email (optional)" type="email" placeholder="name@company.com" value={form.email} onChange={set("email")} error={shownErrors.email} />
        <SelectField searchable
          label="Role"
          value={form.roleId}
          onChange={set("roleId")}
          error={shownErrors.roleId}
          disabled={isSelf}
          helper={isSelf ? "You cannot change your own role." : undefined}
          fieldClassName={styles.full}
        >
          <option value="">Choose a role</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </SelectField>
        <div className={styles.full}>
          <FieldGroup legend="Warehouse access" error={shownErrors.warehouseIds}>
            <div className={styles.checkboxes}>
              {warehouses.map((w) => (
                <Checkbox key={w.id} label={`${w.name} (${w.code})`} checked={form.warehouseIds.includes(w.id)} onChange={() => toggleWarehouse(w.id)} />
              ))}
            </div>
          </FieldGroup>
        </div>
        {creating ? (
          <TextField
            label="Password"
            type="password"
            value={form.password}
            onChange={set("password")}
            error={shownErrors.password}
            autoComplete="new-password"
            helper="At least 8 characters. Users cannot change their own password; only an Admin can set it."
            fieldClassName={styles.full}
          />
        ) : null}
      </div>
    </Modal>
  );
}
