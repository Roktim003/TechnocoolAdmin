"use client";

import { useState, type ChangeEvent } from "react";
import { Checkbox, FieldGroup, SelectField, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import type { RoleDto, UserDto, WarehouseDto } from "./types";
import styles from "./users.module.css";

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

  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const toggleWarehouse = (id: string) =>
    setForm((f) => ({ ...f, warehouseIds: f.warehouseIds.includes(id) ? f.warehouseIds.filter((w) => w !== id) : [...f.warehouseIds, id] }));

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required.";
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(form.username.trim())) e.username = "3–32 characters: letters, digits, '.', '_' or '-'.";
    if (!form.roleId) e.roleId = "Select a role.";
    if (form.warehouseIds.length === 0) e.warehouseIds = "Select at least one warehouse.";
    if (creating && form.password.length < 8) e.password = "Password must be at least 8 characters.";
    return e;
  }

  async function submit() {
    const e = validate();
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;

    setSaving(true);
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
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors());
        setFormError(err.message);
      } else setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open label={creating ? "New user" : "Edit user"} title={creating ? "Add user" : user.name} primaryText={creating ? "Create user" : "Save changes"} onClose={onClose} onSubmit={submit} submitting={saving}>
      {formError ? (
        <Notification kind="error" title="Could not save">
          {formError}
        </Notification>
      ) : null}
      <div className={styles.formGrid}>
        <TextField label="Full name" value={form.name} onChange={set("name")} error={errors.name} autoComplete="off" />
        <TextField
          label="Username"
          value={form.username}
          onChange={set("username")}
          error={errors.username}
          mono
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="off"
          helper="Not case-sensitive."
        />
        <TextField label="Phone (optional)" type="tel" value={form.phone} onChange={set("phone")} error={errors.phone} />
        <TextField label="Email (optional)" type="email" value={form.email} onChange={set("email")} error={errors.email} />
        <SelectField
          label="Role"
          value={form.roleId}
          onChange={set("roleId")}
          error={errors.roleId}
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
          <FieldGroup legend="Warehouse access" error={errors.warehouseIds}>
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
            error={errors.password}
            autoComplete="new-password"
            helper="At least 8 characters. Users cannot change their own password; only an Admin can set it."
            fieldClassName={styles.full}
          />
        ) : null}
      </div>
    </Modal>
  );
}
