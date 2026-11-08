import pino from "pino";

const LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];

/** LOG_LEVEL, or the default when it is unset, empty or unknown (e.g. Coolify passes "" during the image build). */
function logLevel(): string {
  const fromEnv = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (fromEnv && LEVELS.includes(fromEnv)) return fromEnv;
  return process.env.NODE_ENV === "test" ? "silent" : "info";
}

/**
 * Structured JSON logger. Pipe through `pino-pretty` in development for readable output.
 * Reads LOG_LEVEL directly so it can be used before/without full env validation.
 */
export const logger = pino({
  level: logLevel(),
  base: { service: process.env.SERVICE_NAME || "stockbook" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "password",
      "*.password",
      "passwordHash",
      "*.passwordHash",
      "refreshToken",
      "*.refreshToken",
      "accessToken",
      "*.accessToken",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[redacted]",
  },
});

export type Logger = pino.Logger;
