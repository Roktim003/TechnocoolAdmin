import { createSign } from "node:crypto";
import type { FcmServiceAccount } from "@/shared/config/env";
import type { PushMessage, PushResult, PushSender } from "../application/ports";

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const FCM_API = "https://fcm.googleapis.com";

interface Options {
  account: FcmServiceAccount | undefined;
  /** Tests point these at a fake. */
  fetch?: typeof fetch;
  apiBase?: string;
  now?: () => number;
  timeoutMs?: number;
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** RS256 JWT for Google's OAuth "JWT bearer" grant. */
function signedAssertion(a: FcmServiceAccount, nowSeconds: number): string {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: a.clientEmail, scope: SCOPE, aud: a.tokenUri, iat: nowSeconds, exp: nowSeconds + 3600 }));
  const signature = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(a.privateKey);
  return `${head}.${claims}.${b64url(signature)}`;
}

/** The FCM HTTP v1 message: a visible notification plus the data the app needs to open the right screen. */
export function fcmMessage(m: PushMessage) {
  return {
    token: m.token,
    notification: { title: m.title, body: m.body },
    data: m.data,
    android: { priority: "HIGH", notification: { sound: "default" } },
    apns: { headers: { "apns-priority": "10" }, payload: { aps: { sound: "default", ...(m.badge !== undefined ? { badge: m.badge } : {}) } } },
  };
}

interface FcmError {
  error?: { code?: number; status?: string; message?: string; details?: { errorCode?: string }[] };
}

/** Firebase Cloud Messaging over HTTP v1 with a service account. Without one it reports `configured: false`. */
export function fcmPushSender(opts: Options): PushSender {
  const account = opts.account;
  if (!account) return { configured: false, send: async () => ({ ok: false, error: "Push is not configured (FCM_SERVICE_ACCOUNT is empty).", invalidToken: false, retryable: false }) };
  const http = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const timeout = opts.timeoutMs ?? 15_000;
  const url = `${(opts.apiBase ?? FCM_API).replace(/\/$/, "")}/v1/projects/${encodeURIComponent(account.projectId)}/messages:send`;
  let cached: { token: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (cached && cached.expiresAt - 60_000 > now()) return cached.token;
    const res = await http(account!.tokenUri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signedAssertion(account!, Math.floor(now() / 1000)) }).toString(),
      signal: AbortSignal.timeout(timeout),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!res.ok || !body.access_token) {
      const err = new Error(`Google sign-in for FCM failed (HTTP ${res.status}${body.error ? `: ${body.error}${body.error_description ? ` — ${body.error_description}` : ""}` : ""}).`);
      (err as Error & { retryable?: boolean }).retryable = res.status >= 500 || res.status === 429;
      throw err;
    }
    cached = { token: body.access_token, expiresAt: now() + (body.expires_in ?? 3600) * 1000 };
    return cached.token;
  }

  return {
    configured: true,
    async send(m): Promise<PushResult> {
      let res: Response;
      try {
        res = await http(url, {
          method: "POST",
          headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
          body: JSON.stringify({ message: fcmMessage(m) }),
          signal: AbortSignal.timeout(timeout),
        });
      } catch (err) {
        // Network errors and timeouts: try again later. Bad credentials: retrying won't help.
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message, invalidToken: false, retryable: (err as { retryable?: boolean }).retryable ?? true };
      }
      if (res.ok) return { ok: true };

      const e = ((await res.json().catch(() => ({}))) as FcmError).error ?? {};
      const code = e.details?.find((x) => x.errorCode)?.errorCode ?? e.status ?? `HTTP_${res.status}`;
      const error = `FCM ${res.status} ${code}: ${e.message ?? res.statusText}`;
      if (res.status === 401) cached = null; // expired or revoked access token: sign in again on the retry
      const invalidToken = code === "UNREGISTERED" || code === "SENDER_ID_MISMATCH" || (code === "INVALID_ARGUMENT" && /registration token/i.test(e.message ?? ""));
      return { ok: false, error, invalidToken, retryable: !invalidToken && (res.status === 401 || res.status === 429 || res.status >= 500) };
    },
  };
}
