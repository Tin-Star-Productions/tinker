import pino from "pino";

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug");

/**
 * Structured JSON logger using pino.
 * In production: JSON output — consumed by Fly.io log shipping → Betterstack.
 * In development: pretty-printed output.
 */
export const logger = pino({
  level,
  // Pretty-print in development only
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  // Never log raw CI log content
  redact: {
    paths: ["*.rawLog", "*.logContent", "*.authorization", "*.cookie"],
    censor: "[redacted]",
  },
  base: {
    service: process.env.SERVICE_NAME ?? "tinker",
    env: process.env.NODE_ENV ?? "development",
  },
});

export type Logger = typeof logger;
