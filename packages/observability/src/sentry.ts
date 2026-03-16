import * as Sentry from "@sentry/node";

interface SentryInitOptions {
  dsn?: string;
  environment?: string;
  release?: string;
  /** Transaction sample rate 0–1. Default: 0.1 in production, 1.0 otherwise. */
  tracesSampleRate?: number;
}

/**
 * Initialize Sentry for Node.js services (api, worker).
 * No-ops gracefully when SENTRY_DSN is not set (local dev).
 */
export function initSentry(opts: SentryInitOptions = {}): void {
  const dsn = opts.dsn ?? process.env.SENTRY_DSN;
  if (!dsn) return; // disabled locally

  const environment = opts.environment ?? process.env.NODE_ENV ?? "development";
  const release = opts.release ?? process.env.SENTRY_RELEASE;
  const isProd = environment === "production";

  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate: opts.tracesSampleRate ?? (isProd ? 0.1 : 1.0),
    // Never send raw log content — too much risk of leaking secrets/PII
    beforeSend(event) {
      // Strip any stack frame vars that might contain secrets
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          if (ex.stacktrace?.frames) {
            for (const frame of ex.stacktrace.frames) {
              frame.vars = undefined;
            }
          }
        }
      }
      return event;
    },
  });
}

export { Sentry };
