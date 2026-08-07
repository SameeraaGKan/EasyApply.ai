CREATE TYPE "public"."agent_run_status" AS ENUM('running', 'succeeded', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."agent_type" AS ENUM('resume_parser', 'matcher', 'question_drafter', 'form_filler');--> statement-breakpoint
CREATE TYPE "public"."answer_mode" AS ENUM('agent_drafts', 'ask_me');--> statement-breakpoint
CREATE TYPE "public"."answered_by" AS ENUM('agent', 'user');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('draft', 'form_filled_pending_review', 'submitted_by_user', 'rejected', 'interviewing', 'offer', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('full_time', 'part_time', 'contract', 'intern');--> statement-breakpoint
CREATE TYPE "public"."file_type" AS ENUM('pdf', 'docx');--> statement-breakpoint
CREATE TYPE "public"."job_source" AS ENUM('greenhouse', 'lever', 'ashby', 'adzuna', 'manual_paste', 'manual_url');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('suggested', 'shortlisted', 'dismissed', 'applied');--> statement-breakpoint
CREATE TYPE "public"."parse_status" AS ENUM('pending', 'processing', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('short_text', 'long_text', 'multiple_choice', 'yes_no', 'file_upload');--> statement-breakpoint
CREATE TYPE "public"."remote_preference" AS ENUM('remote', 'hybrid', 'onsite', 'any');--> statement-breakpoint
CREATE TYPE "public"."seniority_level" AS ENUM('entry', 'mid', 'senior', 'staff', 'principal', 'exec');--> statement-breakpoint
CREATE TYPE "public"."work_authorization" AS ENUM('citizen', 'green_card', 'visa_sponsorship_required', 'other');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"application_id" uuid,
	"agent_type" "agent_type" NOT NULL,
	"status" "agent_run_status" DEFAULT 'running' NOT NULL,
	"input_summary" jsonb,
	"output_summary" jsonb,
	"browserbase_session_id" text,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "application_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"question_text" text NOT NULL,
	"question_type" "question_type" NOT NULL,
	"answer_text" text,
	"answered_by" "answered_by",
	"agent_draft_answer" text,
	"field_selector" text,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_posting_id" uuid,
	"match_id" uuid,
	"company_name" text NOT NULL,
	"role_title" text NOT NULL,
	"status" "application_status" DEFAULT 'draft' NOT NULL,
	"application_url" text,
	"resume_id" uuid,
	"cover_letter_storage_path" text,
	"filled_at" timestamp with time zone,
	"user_submitted_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_postings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "job_source" NOT NULL,
	"source_id" text,
	"company_name" text NOT NULL,
	"title" text NOT NULL,
	"description_raw" text NOT NULL,
	"description_url" text,
	"location_text" text,
	"location_city" text,
	"location_state" text,
	"location_country" text,
	"is_remote" boolean DEFAULT false NOT NULL,
	"employment_type" "employment_type",
	"seniority_level" "seniority_level",
	"salary_min" numeric,
	"salary_max" numeric,
	"salary_currency" varchar(3),
	"extracted_skills" jsonb,
	"embedding" vector(1024),
	"posted_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_stale" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_search_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"keywords" text[],
	"target_titles" text[],
	"target_locations" text[],
	"remote_only" boolean DEFAULT false NOT NULL,
	"min_salary" numeric,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_posting_id" uuid NOT NULL,
	"resume_id" uuid NOT NULL,
	"overall_score" numeric NOT NULL,
	"score_breakdown" jsonb,
	"match_rationale" text,
	"status" "match_status" DEFAULT 'suggested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parsed_resume_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"raw_text" text,
	"skills" jsonb,
	"work_experience" jsonb,
	"education" jsonb,
	"certifications" jsonb,
	"projects" jsonb,
	"total_years_experience" numeric,
	"seniority_level" "seniority_level",
	"embedding" vector(1024),
	"parsed_by_model" text,
	"parse_confidence" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text,
	"phone" text,
	"location_city" text,
	"location_state" text,
	"location_country" text,
	"work_authorization" "work_authorization",
	"willing_to_relocate" boolean DEFAULT false NOT NULL,
	"remote_preference" "remote_preference",
	"links" jsonb,
	"eeo_gender" text,
	"eeo_race" text,
	"eeo_veteran_status" text,
	"eeo_disability_status" text,
	"default_answer_mode" "answer_mode" DEFAULT 'agent_drafts' NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"original_filename" text NOT NULL,
	"file_type" "file_type" NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"parse_status" "parse_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_questions" ADD CONSTRAINT "application_questions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_posting_id_job_postings_id_fk" FOREIGN KEY ("job_posting_id") REFERENCES "public"."job_postings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_search_criteria" ADD CONSTRAINT "job_search_criteria_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_job_posting_id_job_postings_id_fk" FOREIGN KEY ("job_posting_id") REFERENCES "public"."job_postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parsed_resume_data" ADD CONSTRAINT "parsed_resume_data_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parsed_resume_data" ADD CONSTRAINT "parsed_resume_data_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_user_id_idx" ON "agent_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "application_questions_application_id_idx" ON "application_questions" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "applications_user_id_idx" ON "applications" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_postings_source_source_id_idx" ON "job_postings" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "job_search_criteria_user_id_idx" ON "job_search_criteria" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_user_id_job_posting_id_idx" ON "matches" USING btree ("user_id","job_posting_id");--> statement-breakpoint
CREATE INDEX "matches_user_id_idx" ON "matches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "parsed_resume_data_user_id_idx" ON "parsed_resume_data" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "resumes_user_id_idx" ON "resumes" USING btree ("user_id");