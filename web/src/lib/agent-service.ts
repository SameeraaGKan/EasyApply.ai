import "server-only";

const BASE_URL = process.env.AGENT_SERVICE_URL;
const BEARER_TOKEN = process.env.AGENT_SERVICE_BEARER_TOKEN;

/**
 * Server-only client for the Python agent service. Every call carries the
 * internal service bearer token (the Next.js<->Python trust boundary) and,
 * where the operation acts on behalf of a specific user, that user's
 * verified Supabase access token so the agent can use it for RLS-scoped
 * Neon access (see plan Section 2/3). Never import this from a Client
 * Component — the bearer token must never reach the browser.
 */
async function callAgentService<T>(path: string, body: unknown): Promise<T> {
  if (!BASE_URL || !BEARER_TOKEN) {
    throw new Error("AGENT_SERVICE_URL / AGENT_SERVICE_BEARER_TOKEN are not set");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BEARER_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Agent service ${path} failed: ${res.status} ${detail}`);
  }

  return res.json() as Promise<T>;
}

export type ParseResumeResult = {
  status: "complete" | "failed";
  error?: string;
};

export function parseResume(input: {
  resumeId: string;
  userId: string;
  userAccessToken: string;
  signedDownloadUrl: string;
  fileType: "pdf" | "docx";
}): Promise<ParseResumeResult> {
  return callAgentService<ParseResumeResult>("/agents/parse-resume", {
    resume_id: input.resumeId,
    user_id: input.userId,
    user_jwt: input.userAccessToken,
    signed_download_url: input.signedDownloadUrl,
    file_type: input.fileType,
  });
}

export type IngestJobPostingResult = {
  status: "complete" | "failed";
  job_posting_id?: string;
  error?: string;
};

export function ingestJobPosting(
  input: {
    userId: string;
    userAccessToken: string;
    companyName: string;
    title: string;
  } & ({ url: string; rawText?: never } | { url?: never; rawText: string }),
): Promise<IngestJobPostingResult> {
  return callAgentService<IngestJobPostingResult>("/ingest/job-posting", {
    user_id: input.userId,
    user_jwt: input.userAccessToken,
    company_name: input.companyName,
    title: input.title,
    url: input.url,
    raw_text: input.rawText,
  });
}

export type DraftAnswersResult = {
  status: "complete" | "failed";
  drafted_count: number;
  error?: string;
};

export function draftAnswers(input: {
  applicationId: string;
  userId: string;
  userAccessToken: string;
  questionIds?: string[];
}): Promise<DraftAnswersResult> {
  return callAgentService<DraftAnswersResult>("/agents/draft-answers", {
    application_id: input.applicationId,
    user_id: input.userId,
    user_jwt: input.userAccessToken,
    question_ids: input.questionIds,
  });
}

export type IngestJobBoardResult = {
  status: "complete" | "failed";
  ingested_count: number;
  skipped_count: number;
  error?: string;
};

export function ingestJobBoard(input: {
  userId: string;
  userAccessToken: string;
  source: "greenhouse" | "lever";
  companyToken: string;
  limit?: number;
}): Promise<IngestJobBoardResult> {
  return callAgentService<IngestJobBoardResult>("/ingest/job-board", {
    user_id: input.userId,
    user_jwt: input.userAccessToken,
    source: input.source,
    company_token: input.companyToken,
    limit: input.limit,
  });
}

export type MatchResult = {
  status: "complete" | "failed";
  match_count: number;
  error?: string;
};

export function runMatcher(input: {
  userId: string;
  userAccessToken: string;
  resumeId?: string;
  limit?: number;
}): Promise<MatchResult> {
  return callAgentService<MatchResult>("/agents/match", {
    user_id: input.userId,
    user_jwt: input.userAccessToken,
    resume_id: input.resumeId,
    limit: input.limit,
  });
}

export type FieldOutcome = {
  field_label: string;
  status: "filled" | "skipped" | "failed";
  detail?: string;
};

export type FillApplicationResult = {
  status: "complete" | "failed" | "unsupported_site";
  error?: string;
  fields: FieldOutcome[];
  unmatched_questions: string[];
  screenshot_base64?: string;
  browserbase_session_id?: string;
};

export function fillApplication(input: {
  applicationId: string;
  userId: string;
  userAccessToken: string;
  signedResumeUrl: string;
  resumeFilename: string;
}): Promise<FillApplicationResult> {
  return callAgentService<FillApplicationResult>("/agents/fill-application", {
    application_id: input.applicationId,
    user_id: input.userId,
    user_jwt: input.userAccessToken,
    signed_resume_url: input.signedResumeUrl,
    resume_filename: input.resumeFilename,
  });
}
