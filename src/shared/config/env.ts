import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const csv = z
  .string()
  .optional()
  .transform((v) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean));

/** An optional value: empty strings count as "not set yet". */
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const int = (def: number, min = 0, max = Number.MAX_SAFE_INTEGER) => z.coerce.number().int().min(min).max(max).default(def);

/** Placeholder values from .env.example / docker-compose that must never reach production. */
const PLACEHOLDER = /change-?me|local-dev|example|placeholder/i;

/** Secrets are measured in bytes (UTF-8), not characters. */
const secret = (name: string) =>
  z
    .string({ required_error: `${name} is required` })
    .refine((v) => Buffer.byteLength(v, "utf8") >= 32, `${name} must be at least 32 bytes long`);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    /* ── required ── */
    APP_URL: z.string({ required_error: "APP_URL is required" }).url(),
    DATABASE_URL: z.string({ required_error: "DATABASE_URL is required" }).min(1, "DATABASE_URL is required"),
    REDIS_URL: z.string({ required_error: "REDIS_URL is required" }).min(1, "REDIS_URL is required"),
    JWT_ACCESS_SECRET: secret("JWT_ACCESS_SECRET"),
    REFRESH_TOKEN_SECRET: secret("REFRESH_TOKEN_SECRET"),
    ADMIN_USERNAME: z.string({ required_error: "ADMIN_USERNAME is required" }).min(3, "ADMIN_USERNAME is required"),
    ADMIN_PASSWORD: z.string({ required_error: "ADMIN_PASSWORD is required" }).min(10, "ADMIN_PASSWORD must be at least 10 characters"),
    ADMIN_NAME: z.string().default("System Administrator"),

    /* ── web / proxy ── */
    TRUSTED_ORIGINS: csv,
    /** Browser origins allowed to call the API cross-origin (CORS). Empty = closed. Mobile apps don't need it. */
    CORS_ORIGINS: csv,
    TRUST_PROXY: bool,
    REDIS_KEY_PREFIX: z.string().default("sb:"),
    /** Prisma connections per process (web and worker each get their own pool). Empty = Prisma default. */
    DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).optional(),

    /* ── sessions ── */
    JWT_ISSUER: z.string().default("stockbook"),
    ACCESS_TOKEN_TTL_SECONDS: int(900, 60),
    REFRESH_TOKEN_TTL_DAYS: int(30, 1),
    /** Web sessions end after this many minutes without a request (0 = never). Mobile apps are exempt. */
    SESSION_IDLE_TIMEOUT_MINUTES: int(30, 0, 24 * 60),
    COOKIE_SECURE: bool,
    COOKIE_DOMAIN: optional,
    LOGIN_MAX_FAILURES: int(5, 1),
    LOGIN_FAILURE_WINDOW_SECONDS: int(900, 1),
    BCRYPT_ROUNDS: int(12, 4, 15),

    /* ── rate limits and request size ── */
    RATE_LIMIT_API_PER_MINUTE: int(300, 1),
    RATE_LIMIT_EXPORTS_PER_MINUTE: int(10, 1),
    RATE_LIMIT_REFRESH_PER_MINUTE: int(30, 1),
    MAX_JSON_BODY_KB: int(1024, 16),
    MAX_UPLOAD_MB: int(25, 1, 200),

    /* ── object storage (attachments, photos, exports) ── */
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

    /* ── logging, monitoring ── */
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    SENTRY_DSN: optional,
    SENTRY_ENVIRONMENT: optional,
    APP_VERSION: z.string().default(process.env.npm_package_version ?? "0.0.0"),
    GIT_COMMIT: z.string().default("unknown"),
    FAILED_JOBS_ALERT_THRESHOLD: int(10, 1),
    SHUTDOWN_TIMEOUT_MS: int(25_000, 1000, 120_000),

    /* ── email (optional: without SMTP_HOST emails are logged as NOT_SENT_SMTP_MISSING) ── */
    SMTP_HOST: optional,
    SMTP_PORT: int(587, 1, 65535),
    /** true for port 465 (implicit TLS); false uses STARTTLS when the server offers it. */
    SMTP_SECURE: bool,
    SMTP_USER: optional,
    /** SMTP_PASSWORD is the old name (Module 3); SMTP_PASS wins when both are set. */
    SMTP_PASS: optional,
    SMTP_PASSWORD: optional,
    SMTP_FROM: z.string().default("StockBook <no-reply@stockbook.local>"),
    /** First retry delay for failed emails (doubles each attempt). */
    EMAIL_RETRY_DELAY_MS: int(30_000),
    EMAIL_MAX_ATTEMPTS: int(5, 1, 10),

    /* ── backups (off-site storage optional: without it dumps stay in BACKUP_DIR only) ── */
    BACKUP_DIR: z.string().default("/backups"),
    BACKUP_ENCRYPTION_KEY: optional,
    BACKUP_S3_ENDPOINT: optional,
    BACKUP_S3_REGION: z.string().default("us-east-1"),
    BACKUP_S3_BUCKET: optional,
    BACKUP_S3_KEY: optional,
    BACKUP_S3_SECRET: optional,
    BACKUP_S3_PREFIX: z.string().default("stockbook"),
    BACKUP_S3_FORCE_PATH_STYLE: z
      .string()
      .optional()
      .transform((v) => v !== "false"),
    BACKUP_KEEP_DAILY: int(14, 1),
    BACKUP_KEEP_WEEKLY: int(8, 0),
    BACKUP_KEEP_MONTHLY: int(12, 0),

    /* ── worker resources ── */
    /** Queues this worker process consumes: "*" = all, "!name" excludes one, e.g. "*,!backups". */
    WORKER_QUEUES: z.string().default("*"),
    PDF_CONCURRENCY: int(1, 1, 8),
    /** Chromium is restarted after this many PDFs (keeps its memory in check). */
    PDF_BROWSER_RESTART_AFTER: int(50, 1),
    PDF_BROWSER_PATH: optional,
    REPORT_QUERY_TIMEOUT_MS: int(30_000, 1000),
    COMPANY_NAME: z.string().default("StockBook"),
  })
  .superRefine((e, ctx) => {
    if (e.NODE_ENV !== "production") return;
    for (const key of ["JWT_ACCESS_SECRET", "REFRESH_TOKEN_SECRET"] as const) {
      if (PLACEHOLDER.test(e[key])) ctx.addIssue({ code: "custom", path: [key], message: `${key} still has the example value; generate a random secret` });
    }
    if (e.JWT_ACCESS_SECRET === e.REFRESH_TOKEN_SECRET) ctx.addIssue({ code: "custom", path: ["REFRESH_TOKEN_SECRET"], message: "REFRESH_TOKEN_SECRET must differ from JWT_ACCESS_SECRET" });
    if (e.BCRYPT_ROUNDS < 12) ctx.addIssue({ code: "custom", path: ["BCRYPT_ROUNDS"], message: "BCRYPT_ROUNDS must be at least 12 in production" });
    if (e.BACKUP_ENCRYPTION_KEY && Buffer.byteLength(e.BACKUP_ENCRYPTION_KEY, "utf8") < 32) {
      ctx.addIssue({ code: "custom", path: ["BACKUP_ENCRYPTION_KEY"], message: "BACKUP_ENCRYPTION_KEY must be at least 32 bytes long" });
    }
    const s3 = [e.BACKUP_S3_ENDPOINT, e.BACKUP_S3_BUCKET, e.BACKUP_S3_KEY, e.BACKUP_S3_SECRET];
    if (s3.some(Boolean) && !s3.every(Boolean)) {
      ctx.addIssue({ code: "custom", path: ["BACKUP_S3_BUCKET"], message: "Off-site backup needs all of BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_KEY and BACKUP_S3_SECRET (or none of them)" });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/** Parses an environment object; throws one readable error listing every problem. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

let cached: Env | undefined;

/** Validated environment. Parsed lazily so build steps that never touch config don't need every variable. */
export function env(): Env {
  return (cached ??= parseEnv(process.env));
}

/** Tests only: forget the parsed environment after changing process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}

/** Which optional services are configured ("not set yet" otherwise). */
export function optionalServices(e: Env = env()) {
  return {
    email: !!e.SMTP_HOST,
    offsiteBackup: !!(e.BACKUP_S3_ENDPOINT && e.BACKUP_S3_BUCKET && e.BACKUP_S3_KEY && e.BACKUP_S3_SECRET),
    backupEncryption: !!e.BACKUP_ENCRYPTION_KEY,
    errorTracking: !!e.SENTRY_DSN,
    cors: e.CORS_ORIGINS.length > 0,
  };
}

export { APP_TIMEZONE, APP_CURRENCY } from "./constants";
