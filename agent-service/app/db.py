import json

import asyncpg

from app.config import settings
from app.schemas import ExtractedResumeData

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=5)
    return _pool


def _vector_literal(embedding: list[float]) -> str:
    """asyncpg has no built-in pgvector codec, so embeddings are passed as
    the pgvector text input format and cast with `::vector` in the query."""
    return "[" + ",".join(repr(float(x)) for x in embedding) + "]"


async def start_agent_run(user_id: str, agent_type: str, input_summary: dict) -> str:
    """Inserts the agent_runs audit-log row (plan Section 7 — every agent
    action must be traceable) and returns its id to close out later."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO agent_runs (user_id, agent_type, status, input_summary)
        VALUES ($1, $2, 'running', $3::jsonb)
        RETURNING id
        """,
        user_id,
        agent_type,
        json.dumps(input_summary),
    )
    return str(row["id"])


async def finish_agent_run(
    run_id: str, *, status: str, output_summary: dict | None = None, error_message: str | None = None
) -> None:
    pool = await get_pool()
    await pool.execute(
        """
        UPDATE agent_runs
        SET status = $2,
            output_summary = $3::jsonb,
            error_message = $4,
            completed_at = now(),
            duration_ms = EXTRACT(EPOCH FROM (now() - started_at)) * 1000
        WHERE id = $1
        """,
        run_id,
        status,
        json.dumps(output_summary) if output_summary is not None else None,
        error_message,
    )


async def update_resume_parse_status(resume_id: str, user_id: str, status: str) -> None:
    """Every write in this module is explicitly scoped by user_id — see the
    note in app/config.py on why this service enforces ownership at the
    application layer until Neon RLS/Authorize is wired up for direct
    (non-HTTP) connections."""
    pool = await get_pool()
    await pool.execute(
        "UPDATE resumes SET parse_status = $1 WHERE id = $2 AND user_id = $3",
        status,
        resume_id,
        user_id,
    )


def _skill_to_camel(s):
    return {"name": s.name, "category": s.category, "yearsExperience": s.years_experience}


def _experience_to_camel(e):
    return {
        "company": e.company,
        "title": e.title,
        "startDate": e.start_date,
        "endDate": e.end_date,
        "description": e.description,
        "bulletPoints": e.bullet_points,
    }


def _education_to_camel(ed):
    return {
        "institution": ed.institution,
        "degree": ed.degree,
        "field": ed.field,
        "graduationDate": ed.graduation_date,
    }


async def insert_parsed_resume_data(
    *,
    resume_id: str,
    user_id: str,
    raw_text: str,
    data: ExtractedResumeData,
    embedding: list[float],
    parsed_by_model: str,
) -> None:
    # jsonb payloads use camelCase keys to match the shape
    # web/src/db/schema.ts's `$type<...>()` annotations declare (and that
    # the review UI in web/src/app/(app)/resume/[id]/ reads directly) — both
    # services read/write the same columns, so the key casing must agree.
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                INSERT INTO parsed_resume_data (
                    resume_id, user_id, raw_text, skills, work_experience,
                    education, certifications, projects,
                    total_years_experience, seniority_level, embedding,
                    parsed_by_model
                ) VALUES (
                    $1, $2, $3, $4::jsonb, $5::jsonb,
                    $6::jsonb, $7::jsonb, $8::jsonb,
                    $9, $10, $11::vector,
                    $12
                )
                """,
                resume_id,
                user_id,
                raw_text,
                json.dumps([_skill_to_camel(s) for s in data.skills]),
                json.dumps([_experience_to_camel(e) for e in data.work_experience]),
                json.dumps([_education_to_camel(ed) for ed in data.education]),
                json.dumps(data.certifications),
                json.dumps(data.projects),
                data.total_years_experience,
                data.seniority_level,
                _vector_literal(embedding),
                parsed_by_model,
            )
            await conn.execute(
                "UPDATE resumes SET parse_status = 'complete' WHERE id = $1 AND user_id = $2",
                resume_id,
                user_id,
            )
