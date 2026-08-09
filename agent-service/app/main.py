from fastapi import Depends, FastAPI

from app.agents.job_board_ingest import run_job_board_ingest
from app.agents.job_ingest import run_job_ingest
from app.agents.matcher import run_matcher
from app.agents.question_drafter import run_question_drafter
from app.agents.resume_parser import run_resume_parser
from app.schemas import (
    DraftAnswersRequest,
    DraftAnswersResponse,
    IngestJobBoardRequest,
    IngestJobBoardResponse,
    IngestJobPostingRequest,
    IngestJobPostingResponse,
    MatchRequest,
    MatchResponse,
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


@app.post(
    "/ingest/job-board",
    dependencies=[Depends(require_internal_auth)],
    response_model=IngestJobBoardResponse,
)
async def ingest_job_board(request: IngestJobBoardRequest) -> IngestJobBoardResponse:
    """Greenhouse/Lever job-board ingestion (plan Section 6)."""
    return await run_job_board_ingest(request)


@app.post(
    "/agents/match",
    dependencies=[Depends(require_internal_auth)],
    response_model=MatchResponse,
)
async def match(request: MatchRequest) -> MatchResponse:
    """Matcher/Ranker Agent endpoint (plan Section 4.2)."""
    return await run_matcher(request)


# The form filler agent (plan Section 4.4) lands in Phase 4.
