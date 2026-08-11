"use server";

import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, getCurrentSession } from "@/lib/dal/auth";
import { encryptNullable } from "@/lib/encryption";
import { checkRateLimit } from "@/lib/rate-limit";
import { dbForUser } from "@/db";
import { profiles } from "@/db/schema";

const profileSchema = z.object({
  fullName: z.string().min(1).max(200),
  phone: z.string().max(40).optional().or(z.literal("")),
  locationCity: z.string().max(100).optional().or(z.literal("")),
  locationState: z.string().max(100).optional().or(z.literal("")),
  locationCountry: z.string().max(100).optional().or(z.literal("")),
  workAuthorization: z.enum(["citizen", "green_card", "visa_sponsorship_required", "other"]),
  willingToRelocate: z.coerce.boolean(),
  remotePreference: z.enum(["remote", "hybrid", "onsite", "any"]),
  linkedin: z.string().url().optional().or(z.literal("")),
  github: z.string().url().optional().or(z.literal("")),
  portfolio: z.string().url().optional().or(z.literal("")),
  defaultAnswerMode: z.enum(["agent_drafts", "ask_me"]),
  eeoGender: z.string().max(100).optional().or(z.literal("")),
  eeoRace: z.string().max(100).optional().or(z.literal("")),
  eeoVeteranStatus: z.string().max(100).optional().or(z.literal("")),
  eeoDisabilityStatus: z.string().max(100).optional().or(z.literal("")),
});

export type ProfileActionState = { error: string | null; success?: boolean };

export async function saveProfile(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await requireUser();
  const session = await getCurrentSession();
  if (!session) {
    return { error: "Session expired — please sign in again." };
  }

  const { success } = await checkRateLimit("save-profile", user.id, 30, 60 * 60);
  if (!success) {
    return { error: "Too many updates — please try again later." };
  }

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { linkedin, github, portfolio, eeoGender, eeoRace, eeoVeteranStatus, eeoDisabilityStatus, ...rest } =
    parsed.data;

  // Voluntary EEO disclosures get application-level encryption before they
  // ever reach Neon (plan Section 7 — extra-sensitive fields). Only the web
  // app and the form-filler agent (which decrypts server-side to fill EEO
  // form fields) ever see plaintext.
  const encryptedEeo = {
    eeoGender: encryptNullable(eeoGender),
    eeoRace: encryptNullable(eeoRace),
    eeoVeteranStatus: encryptNullable(eeoVeteranStatus),
    eeoDisabilityStatus: encryptNullable(eeoDisabilityStatus),
  };

  const db = dbForUser(session.access_token);
  await db
    .insert(profiles)
    .values({
      id: user.id,
      ...rest,
      ...encryptedEeo,
      links: { linkedin, github, portfolio },
      onboardingCompleted: true,
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: {
        ...rest,
        ...encryptedEeo,
        links: { linkedin, github, portfolio },
        onboardingCompleted: true,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/profile");
  return { error: null, success: true };
}
