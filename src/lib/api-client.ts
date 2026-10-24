"use client";

/**
 * Browser client for /api/v1. Uses the HttpOnly auth cookies (same-origin), so the web UI
 * goes through exactly the same handlers, validation and RBAC as the mobile apps.
 * On a 401 it rotates the refresh token once and retries; if that fails it sends the user to /login.
 */

export interface ApiErrorDetail {
  path?: string;
  message: string;
  code?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiErrorDetail[] = [],
    readonly requestId?: string,
  ) {
    super(message);
  }

  /** Field-level messages keyed by path (e.g. { username: "Username is already taken." }). */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.details.filter((d) => d.path).map((d) => [d.path!, d.message]));
  }
}

export interface Page<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

let refreshing: Promise<boolean> | null = null;

/** Rotates the refresh cookie; concurrent callers share one request. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

function toLogin() {
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.assign(`/login?next=${next}&expired=1`);
}

async function request(path: string, init: RequestInit): Promise<Response> {
  return fetch(`/api/v1${path}`, {
    ...init,
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, string | number | undefined>; headers?: Record<string, string> } = {},
): Promise<T> {
  let url = path;
  if (options.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(options.query)) if (v !== undefined && v !== "") qs.set(k, String(v));
    if (qs.size) url += `?${qs}`;
  }
  const init: RequestInit = { method: options.method ?? "GET", body: options.body === undefined ? undefined : JSON.stringify(options.body), headers: options.headers };

  let res = await request(url, init);
  if (res.status === 401) {
    if (await refreshSession()) res = await request(url, init);
    if (res.status === 401) {
      toLogin();
      throw new ApiError(401, "UNAUTHENTICATED", "Your session has ended. Please log in again.");
    }
  }

  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body?.error;
    throw new ApiError(res.status, e?.code ?? "INTERNAL_ERROR", e?.message ?? `Request failed (${res.status}).`, e?.details ?? [], e?.requestId);
  }
  return body as T;
}

/** Downloads a file from the API (with the same refresh-and-retry as `api`) and saves it in the browser. */
export async function download(path: string, query: Record<string, string | number | undefined> = {}, fallbackName = "download"): Promise<void> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const url = `${path}${qs.size ? `?${qs}` : ""}`;
  let res = await request(url, { method: "GET" });
  if (res.status === 401 && (await refreshSession())) res = await request(url, { method: "GET" });
  if (res.status === 401) {
    toLogin();
    throw new ApiError(401, "UNAUTHENTICATED", "Your session has ended. Please log in again.");
  }
  if (!res.ok) {
    const e = (await res.json().catch(() => null))?.error;
    throw new ApiError(res.status, e?.code ?? "INTERNAL_ERROR", e?.message ?? `Download failed (${res.status}).`, e?.details ?? [], e?.requestId);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName;
  const href = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** Sends multipart form data (file uploads) with refresh-and-retry. */
export async function upload<T = unknown>(path: string, body: FormData): Promise<T> {
  const send = () => fetch(`/api/v1${path}`, { method: "POST", body, credentials: "same-origin", headers: { Accept: "application/json" } });
  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();
  if (res.status === 401) {
    toLogin();
    throw new ApiError(401, "UNAUTHENTICATED", "Your session has ended. Please log in again.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error;
    throw new ApiError(res.status, e?.code ?? "INTERNAL_ERROR", e?.message ?? `Upload failed (${res.status}).`, e?.details ?? [], e?.requestId);
  }
  return json as T;
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");
