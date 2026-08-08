import httpx
import trafilatura


class FetchError(Exception):
    pass


async def fetch_and_extract(url: str) -> str:
    """Fetches a job posting URL server-side (never client-side — avoids
    CORS and leaking the user's IP, plan Section 6) and strips it down to
    the readable article text with trafilatura. Raises FetchError if the
    page can't be fetched or yields no extractable text — e.g. a
    JS-rendered posting a static fetch can't see; a Browserbase-backed
    fallback for that case lands in Phase 4."""
    try:
        async with httpx.AsyncClient(
            timeout=15, follow_redirects=True, headers={"User-Agent": "EasyApplyAI/0.1"}
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
    except httpx.HTTPError as e:
        raise FetchError(f"Could not fetch {url}: {e}") from e

    text = trafilatura.extract(resp.text)
    if not text or not text.strip():
        raise FetchError(
            "Could not extract readable text from this page — it may require JavaScript. "
            "Try pasting the job description text directly instead."
        )
    return text.strip()
