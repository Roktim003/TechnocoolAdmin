"use client";

import { useState } from "react";
import { TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import type { UserDto } from "./types";

export function SetPasswordModal({ user, onClose, onSaved }: { user: UserDto; onClose: () => void; onSaved: (u: UserDto) => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const e: typeof errors = {};
    if (password.length < 8) e.password = "Password must be at least 8 characters.";
    if (confirm !== password) e.confirm = "Passwords do not match.";
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      const res = await api<{ data: UserDto }>(`/users/${user.id}/password`, { method: "POST", body: { password } });
      onSaved(res.data);
    } catch (err) {
      if (err instanceof ApiError) setErrors({ password: err.fieldErrors().password });
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open size="sm" label={`${user.name} · ${user.username}`} title="Set password" primaryText="Set password" onClose={onClose} onSubmit={submit} submitting={saving}>
      {user.isLocked ? (
        <Notification kind="info" title="Account is locked">
          Setting a new password unlocks it.
        </Notification>
      ) : null}
      {formError ? (
        <Notification kind="error" title="Could not set password">
          {formError}
        </Notification>
      ) : null}
      <TextField label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} autoComplete="new-password" helper="At least 8 characters." />
      <TextField label="Confirm password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} autoComplete="new-password" />
      <p>The user will be signed out of every device.</p>
    </Modal>
  );
}
