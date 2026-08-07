import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";

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
