"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authCookies } from "@/shared/auth/cookies";
import { AppError } from "@/shared/errors/app-error";
import { requestMeta } from "@/shared/http/route";
import { LoginSchema } from "../application/dto";
import { identity } from "./container";

export interface LoginFormState {
  error?: { code: string; message: string };
  fieldErrors?: Partial<Record<"username" | "password", string>>;
  username?: string;
}

/** Only same-site relative paths are allowed as post-login redirects. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/api") ? next : "/dashboard";
}

/**
 * Web login (server action — thin): validate → AuthService.login → set HttpOnly cookies.
 * Next.js checks the Origin of server-action POSTs, which covers CSRF here.
 */
export async function loginAction(_prev: LoginFormState, form: FormData): Promise<LoginFormState> {
  const username = String(form.get("username") ?? "");
  const parsed = LoginSchema.safeParse({ username, password: form.get("password"), client: "web" });
  if (!parsed.success) {
    const fieldErrors: LoginFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "username" || key === "password") fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors, username };
  }

  const meta = requestMeta(await headers());
  try {
    const session = await identity().auth.login(parsed.data, meta);
    const jar = await cookies();
    for (const c of authCookies(session)) jar.set(c.name, c.value, c.options);
  } catch (err) {
    if (err instanceof AppError) return { error: { code: err.code, message: err.message }, username };
    throw err;
  }
  redirect(safeNext(form.get("next")));
}
