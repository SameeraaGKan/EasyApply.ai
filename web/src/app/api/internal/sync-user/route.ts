import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Receives Supabase's Database Webhook on `auth.users` INSERT and mirrors
 * the new identity into Neon's `users` table — every other table's
 * `user_id` FK points at that local row, so this sync is a hard dependency
 * (see plan Section 1 / Phase 0). Configure this as a Database Webhook in
 * the Supabase dashboard: Database > Webhooks > new webhook on
 * `auth.users`, event `INSERT`, HTTP header `x-webhook-secret` set to the
 * same value as `SUPABASE_WEBHOOK_SECRET` below.
 *
 * Upserts on `id` so retried webhook deliveries stay idempotent.
 *
 * CSRF doesn't apply here the way it does to the app's Server Actions
 * (which Next.js protects automatically via Origin/Host comparison — see
 * next.config.ts): this route isn't cookie/session-authenticated, so
 * there's no ambient browser credential for a forged cross-site request to
 * ride on. The shared secret below is the actual access control.
 */

const payloadSchema = z.object({
  type: z.literal("INSERT"),
  table: z.literal("users"),
  schema: z.literal("auth"),
  record: z.object({
    id: z.uuid(),
    email: z.email(),
  }),
});

export async function POST(request: NextRequest) {
  // Defense-in-depth against hammering this endpoint — the shared-secret
  // check below already blocks unauthorized writes, but an unbounded
  // request rate is still a minor DoS/compute-waste vector on a public URL.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const { success } = await checkRateLimit("sync-user-webhook", ip, 20, 60);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const secret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }
  if (request.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json();
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { id, email } = parsed.data.record;

  await db
    .insert(users)
    .values({ id, email })
    .onConflictDoUpdate({ target: users.id, set: { email } });

  return NextResponse.json({ ok: true });
}
