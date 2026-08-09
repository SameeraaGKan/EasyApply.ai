from datetime import datetime, timezone

import httpx

from app.ingestion_sources.base import (
    CompanyNotFoundError,
    NormalizedJobPosting,
    guess_is_remote,
    html_to_text,
)

# NOTE: verified live against api.lever.co (valid tokens return `[]` for
# companies with no current postings, invalid tokens return
# {"ok": false, "error": "Document not found"}), but no live company board
# with open postings was found during development to confirm the exact
# per-posting field shape end-to-end. Field access below is defensive
# (.get() with fallbacks) and follows Lever's documented public API
# (hire.lever.co/developer/documentation) — spot-check against a real
# populated board before relying on this in production.


async def fetch_postings(company_token: str, limit: int | None = None) -> list[NormalizedJobPosting]:
    """Lever Postings API (plan Section 6) — public, no auth required."""
    url = f"https://api.lever.co/v0/postings/{company_token}?mode=json"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url)
        if resp.status_code == 404:
            raise CompanyNotFoundError(
                f"No Lever board found for company token '{company_token}'"
            )
        resp.raise_for_status()
        jobs = resp.json()

    if not isinstance(jobs, list):
        # {"ok": false, "error": "..."} shape — defensive fallback in case
        # Lever ever returns this with a non-404 status for some token.
        return []

    if limit is not None:
        jobs = jobs[:limit]

    results = []
    for job in jobs:
        categories = job.get("categories") or {}
        location_text = categories.get("location")
        posted_at = None
        if job.get("createdAt"):
            try:
                posted_at = datetime.fromtimestamp(job["createdAt"] / 1000, tz=timezone.utc)
            except (TypeError, ValueError, OSError):
                pass

        description = job.get("descriptionPlain") or html_to_text(job.get("description"))
        list_sections = job.get("lists") or []
        section_text = "\n\n".join(
            f"{s.get('text', '')}\n{s.get('plainText') or html_to_text(s.get('content'))}"
            for s in list_sections
        )
        full_description = "\n\n".join(part for part in (description, section_text) if part)

        results.append(
            NormalizedJobPosting(
                source="lever",
                source_id=job["id"],
                company_name=company_token,
                title=job.get("text", ""),
                description_raw=full_description,
                description_url=job.get("hostedUrl"),
                location_text=location_text,
                is_remote=guess_is_remote(location_text)
                or (job.get("workplaceType") == "remote"),
                employment_type=categories.get("commitment"),
                posted_at=posted_at,
            )
        )
    return results
