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
