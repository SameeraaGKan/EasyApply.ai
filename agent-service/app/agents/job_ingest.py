import jwt as pyjwt

from app import db
from app.ingestion import FetchError, fetch_and_extract
from app.schemas import IngestJobPostingRequest, IngestJobPostingResponse
from app.security import verify_user_jwt


async def run_job_ingest(request: IngestJobPostingRequest) -> IngestJobPostingResponse:
    """Manual job-posting ingestion (plan Section 6): normalizes either a
    pasted URL or raw JD text into a `job_postings` row through the same
    table every future job-board API integration will also write to.
    Skill extraction + embedding are deferred to Phase 3, when the matcher
    that actually consumes them exists — this just captures and normalizes
    the posting so Phase 3 can backfill those columns later.
    """
    try:
        verify_user_jwt(request.user_jwt)
    except pyjwt.PyJWTError:
        return IngestJobPostingResponse(status="failed", error="Invalid user token")

    try:
        if request.url:
            description_raw = await fetch_and_extract(request.url)
            source = "manual_url"
        else:
            description_raw = (request.raw_text or "").strip()
            source = "manual_paste"

        if not description_raw:
            return IngestJobPostingResponse(status="failed", error="No job description text provided")

        job_posting_id = await db.insert_job_posting(
            source=source,
            company_name=request.company_name,
            title=request.title,
            description_raw=description_raw,
            description_url=request.url,
        )
        return IngestJobPostingResponse(status="complete", job_posting_id=job_posting_id)

    except FetchError as e:
        return IngestJobPostingResponse(status="failed", error=str(e))
    except Exception as e:  # agent-boundary catch-all, see run_resume_parser
        return IngestJobPostingResponse(status="failed", error=str(e))
