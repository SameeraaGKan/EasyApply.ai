import sentry_sdk
from fastapi import Depends, FastAPI, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.agents.form_filler import run_form_filler
from app.agents.job_board_ingest import run_job_board_ingest
from app.agents.job_ingest import run_job_ingest
from app.agents.matcher import run_matcher
from app.agents.question_drafter import run_question_drafter
from app.agents.resume_parser import run_resume_parser
from app.config import settings
from app.schemas import (
    DraftAnswersRequest,
    DraftAnswersResponse,
    FillApplicationRequest,
    FillApplicationResponse,
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

# Error tracking (plan Section 7) — sentry_sdk.init() with dsn=None is a
# documented no-op (verified locally), so this is inert until SENTRY_DSN is
# set. send_default_pii and include_local_variables are both off since this
# service's stack frames routinely hold resume text, EEO values, and JWTs
# in local variables — none of that should ever leave the process.
sentry_sdk.init(
    dsn=settings.sentry_dsn,
    traces_sample_rate=0.1,
    send_default_pii=False,
    include_local_variables=False,
)

app = FastAPI(title="EasyApply.ai Agent Service")

# Defense-in-depth rate limiting (plan Section 7) — Next.js already rate
# limits per-user before calling in here, so this is a coarser backstop
# keyed by remote address (in production that's whichever host actually
# reaches this service, e.g. Next.js's own address if not on a private
# network) against the whole service being hammered, not a per-user quota.
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


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
@limiter.limit("30/hour")
async def parse_resume(request: Request, body: ParseResumeRequest) -> ParseResumeResponse:
    """Resume Parser Agent endpoint (plan Section 4.1). Called by
    web/src/lib/agent-service.ts after the file lands in Supabase Storage."""
    return await run_resume_parser(body)


@app.post(
    "/ingest/job-posting",
    dependencies=[Depends(require_internal_auth)],
    response_model=IngestJobPostingResponse,
)
@limiter.limit("40/hour")
async def ingest_job_posting(request: Request, body: IngestJobPostingRequest) -> IngestJobPostingResponse:
    """Manual job-posting ingestion (plan Section 6). Called when a user
    pastes a job URL or raw description into the new-application form."""
    return await run_job_ingest(body)


@app.post(
    "/agents/draft-answers",
    dependencies=[Depends(require_internal_auth)],
    response_model=DraftAnswersResponse,
)
@limiter.limit("40/hour")
async def draft_answers(request: Request, body: DraftAnswersRequest) -> DraftAnswersResponse:
    """Question-Answer Drafter Agent endpoint (plan Section 4.3)."""
    return await run_question_drafter(body)


@app.post(
    "/ingest/job-board",
    dependencies=[Depends(require_internal_auth)],
    response_model=IngestJobBoardResponse,
)
@limiter.limit("30/hour")
async def ingest_job_board(request: Request, body: IngestJobBoardRequest) -> IngestJobBoardResponse:
    """Greenhouse/Lever job-board ingestion (plan Section 6)."""
    return await run_job_board_ingest(body)


@app.post(
    "/agents/match",
    dependencies=[Depends(require_internal_auth)],
    response_model=MatchResponse,
)
@limiter.limit("40/hour")
async def match(request: Request, body: MatchRequest) -> MatchResponse:
    """Matcher/Ranker Agent endpoint (plan Section 4.2)."""
    return await run_matcher(body)


@app.post(
    "/agents/fill-application",
    dependencies=[Depends(require_internal_auth)],
    response_model=FillApplicationResponse,
)
@limiter.limit("30/hour")
async def fill_application(request: Request, body: FillApplicationRequest) -> FillApplicationResponse:
    """Form-Filler/Orchestrator Agent endpoint (plan Section 4.4). Stops
    before the submit button — the caller is responsible for surfacing the
    screenshot and letting the human take it from there."""
    return await run_form_filler(body)
