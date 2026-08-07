from fastapi import Depends, FastAPI

from app.agents.resume_parser import run_resume_parser
from app.schemas import ParseResumeRequest, ParseResumeResponse
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


# The matcher, question drafter, and form filler agents (plan Section 4.2-4.4)
# land in Phases 2-4.
