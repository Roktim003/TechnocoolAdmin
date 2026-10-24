"use client";

import { useActionState } from "react";
import { loginAction, type LoginFormState } from "@/modules/identity/interface/actions";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Notification } from "@/components/ui/Notification";
import styles from "./login.module.css";

const TITLES: Record<string, string> = {
  INVALID_CREDENTIALS: "Wrong username or password",
  ACCOUNT_LOCKED: "Account locked",
  ACCOUNT_DISABLED: "Account disabled",
  RATE_LIMITED: "Too many attempts",
};

export function LoginForm({ next, expired }: { next: string; expired: boolean }) {
  const [state, action, pending] = useActionState<LoginFormState, FormData>(loginAction, {});

  return (
    <form action={action} className={styles.form} noValidate>
      {state.error ? (
        <Notification kind="error" title={TITLES[state.error.code] ?? "Login failed"}>
          {state.error.message}
        </Notification>
      ) : expired ? (
        <Notification kind="info" title="Session ended">
          Please log in again.
        </Notification>
      ) : null}
      <input type="hidden" name="next" value={next} />
      <TextField
        label="Username"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        defaultValue={state.username}
        error={state.fieldErrors?.username}
        autoFocus
        required
      />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" error={state.fieldErrors?.password} required />
      <Button type="submit" className={styles.submit} disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
        <span aria-hidden="true">→</span>
      </Button>
    </form>
  );
}
