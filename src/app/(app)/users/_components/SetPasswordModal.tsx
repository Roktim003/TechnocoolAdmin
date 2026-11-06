"use client";

import { useEffect, useRef, useState } from "react";
import { TextField } from "@/components/ui/Field";
import { FormProblems } from "@/components/ui/FormProblems";
import { Modal } from "@/components/ui/Modal";
import { Notification } from "@/components/ui/Notification";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { collect, revealProblems } from "@/lib/validation";
import type { UserDto } from "./types";

const LABELS: Record<string, string> = { password: "New password", confirm: "Confirm password" };

export function SetPasswordModal({ user, onClose, onSaved }: { user: UserDto; onClose: () => void; onSaved: (u: UserDto) => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(false);
  const firstRef = useRef<HTMLDivElement>(null);

  // Same policy as the server: 8–128 characters; the confirmation must match.
  const problems = collect(
    ["password", !password ? "Enter a new password." : password.length < 8 ? "Use at least 8 characters." : password.length > 128 ? "Keep it to 128 characters or fewer." : undefined],
    ["confirm", !confirm ? "Type the password again." : confirm !== password ? "The passwords don't match." : undefined],
  );
  const shownErrors = { ...errors, ...(attempt ? problems : {}) };

  // A server error disappears once the password is edited.
  useEffect(() => setErrors({}), [password, confirm]);

  async function submit() {
    setAttempt(true);
    setFormError(null);
    if (Object.keys(problems).length) return revealProblems(firstRef.current?.parentElement);

    setSaving(true);
    setErrors({});
    try {
      const res = await api<{ data: UserDto }>(`/users/${user.id}/password`, { method: "POST", body: { password } });
      onSaved(res.data);
    } catch (err) {
      const fields = err instanceof ApiError ? err.fieldErrors() : {};
      setErrors(fields);
      setFormError(Object.keys(fields).length ? "The password needs fixing. See the message under it." : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open size="sm" label={`${user.name} · ${user.username}`} title="Set password" primaryText="Set password" onClose={onClose} onSubmit={submit} submitting={saving}>
      {attempt ? <FormProblems problems={problems} labels={LABELS} /> : null}
      {user.isLocked ? (
        <Notification kind="info" title="Account is locked">
          Setting a new password unlocks it.
        </Notification>
      ) : null}
      {formError ? (
        <Notification kind="error" title="Could not set password" onClose={() => setFormError(null)}>
          {formError}
        </Notification>
      ) : null}
      <div ref={firstRef} hidden />
      <TextField label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={shownErrors.password} autoComplete="new-password" helper="8–128 characters." />
      <TextField label="Confirm password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={shownErrors.confirm} autoComplete="new-password" />
      <p>The user will be signed out of every device.</p>
    </Modal>
  );
}
