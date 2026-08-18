import asyncio

import jwt as pyjwt

from app import db
from app.embeddings import build_job_document, embed_job_document
from app.ingestion_sources import ashby, greenhouse, lever
from app.ingestion_sources.base import CompanyNotFoundError, NormalizedJobPosting
from app.llm import extract_job_requirements
from app.schemas import IngestJobBoardRequest, IngestJobBoardResponse
from app.security import verify_user_jwt

_SOURCES = {"greenhouse": greenhouse, "lever": lever, "ashby": ashby}
_CONCURRENCY = 5


async def run_job_board_ingest(request: IngestJobBoardRequest) -> IngestJobBoardResponse:
    """Job-board ingestion (plan Section 6): fetches postings from the
    requested source, skips ones already ingested, and runs the rest
    through the same skill-extraction + embedding pipeline as manual
    paste-in (app/agents/job_ingest.py) — the two entry points converge on
    the same job_postings write path. Like manual paste-in, this isn't one
    of the four LangGraph agents in plan Section 4 (it's an ETL step that
    feeds the matcher), so it doesn't write to agent_runs either — user_jwt
    is verified purely to confirm the request comes from an authenticated
    session before spending Claude/Voyage calls on it.
    """
    try:
        claims = verify_user_jwt(request.user_jwt)
    except pyjwt.PyJWTError:
        return IngestJobBoardResponse(status="failed", error="Invalid user token")
    if claims.get("sub") != request.user_id:
        return IngestJobBoardResponse(status="failed", error="Token/user mismatch")

    source_module = _SOURCES[request.source]

    try:
        postings = await source_module.fetch_postings(request.company_token, limit=request.limit)
    except CompanyNotFoundError as e:
        return IngestJobBoardResponse(status="failed", error=str(e))
    except Exception as e:  # agent-boundary catch-all, see run_resume_parser
        return IngestJobBoardResponse(status="failed", error=str(e))

    if not postings:
        return IngestJobBoardResponse(status="complete", ingested_count=0)

    existing_ids = await db.get_existing_job_posting_source_ids(
        request.source, [p.source_id for p in postings]
    )
    new_postings = [p for p in postings if p.source_id not in existing_ids]
    skipped = len(postings) - len(new_postings)

    semaphore = asyncio.Semaphore(_CONCURRENCY)
    ingested_flags = await asyncio.gather(
        *(_ingest_one(posting, semaphore) for posting in new_postings)
    )
    ingested = sum(ingested_flags)

    return IngestJobBoardResponse(status="complete", ingested_count=ingested, skipped_count=skipped)


async def _ingest_one(posting: NormalizedJobPosting, semaphore: asyncio.Semaphore) -> bool:
    async with semaphore:
        try:
            requirements = await extract_job_requirements(posting.title, posting.description_raw)
            document = build_job_document(posting.title, posting.company_name, posting.description_raw)
            embedding = await embed_job_document(document)

            await db.upsert_job_posting_from_source(
                source=posting.source,
                source_id=posting.source_id,
                company_name=posting.company_name,
                title=posting.title,
                description_raw=posting.description_raw,
                description_url=posting.description_url,
                location_text=posting.location_text,
                is_remote=posting.is_remote,
                employment_type=posting.employment_type,
                seniority_level=requirements.seniority_level,
                extracted_skills=[s.model_dump() for s in requirements.skills],
                embedding=embedding,
                posted_at=posting.posted_at,
            )
            return True
        except Exception:
            # One bad posting (malformed content, a transient API hiccup)
            # shouldn't fail the whole batch — it's simply not counted as
            # ingested and will be retried on the next run since it's still
            # missing from job_postings.
            return False
