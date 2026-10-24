import pino from "pino";

/**
 * Structured JSON logger. Pipe through `pino-pretty` in development for readable output.
 * Reads LOG_LEVEL directly so it can be used before/without full env validation.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  base: { service: process.env.SERVICE_NAME ?? "stockbook" },
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
