import html as html_module
from dataclasses import dataclass
from datetime import datetime

from lxml.html import fromstring


class CompanyNotFoundError(Exception):
    """Raised when a job-board source returns 404 for a company token —
    distinct from "valid token, zero current postings" so callers can give
    the user an actionable error instead of silently ingesting nothing."""


@dataclass
class NormalizedJobPosting:
    """Common shape every job-board source module normalizes into — mirrors
    the `job_postings` columns filled at ingestion time (skill extraction and
    embedding happen afterward, in app/agents/job_board_ingest.py, the same
    way for every source). See plan Section 6.
    """

    source: str
    source_id: str
    company_name: str
    title: str
    description_raw: str
    description_url: str | None = None
    location_text: str | None = None
    is_remote: bool = False
    employment_type: str | None = None
    posted_at: datetime | None = None


_REMOTE_KEYWORDS = ("remote",)


def guess_is_remote(location_text: str | None) -> bool:
    if not location_text:
        return False
    return any(kw in location_text.lower() for kw in _REMOTE_KEYWORDS)


def html_to_text(raw_html: str | None) -> str:
    """Shared HTML->plain-text conversion for job-board description fields.
    Handles both real HTML and HTML-entity-escaped HTML (Greenhouse's
    `content` field is double-encoded — decoding once turns `&lt;p&gt;` back
    into `<p>` before tag stripping)."""
    if not raw_html or not raw_html.strip():
        return ""
    unescaped = html_module.unescape(raw_html)
    try:
        tree = fromstring(unescaped)
        return tree.text_content().strip()
    except Exception:
        # Malformed fragment (rare) — fall back to the unescaped text as-is
        # rather than failing the whole ingestion for one bad posting.
        return unescaped.strip()
