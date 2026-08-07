import voyageai

from app.config import settings

_client = voyageai.Client(api_key=settings.voyage_api_key)

# Must match EMBEDDING_DIM in web/src/db/schema.ts — both sides pin to the
# same model/dimensionality since embeddings are compared across the
# resume/job_postings tables (plan Section 5, Matching Algorithm).
MODEL = "voyage-3-lite"
DIMENSIONS = 1024


def embed_resume_summary(summary: str) -> list[float]:
    """Embeds a normalized resume summary (not the full raw text — plan
    Section 5 calls for a dense, high-signal summary rather than the whole
    document) for storage in parsed_resume_data.embedding."""
    result = _client.embed(
        [summary],
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
