from datetime import datetime

import httpx

from app.ingestion_sources.base import (
    CompanyNotFoundError,
    NormalizedJobPosting,
    guess_is_remote,
    html_to_text,
)


async def fetch_postings(company_token: str, limit: int | None = None) -> list[NormalizedJobPosting]:
    """Greenhouse Job Board API (plan Section 6) — public, no auth required.
    `?content=true` returns the full HTML job description inline for every
    posting in one request, avoiding an N+1 fetch per job.
    """
    url = f"https://boards-api.greenhouse.io/v1/boards/{company_token}/jobs?content=true"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url)
        if resp.status_code == 404:
            raise CompanyNotFoundError(
                f"No Greenhouse board found for company token '{company_token}'"
            )
        resp.raise_for_status()
        jobs = resp.json().get("jobs", [])

    if limit is not None:
        jobs = jobs[:limit]

    results = []
    for job in jobs:
        location_text = (job.get("location") or {}).get("name")
        posted_at = None
        if job.get("first_published"):
            try:
                posted_at = datetime.fromisoformat(job["first_published"])
            except ValueError:
                pass

        results.append(
            NormalizedJobPosting(
                source="greenhouse",
                source_id=str(job["id"]),
                company_name=job.get("company_name") or company_token,
                title=job["title"],
                description_raw=html_to_text(job.get("content")),
                description_url=job.get("absolute_url"),
                location_text=location_text,
                is_remote=guess_is_remote(location_text),
                posted_at=posted_at,
            )
        )
    return results
