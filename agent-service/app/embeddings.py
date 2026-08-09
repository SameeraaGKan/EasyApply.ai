import voyageai

from app.config import settings

_client = voyageai.AsyncClient(api_key=settings.voyage_api_key)

# Must match EMBEDDING_DIM in web/src/db/schema.ts — both sides pin to the
# same model/dimensionality since embeddings are compared across the
# resume/job_postings tables (plan Section 5, Matching Algorithm).
MODEL = "voyage-3-lite"
DIMENSIONS = 1024


async def embed_resume_query(summary: str) -> list[float]:
    """Embeds a normalized resume summary for storage in
    parsed_resume_data.embedding. Uses `input_type="query"` — in the
    matching pipeline (plan Section 5) the resume is the search query run
    against the job_postings corpus, and Voyage's asymmetric retrieval
    models are tuned differently for query vs. document embeddings, so
    getting this side right matters for retrieval quality even though the
    resume embedding itself is computed once at parse time, well before any
    particular search."""
    result = await _client.embed(
        [summary],
        model=MODEL,
        input_type="query",
        output_dimension=DIMENSIONS,
    )
    return result.embeddings[0]


async def embed_job_document(text: str) -> list[float]:
    """Embeds a job posting (title + description) for storage in
    job_postings.embedding. Uses `input_type="document"` — this is the
    corpus side of the resume->job retrieval (plan Section 5 step 3)."""
    result = await _client.embed(
        [text],
        model=MODEL,
        input_type="document",
        output_dimension=DIMENSIONS,
    )
    return result.embeddings[0]


def build_resume_summary(
    skills: list[str],
    recent_titles: list[str],
    total_years_experience: float | None,
    seniority_level: str | None,
) -> str:
    """Builds the dense summary string that gets embedded — concatenates
    the highest-signal fields rather than the raw resume text, per plan
    Section 5 step 3."""
    parts = []
    if recent_titles:
        parts.append("Titles: " + ", ".join(recent_titles))
    if seniority_level:
        parts.append(f"Seniority: {seniority_level}")
    if total_years_experience is not None:
        parts.append(f"Years of experience: {total_years_experience}")
    if skills:
        parts.append("Skills: " + ", ".join(skills))
    return "\n".join(parts)


def build_job_document(title: str, company_name: str, description: str) -> str:
    """Builds the text that gets embedded for a job posting. Truncated to
    keep well within the embedding model's context window — the title
    (highest signal) always survives truncation."""
    text = f"{title} at {company_name}\n\n{description}"
    return text[:8000]
