from datetime import datetime

import httpx

from app.ingestion_sources.base import CompanyNotFoundError, NormalizedJobPosting, html_to_text

# Ashby Job Board API (plan Section 6) — public, no auth required. Verified
# live during development against several real boards (ramp, notion,
# linear, vercel, openai, supabase all returned real postings). Unlike
# Greenhouse, the description arrives as plain text already
# (`descriptionPlain`), so no HTML-entity unescaping/tag-stripping is
# needed — html_to_text is only used as a fallback if that field is ever
# missing for a posting.

_EMPLOYMENT_TYPE_MAP = {
    "FullTime": "full_time",
    "PartTime": "part_time",
    "Contract": "contract",
    "Intern": "intern",
    "Temporary": "contract",
}


async def fetch_postings(company_token: str, limit: int | None = None) -> list[NormalizedJobPosting]:
    url = f"https://api.ashbyhq.com/posting-api/job-board/{company_token}"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url)
        if resp.status_code == 404:
            raise CompanyNotFoundError(f"No Ashby board found for company token '{company_token}'")
        resp.raise_for_status()
        jobs = resp.json().get("jobs", [])

    if limit is not None:
        jobs = jobs[:limit]

    results = []
    for job in jobs:
        if not job.get("isListed", True):
            continue

        posted_at = None
        if job.get("publishedAt"):
            try:
                posted_at = datetime.fromisoformat(job["publishedAt"])
            except ValueError:
                pass

        description = job.get("descriptionPlain") or html_to_text(job.get("descriptionHtml"))

        results.append(
            NormalizedJobPosting(
                source="ashby",
                source_id=job["id"],
                company_name=company_token,
                title=job.get("title", ""),
                description_raw=description,
                description_url=job.get("jobUrl") or job.get("applyUrl"),
                location_text=job.get("location"),
                is_remote=bool(job.get("isRemote")) or job.get("workplaceType") == "Remote",
                employment_type=_EMPLOYMENT_TYPE_MAP.get(job.get("employmentType", "")),
                posted_at=posted_at,
            )
        )
    return results
