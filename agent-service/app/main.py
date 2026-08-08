from fastapi import Depends, FastAPI

from app.agents.job_ingest import run_job_ingest
from app.agents.question_drafter import run_question_drafter
from app.agents.resume_parser import run_resume_parser
from app.schemas import (
    DraftAnswersRequest,
    DraftAnswersResponse,
    IngestJobPostingRequest,
    IngestJobPostingResponse,
    ParseResumeRequest,
    ParseResumeResponse,
)
from app.security import require_internal_auth

app = FastAPI(title="EasyApply.ai Agent Service")


@app.get("/health")
def health() -> dict:
    """Unauthenticated liveness check for the hosting platform (Railway)."""
    return {"status": "ok"}


@app.get("/health/authenticated", dependencies=[Depends(require_internal_auth)])
def health_authenticated() -> dict:
    """Same as /health, but requires the Next.js<->Python bearer secret —
    used to confirm that trust boundary is wired correctly end to end
    (see plan Phase 0 verification)."""
    return {"status": "ok"}


@app.post(
    "/agents/parse-resume",
    dependencies=[Depends(require_internal_auth)],
    response_model=ParseResumeResponse,
)
async def parse_resume(request: ParseResumeRequest) -> ParseResumeResponse:
    """Resume Parser Agent endpoint (plan Section 4.1). Called by
    web/src/lib/agent-service.ts after the file lands in Supabase Storage."""
    return await run_resume_parser(request)


@app.post(
    "/ingest/job-posting",
    dependencies=[Depends(require_internal_auth)],
    response_model=IngestJobPostingResponse,
)
async def ingest_job_posting(request: IngestJobPostingRequest) -> IngestJobPostingResponse:
    """Manual job-posting ingestion (plan Section 6). Called when a user
    pastes a job URL or raw description into the new-application form."""
    return await run_job_ingest(request)


@app.post(
    "/agents/draft-answers",
    dependencies=[Depends(require_internal_auth)],
    response_model=DraftAnswersResponse,
)
async def draft_answers(request: DraftAnswersRequest) -> DraftAnswersResponse:
    """Question-Answer Drafter Agent endpoint (plan Section 4.3)."""
    return await run_question_drafter(request)


# The matcher and form filler agents (plan Section 4.2, 4.4) land in
# Phases 3-4.
