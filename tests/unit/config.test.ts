import { describe, expect, it } from "vitest";
import { optionalServices, parseEnv } from "@/shared/config/env";

/** A complete, valid production environment; each test breaks one thing. */
const good = (over: Record<string, string | undefined> = {}) => ({
  NODE_ENV: "production",
  APP_URL: "https://stock.example.com",
  DATABASE_URL: "postgresql://u:p@db:5432/stockbook",
  REDIS_URL: "redis://:pw@redis:6379",
  JWT_ACCESS_SECRET: "Qk3v9TzR1mXw8yP2nL5sD7fH0jK4gB6cV1aE9uI3oZ",
  REFRESH_TOKEN_SECRET: "Zr8Lm2Qx7Ts4Vb1Nc6Hd9Kf3Jg5Pw0Ya2Ue7Io4Rt",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "Long-enough-pass",
  S3_ENDPOINT: "https://s3.example.com",
  S3_BUCKET: "stockbook",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  ...over,
});

const problems = (src: Record<string, string | undefined>) => {
  try {
    parseEnv(src);
    return "";
  } catch (err) {
    return (err as Error).message;
  }
};

describe("configuration is validated at startup", () => {
  it("accepts a complete production configuration with every optional service empty", () => {
    const e = parseEnv(good({ SMTP_HOST: "", BACKUP_S3_BUCKET: "", SENTRY_DSN: "", CORS_ORIGINS: "" }));
    expect(e.SMTP_HOST).toBeUndefined();
    expect(optionalServices(e)).toEqual({ email: false, offsiteBackup: false, backupEncryption: false, errorTracking: false, cors: false });
  });

  it.each(["DATABASE_URL", "REDIS_URL", "JWT_ACCESS_SECRET", "REFRESH_TOKEN_SECRET", "APP_URL", "ADMIN_USERNAME", "ADMIN_PASSWORD"])("refuses to start without %s", (key) => {
    expect(problems(good({ [key]: undefined }))).toMatch(new RegExp(`${key}.*required`));
  });

  it("refuses a secret shorter than 32 bytes", () => {
    expect(problems(good({ JWT_ACCESS_SECRET: "x".repeat(31) }))).toContain("JWT_ACCESS_SECRET must be at least 32 bytes");
    expect(problems(good({ REFRESH_TOKEN_SECRET: "short" }))).toContain("REFRESH_TOKEN_SECRET must be at least 32 bytes");
    expect(problems(good({ JWT_ACCESS_SECRET: "x".repeat(32) }))).toBe("");
  });

  it("measures secrets in bytes, not characters", () => {
    // 16 Bengali letters = 48 bytes in UTF-8: long enough. 10 of them = 30 bytes: too short.
    expect(problems(good({ JWT_ACCESS_SECRET: "ক".repeat(16) }))).toBe("");
    expect(problems(good({ JWT_ACCESS_SECRET: "ক".repeat(10) }))).toContain("at least 32 bytes");
  });

  it("refuses example secrets, identical secrets and a low bcrypt cost in production", () => {
    expect(problems(good({ JWT_ACCESS_SECRET: "change-me-to-a-long-random-string-of-at-least-32-chars" }))).toContain("example value");
    expect(problems(good({ REFRESH_TOKEN_SECRET: good().JWT_ACCESS_SECRET }))).toContain("must differ");
    expect(problems(good({ BCRYPT_ROUNDS: "10" }))).toContain("BCRYPT_ROUNDS must be at least 12");
    // Development and tests may use weaker values.
    expect(problems(good({ NODE_ENV: "test", JWT_ACCESS_SECRET: "change-me-to-a-long-random-string-of-at-least-32-chars", BCRYPT_ROUNDS: "4" }))).toBe("");
  });

  it("refuses a short admin password and a malformed APP_URL", () => {
    expect(problems(good({ ADMIN_PASSWORD: "short1234" }))).toContain("ADMIN_PASSWORD must be at least 10 characters");
    expect(problems(good({ APP_URL: "stock.example.com" }))).toContain("APP_URL");
  });

  it("needs all four off-site backup settings, or none", () => {
    expect(problems(good({ BACKUP_S3_BUCKET: "backups" }))).toContain("Off-site backup needs all of");
    const e = parseEnv(good({ BACKUP_S3_ENDPOINT: "https://b.example.com", BACKUP_S3_BUCKET: "b", BACKUP_S3_KEY: "k", BACKUP_S3_SECRET: "s" }));
    expect(optionalServices(e).offsiteBackup).toBe(true);
  });

  it("requires a 32-byte backup encryption key when one is given", () => {
    expect(problems(good({ BACKUP_ENCRYPTION_KEY: "too-short" }))).toContain("BACKUP_ENCRYPTION_KEY must be at least 32 bytes");
    expect(optionalServices(parseEnv(good({ BACKUP_ENCRYPTION_KEY: "k".repeat(40) }))).backupEncryption).toBe(true);
  });

  it("reports which optional services are set", () => {
    const e = parseEnv(good({ SMTP_HOST: "smtp.example.com", SMTP_PASS: "pw", SENTRY_DSN: "https://key@o1.ingest.example.com/1", CORS_ORIGINS: "https://partner.example.com" }));
    expect(optionalServices(e)).toMatchObject({ email: true, errorTracking: true, cors: true, offsiteBackup: false });
    expect(e.CORS_ORIGINS).toEqual(["https://partner.example.com"]);
  });

  it("lists every problem at once", () => {
    const msg = problems(good({ DATABASE_URL: undefined, JWT_ACCESS_SECRET: "short" }));
    expect(msg).toContain("DATABASE_URL");
    expect(msg).toContain("JWT_ACCESS_SECRET");
  });
});
