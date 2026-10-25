import pino from "pino";
import { SENSITIVE_FIELDS } from "@/shared/rbac/sensitive-fields";

/** Keys whose values never reach the logs: credentials, tokens, cookies, headers, secrets. */
const SECRET_KEYS = [
  "password",
  "passwordHash",
  "newPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "authorization",
  "cookie",
  "cookies",
  "set-cookie",
  "secret",
  "apiKey",
  "signature",
  "JWT_ACCESS_SECRET",
  "REFRESH_TOKEN_SECRET",
  "SMTP_PASS",
  "SMTP_PASSWORD",
  "S3_SECRET_ACCESS_KEY",
  "BACKUP_S3_SECRET",
  "BACKUP_ENCRYPTION_KEY",
  "ADMIN_PASSWORD",
];

/** Secrets plus every cost / profit / margin field (logs are read by people without those flags). */
export const REDACTED_KEYS: ReadonlySet<string> = new Set(
  [...SECRET_KEYS, ...Object.values(SENSITIVE_FIELDS).flat()].map((k) => k.toLowerCase()),
);

const CENSOR = "[redacted]";

/** Deep copy of a log object with redacted keys replaced (bounded depth; errors kept as-is). */
export function scrub(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object" || depth > 6) return value;
  if (value instanceof Error || value instanceof Date || ArrayBuffer.isView(value)) return value;
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => scrub(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = REDACTED_KEYS.has(k.toLowerCase()) ? CENSOR : scrub(v, depth + 1);
  return out;
}

/**
 * Structured JSON logger. Pipe through `pino-pretty` in development for readable output.
 * Reads LOG_LEVEL directly so it can be used before/without full env validation.
 * Every line goes through `scrub`: passwords, tokens, cookies, Authorization headers, secrets and
 * cost fields are replaced with "[redacted]" at any depth.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  base: { service: process.env.SERVICE_NAME ?? "stockbook", version: process.env.APP_VERSION ?? process.env.npm_package_version, commit: process.env.GIT_COMMIT },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    log: (obj) => scrub(obj) as Record<string, unknown>,
  },
  redact: {
    // Belt and braces for the fast path (pino applies these before the formatter).
    paths: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']", "headers.authorization", "headers.cookie"],
    censor: CENSOR,
  },
});

export type Logger = pino.Logger;
