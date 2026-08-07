"use server";

import "server-only";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser, getCurrentSession } from "@/lib/dal/auth";
import { dbForUser } from "@/db";
import { parsedResumeData, resumes } from "@/db/schema";

const skillSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  yearsExperience: z.coerce.number().optional(),
});

const experienceSchema = z.object({
  company: z.string().min(1),
  title: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  description: z.string().optional(),
});

const educationSchema = z.object({
  institution: z.string().min(1),
  degree: z.string().optional(),
  field: z.string().optional(),
  graduationDate: z.string().optional(),
});

const updateSchema = z.object({
  resumeId: z.uuid(),
  totalYearsExperience: z.coerce.number().optional(),
  seniorityLevel: z.enum(["entry", "mid", "senior", "staff", "principal", "exec"]).optional(),
  skills: z.string().transform((s, ctx) => tryParseJson(s, z.array(skillSchema), ctx)),
  workExperience: z.string().transform((s, ctx) => tryParseJson(s, z.array(experienceSchema), ctx)),
  education: z.string().transform((s, ctx) => tryParseJson(s, z.array(educationSchema), ctx)),
});

function tryParseJson<T extends z.ZodTypeAny>(raw: string, schema: T, ctx: z.RefinementCtx) {
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: "Invalid structured data." });
      return z.NEVER;
    }
    return parsed.data as z.infer<T>;
  } catch {
    ctx.addIssue({ code: "custom", message: "Invalid JSON." });
    return z.NEVER;
  }
}

export type EditActionState = { error: string | null; success?: boolean };

export async function updateParsedResumeData(
  _prevState: EditActionState,
  formData: FormData,
): Promise<EditActionState> {
  const user = await requireUser();
  const session = await getCurrentSession();
  if (!session) {
    return { error: "Session expired — please sign in again." };
  }

  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { resumeId, ...rest } = parsed.data;

  const db = dbForUser(session.access_token);

  // Ownership check — belt-and-suspenders alongside Neon RLS.
  const [owned] = await db
    .select({ id: resumes.id })
    .from(resumes)
    .where(and(eq(resumes.id, resumeId), eq(resumes.userId, user.id)))
    .limit(1);
  if (!owned) {
    return { error: "Resume not found." };
  }

  await db
    .update(parsedResumeData)
    .set({
      skills: rest.skills,
      workExperience: rest.workExperience,
      education: rest.education,
      totalYearsExperience:
        rest.totalYearsExperience !== undefined ? String(rest.totalYearsExperience) : undefined,
      seniorityLevel: rest.seniorityLevel,
    })
    .where(eq(parsedResumeData.resumeId, resumeId));

  revalidatePath(`/resume/${resumeId}`);
  return { error: null, success: true };
}
