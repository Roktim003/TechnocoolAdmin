import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const csv = z
  .string()
  .optional()
  .transform((v) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean));

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().url(),
  TRUSTED_ORIGINS: csv,
  TRUST_PROXY: bool,
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  REDIS_KEY_PREFIX: z.string().default("sb:"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  REFRESH_TOKEN_SECRET: z.string().min(32, "REFRESH_TOKEN_SECRET must be at least 32 characters"),
  JWT_ISSUER: z.string().default("stockbook"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: bool,
  COOKIE_DOMAIN: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  LOGIN_FAILURE_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  // S3-compatible object storage (MinIO in dev, e.g. Contabo Object Storage in production).
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
  S3_AUTO_CREATE_BUCKET: bool,
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // Email (SMTP). Without SMTP_HOST, emails are logged as SKIPPED and only in-app notifications work.
  SMTP_HOST: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  /** true for port 465 (implicit TLS); false uses STARTTLS when the server offers it. */
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default("TechnoCool Inventory <no-reply@stockbook.local>"),
  /** First retry delay for failed emails (doubles each attempt). */
  EMAIL_RETRY_DELAY_MS: z.coerce.number().int().nonnegative().default(30_000),
  EMAIL_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  // Push notifications (Firebase Cloud Messaging) for the mobile app. Without it, push is off.
  FCM_SERVICE_ACCOUNT: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v?.trim()) return undefined;
      const account = parseServiceAccount(v.trim());
      if (!account) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "must be a Firebase service-account JSON (or its base64) with project_id, client_email and private_key" });
      return account ?? undefined;
    }),
});

export interface FcmServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
}

/** The service-account key file from the Firebase console, pasted as JSON or base64-encoded. */
export function parseServiceAccount(raw: string): FcmServiceAccount | null {
  try {
    const json = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")) as Record<string, unknown>;
    const str = (k: string) => (typeof json[k] === "string" && json[k] ? (json[k] as string) : null);
    const projectId = str("project_id");
    const clientEmail = str("client_email");
    const privateKey = str("private_key")?.replace(/\\n/g, "\n");
    if (!projectId || !clientEmail || !privateKey?.includes("PRIVATE KEY")) return null;
    return { projectId, clientEmail, privateKey, tokenUri: str("token_uri") ?? "https://oauth2.googleapis.com/token" };
  } catch {
    return null;
  }
}

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Validated environment. Parsed lazily so build steps that never touch config don't need every variable. */
export function env(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export { APP_TIMEZONE, APP_CURRENCY } from "./constants";
