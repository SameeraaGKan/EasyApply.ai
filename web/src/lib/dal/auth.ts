import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Data Access Layer entry point for identity. Re-verifies the session with
 * Supabase on every call (via `auth.getUser()`, which round-trips to
 * Supabase rather than trusting an unverified cookie) and is request-scoped
 * cached so multiple calls within one render only pay for one round trip.
 *
 * Every Server Action / Route Handler that touches user-owned data must call
 * this (or `requireUser`) itself — a page-level check does not protect
 * actions defined within it.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** Same as `getCurrentUser`, but also returns the verified access token —
 * needed anywhere we must pass the caller's identity to Neon (for
 * RLS-scoped queries via `dbForUser`) or to the Python agent service. */
export const getCurrentSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
});

/** Throws via redirect if there is no authenticated user. Use in
 * Server Components/Actions/Route Handlers that require a signed-in user. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
