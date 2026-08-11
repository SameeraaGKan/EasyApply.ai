import * as Sentry from "@sentry/nextjs";

// Client-side error tracking (plan Section 7). The DSN is meant to be
// public (Sentry's ingest endpoint has its own abuse controls, unlike a
// typical API secret) but this app never sends resume/EEO/answer content
// to the client in the first place, so there's nothing sensitive for a
// captured browser error to leak here either way. No-ops when unset.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
