import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase browser client for use in Client Components (sign-in/sign-up
 * forms, etc.). Never import this from server-only code.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
