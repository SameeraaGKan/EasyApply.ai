import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  numeric,
  jsonb,
  timestamp,
  vector,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * Embedding dimensionality is pinned to Voyage AI's voyage-3-lite (1024-dim).
 * If the embedding model changes, this constant (and any existing embedding
 * columns/indexes) must be migrated together.
 */
export const EMBEDDING_DIM = 1024;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const workAuthorizationEnum = pgEnum("work_authorization", [
  "citizen",
  "green_card",
  "visa_sponsorship_required",
  "other",
]);

export const remotePreferenceEnum = pgEnum("remote_preference", [
  "remote",
  "hybrid",
  "onsite",
  "any",
]);

export const answerModeEnum = pgEnum("answer_mode", ["agent_drafts", "ask_me"]);

export const fileTypeEnum = pgEnum("file_type", ["pdf", "docx"]);

export const parseStatusEnum = pgEnum("parse_status", [
  "pending",
  "processing",
  "complete",
  "failed",
]);

export const seniorityLevelEnum = pgEnum("seniority_level", [
  "entry",
  "mid",
  "senior",
  "staff",
  "principal",
  "exec",
]);

export const jobSourceEnum = pgEnum("job_source", [
  "greenhouse",
  "lever",
  "ashby",
  "adzuna",
  "manual_paste",
  "manual_url",
]);

export const employmentTypeEnum = pgEnum("employment_type", [
  "full_time",
  "part_time",
  "contract",
  "intern",
]);

export const matchStatusEnum = pgEnum("match_status", [
  "suggested",
  "shortlisted",
  "dismissed",
  "applied",
]);

export const applicationStatusEnum = pgEnum("application_status", [
  "draft",
  "form_filled_pending_review",
  "submitted_by_user",
  "rejected",
  "interviewing",
  "offer",
  "withdrawn",
]);

export const questionTypeEnum = pgEnum("question_type", [
  "short_text",
  "long_text",
  "multiple_choice",
  "yes_no",
  "file_upload",
]);

export const answeredByEnum = pgEnum("answered_by", ["agent", "user"]);

export const agentTypeEnum = pgEnum("agent_type", [
  "resume_parser",
  "matcher",
  "question_drafter",
  "form_filler",
]);

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "running",
  "succeeded",
  "failed",
  "partial",
]);

// ---------------------------------------------------------------------------
// users — Neon-side mirror of the Supabase Auth identity.
// id MUST equal the Supabase auth.users.id UUID for a given account, kept in
// sync via the /api/internal/sync-user webhook. This is NOT a live
// cross-database foreign key (Postgres can't FK across providers) — every
// other user-owned table FKs to THIS local table, not to Supabase.
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// profiles
// ---------------------------------------------------------------------------

export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  fullName: text("full_name"),
  phone: text("phone"),
  locationCity: text("location_city"),
  locationState: text("location_state"),
  locationCountry: text("location_country"),
  workAuthorization: workAuthorizationEnum("work_authorization"),
  willingToRelocate: boolean("willing_to_relocate").notNull().default(false),
  remotePreference: remotePreferenceEnum("remote_preference"),
  links: jsonb("links").$type<{
    linkedin?: string;
    github?: string;
    portfolio?: string;
    other?: string;
  }>(),
  // Sensitive EEO fields — candidates for application-level column encryption
  // before this table is used with real user data (see Security plan).
  eeoGender: text("eeo_gender"),
  eeoRace: text("eeo_race"),
  eeoVeteranStatus: text("eeo_veteran_status"),
  eeoDisabilityStatus: text("eeo_disability_status"),
  defaultAnswerMode: answerModeEnum("default_answer_mode").notNull().default("agent_drafts"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// resumes
// ---------------------------------------------------------------------------

export const resumes = pgTable(
  "resumes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    originalFilename: text("original_filename").notNull(),
    fileType: fileTypeEnum("file_type").notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    parseStatus: parseStatusEnum("parse_status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("resumes_user_id_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// parsed_resume_data
// ---------------------------------------------------------------------------

export const parsedResumeData = pgTable(
  "parsed_resume_data",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resumeId: uuid("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rawText: text("raw_text"),
    skills: jsonb("skills").$type<
      { name: string; category?: string; yearsExperience?: number }[]
    >(),
    workExperience: jsonb("work_experience").$type<
      {
        company: string;
        title: string;
        startDate?: string;
        endDate?: string;
        description?: string;
        bulletPoints?: string[];
      }[]
    >(),
    education: jsonb("education").$type<
      { institution: string; degree?: string; field?: string; graduationDate?: string }[]
    >(),
    certifications: jsonb("certifications").$type<string[]>(),
    projects: jsonb("projects").$type<{ name: string; description?: string }[]>(),
    totalYearsExperience: numeric("total_years_experience"),
    seniorityLevel: seniorityLevelEnum("seniority_level"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIM }),
    parsedByModel: text("parsed_by_model"),
    parseConfidence: numeric("parse_confidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("parsed_resume_data_user_id_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// job_postings — shared, not user-owned (no user_id).
// ---------------------------------------------------------------------------

export const jobPostings = pgTable(
  "job_postings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: jobSourceEnum("source").notNull(),
    sourceId: text("source_id"),
    companyName: text("company_name").notNull(),
    title: text("title").notNull(),
    descriptionRaw: text("description_raw").notNull(),
    descriptionUrl: text("description_url"),
    locationText: text("location_text"),
    locationCity: text("location_city"),
    locationState: text("location_state"),
    locationCountry: text("location_country"),
    isRemote: boolean("is_remote").notNull().default(false),
    employmentType: employmentTypeEnum("employment_type"),
    seniorityLevel: seniorityLevelEnum("seniority_level"),
    salaryMin: numeric("salary_min"),
    salaryMax: numeric("salary_max"),
    salaryCurrency: varchar("salary_currency", { length: 3 }),
    extractedSkills: jsonb("extracted_skills").$type<
      { name: string; required: boolean }[]
    >(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIM }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    isStale: boolean("is_stale").notNull().default(false),
  },
  (t) => [uniqueIndex("job_postings_source_source_id_idx").on(t.source, t.sourceId)],
);

// ---------------------------------------------------------------------------
// matches
// ---------------------------------------------------------------------------

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobPostingId: uuid("job_posting_id")
      .notNull()
      .references(() => jobPostings.id, { onDelete: "cascade" }),
    resumeId: uuid("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    overallScore: numeric("overall_score").notNull(),
    scoreBreakdown: jsonb("score_breakdown").$type<{
      semanticSimilarity: number;
      skillOverlapPct: number;
      experienceFit: number;
      locationFit: number;
      recency: number;
    }>(),
    matchRationale: text("match_rationale"),
    status: matchStatusEnum("status").notNull().default("suggested"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("matches_user_id_job_posting_id_idx").on(t.userId, t.jobPostingId),
    index("matches_user_id_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// applications
// ---------------------------------------------------------------------------

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobPostingId: uuid("job_posting_id").references(() => jobPostings.id, {
      onDelete: "set null",
    }),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
    companyName: text("company_name").notNull(),
    roleTitle: text("role_title").notNull(),
    status: applicationStatusEnum("status").notNull().default("draft"),
    applicationUrl: text("application_url"),
    resumeId: uuid("resume_id").references(() => resumes.id, { onDelete: "set null" }),
    coverLetterStoragePath: text("cover_letter_storage_path"),
    filledAt: timestamp("filled_at", { withTimezone: true }),
    userSubmittedAt: timestamp("user_submitted_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("applications_user_id_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// application_questions
// ---------------------------------------------------------------------------

export const applicationQuestions = pgTable(
  "application_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    questionText: text("question_text").notNull(),
    questionType: questionTypeEnum("question_type").notNull(),
    answerText: text("answer_text"),
    answeredBy: answeredByEnum("answered_by"),
    agentDraftAnswer: text("agent_draft_answer"),
    fieldSelector: text("field_selector"),
    orderIndex: integer("order_index").notNull().default(0),
  },
  (t) => [index("application_questions_application_id_idx").on(t.applicationId)],
);

// ---------------------------------------------------------------------------
// agent_runs — audit log
// ---------------------------------------------------------------------------

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    agentType: agentTypeEnum("agent_type").notNull(),
    status: agentRunStatusEnum("status").notNull().default("running"),
    inputSummary: jsonb("input_summary"),
    outputSummary: jsonb("output_summary"),
    browserbaseSessionId: text("browserbase_session_id"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
  },
  (t) => [index("agent_runs_user_id_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// job_search_criteria
// ---------------------------------------------------------------------------

export const jobSearchCriteria = pgTable(
  "job_search_criteria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    keywords: text("keywords").array(),
    targetTitles: text("target_titles").array(),
    targetLocations: text("target_locations").array(),
    remoteOnly: boolean("remote_only").notNull().default(false),
    minSalary: numeric("min_salary"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("job_search_criteria_user_id_idx").on(t.userId)],
);
