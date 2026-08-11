import type { Instrumentation } from "next";

/**
 * Server-side error tracking (plan Section 7 — observability). Sentry's SDK
 * no-ops safely when `dsn` is unset (verified locally), so this is a no-op
 * in any environment that hasn't configured SENTRY_DSN — nothing to set up
 * for local dev, but wire it up before public launch.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      // PII (resume content, EEO fields, application answers) must never
      // reach Sentry — this app handles sensitive data end to end, so
      // request bodies/headers are not sent by default and should stay
      // that way even if this config changes later.
      sendDefaultPii: false,
    });
  }
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(err, request, context);
};
