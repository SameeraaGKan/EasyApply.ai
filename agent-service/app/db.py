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


def _parse_vector_literal(text: str) -> list[float]:
    """Inverse of _vector_literal. Reading a `vector` column back through
    asyncpg is otherwise undefined (no registered codec for the type), so
    every SELECT that needs the embedding value explicitly casts it to
    `::text` in SQL and parses it here rather than trusting asyncpg's
    fallback handling for an unregistered OID."""
    return [float(x) for x in text.strip("[]").split(",")]


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


# --- job_postings (shared table — no user_id column; see plan Section 2's
# "service-context operations" note. Written here rather than from Next.js
# so the write path stays consistent whether a posting comes from manual
# paste-in (this module) or a future job-board API ingestion job.) --------


async def insert_job_posting(
    *,
    source: str,
    company_name: str,
    title: str,
    description_raw: str,
    description_url: str | None,
) -> str:
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO job_postings (source, company_name, title, description_raw, description_url)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
        """,
        source,
        company_name,
        title,
        description_raw,
        description_url,
    )
    return str(row["id"])


async def get_existing_job_posting_source_ids(source: str, source_ids: list[str]) -> set[str]:
    """Lets the ingestion agent skip postings it's already ingested without
    re-running the Claude/Voyage calls for them (plan Section 6 dedup)."""
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT source_id FROM job_postings WHERE source = $1 AND source_id = ANY($2::text[])",
        source,
        source_ids,
    )
    return {r["source_id"] for r in rows}


async def upsert_job_posting_from_source(
    *,
    source: str,
    source_id: str,
    company_name: str,
    title: str,
    description_raw: str,
    description_url: str | None,
    location_text: str | None,
    is_remote: bool,
    employment_type: str | None,
    seniority_level: str | None,
    extracted_skills: list[dict],
    embedding: list[float],
    posted_at,
) -> None:
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO job_postings (
            source, source_id, company_name, title, description_raw,
            description_url, location_text, is_remote, employment_type,
            seniority_level, extracted_skills, embedding, posted_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::vector, $13
        )
        ON CONFLICT (source, source_id) DO UPDATE SET
            company_name = EXCLUDED.company_name,
            title = EXCLUDED.title,
            description_raw = EXCLUDED.description_raw,
            description_url = EXCLUDED.description_url,
            location_text = EXCLUDED.location_text,
            is_remote = EXCLUDED.is_remote,
            employment_type = EXCLUDED.employment_type,
            seniority_level = EXCLUDED.seniority_level,
            extracted_skills = EXCLUDED.extracted_skills,
            embedding = EXCLUDED.embedding,
            fetched_at = now(),
            is_stale = false
        """,
        source,
        source_id,
        company_name,
        title,
        description_raw,
        description_url,
        location_text,
        is_remote,
        employment_type,
        seniority_level,
        json.dumps(extracted_skills),
        _vector_literal(embedding),
        posted_at,
    )


# --- Matcher/Ranker Agent reads/writes (plan Section 5) --------------------


async def get_resume_for_matching(resume_id: str | None, user_id: str) -> dict | None:
    """Same resume-context lookup as get_resume_context, plus the embedding
    the matcher needs for the vector similarity retrieval step."""
    pool = await get_pool()
    if resume_id:
        row = await pool.fetchrow(
            "SELECT resume_id, skills, seniority_level, total_years_experience, embedding::text AS embedding "
            "FROM parsed_resume_data WHERE resume_id = $1 AND user_id = $2 "
            "ORDER BY created_at DESC LIMIT 1",
            resume_id,
            user_id,
        )
    else:
        row = await pool.fetchrow(
            """
            SELECT prd.resume_id, prd.skills, prd.seniority_level, prd.total_years_experience,
                   prd.embedding::text AS embedding
            FROM parsed_resume_data prd
            JOIN resumes r ON r.id = prd.resume_id
            WHERE r.user_id = $1 AND r.is_active = true
            ORDER BY prd.created_at DESC LIMIT 1
            """,
            user_id,
        )
    result = _decode_row_jsonb(row, ("skills",))
    if result and result.get("embedding") is not None:
        result["embedding"] = _parse_vector_literal(result["embedding"])
    return result


async def get_profile_remote_preference(user_id: str) -> str | None:
    pool = await get_pool()
    row = await pool.fetchrow("SELECT remote_preference FROM profiles WHERE id = $1", user_id)
    return row["remote_preference"] if row else None


async def get_candidate_job_postings(embedding: list[float], top_k: int) -> list[dict]:
    """Dense retrieval step (plan Section 5 step 3): top-K job_postings by
    cosine distance to the resume embedding, using the HNSW index defined
    in web/src/db/schema.ts. `<=>` is pgvector's cosine-distance operator —
    lower is more similar."""
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT id, company_name, title, description_raw, location_text, is_remote,
               employment_type, seniority_level, extracted_skills, posted_at,
               (embedding <=> $1::vector) AS distance
        FROM job_postings
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $2
        """,
        _vector_literal(embedding),
        top_k,
    )
    return [dict(_decode_row_jsonb(r, ("extracted_skills",))) for r in rows]


async def upsert_match(
    *,
    user_id: str,
    job_posting_id: str,
    resume_id: str,
    overall_score: float,
    score_breakdown: dict,
    match_rationale: str | None,
) -> None:
    # The `WHERE matches.status = 'suggested'` on the conflict update means
    # re-running the matcher refreshes scores for untouched suggestions but
    # never overwrites a match the user already shortlisted/dismissed/applied
    # to — their decision wins over a re-ranking.
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO matches (user_id, job_posting_id, resume_id, overall_score, score_breakdown, match_rationale)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
        ON CONFLICT (user_id, job_posting_id) DO UPDATE SET
            resume_id = EXCLUDED.resume_id,
            overall_score = EXCLUDED.overall_score,
            score_breakdown = EXCLUDED.score_breakdown,
            match_rationale = EXCLUDED.match_rationale
        WHERE matches.status = 'suggested'
        """,
        user_id,
        job_posting_id,
        resume_id,
        overall_score,
        json.dumps(score_breakdown),
        match_rationale,
    )


# --- Question-Answer Drafter Agent reads/writes (plan Section 4.3) --------


async def get_application_for_user(application_id: str, user_id: str) -> asyncpg.Record | None:
    pool = await get_pool()
    return await pool.fetchrow(
        "SELECT id, user_id, job_posting_id, resume_id FROM applications WHERE id = $1 AND user_id = $2",
        application_id,
        user_id,
    )


async def get_job_posting_description(job_posting_id: str) -> str | None:
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT description_raw FROM job_postings WHERE id = $1", job_posting_id
    )
    return row["description_raw"] if row else None


def _decode_row_jsonb(row: asyncpg.Record | None, fields: tuple[str, ...]) -> dict | None:
    """asyncpg returns jsonb columns as raw text by default (no codec is
    registered globally — see insert_parsed_resume_data, which relies on
    that same default to write pre-serialized JSON directly). Decode just
    the fields callers need rather than registering a pool-wide codec that
    would change the write path's expectations too."""
    if row is None:
        return None
    result = dict(row)
    for field in fields:
        if result.get(field) is not None and isinstance(result[field], str):
            result[field] = json.loads(result[field])
    return result


async def get_resume_context(resume_id: str | None, user_id: str) -> dict | None:
    """Returns the parsed_resume_data fields needed to ground answer
    drafting — either the resume explicitly attached to the application, or
    the user's active resume if none was specified."""
    pool = await get_pool()
    if resume_id:
        row = await pool.fetchrow(
            "SELECT skills, work_experience, seniority_level, total_years_experience "
            "FROM parsed_resume_data WHERE resume_id = $1 AND user_id = $2 "
            "ORDER BY created_at DESC LIMIT 1",
            resume_id,
            user_id,
        )
    else:
        row = await pool.fetchrow(
            """
            SELECT prd.skills, prd.work_experience, prd.seniority_level, prd.total_years_experience
            FROM parsed_resume_data prd
            JOIN resumes r ON r.id = prd.resume_id
            WHERE r.user_id = $1 AND r.is_active = true
            ORDER BY prd.created_at DESC LIMIT 1
            """,
            user_id,
        )
    return _decode_row_jsonb(row, ("skills", "work_experience"))


async def get_pending_agent_questions(
    application_id: str, question_ids: list[str] | None
) -> list[asyncpg.Record]:
    pool = await get_pool()
    if question_ids:
        return await pool.fetch(
            """
            SELECT id, question_text, question_type FROM application_questions
            WHERE application_id = $1 AND answered_by = 'agent' AND answer_text IS NULL
              AND id = ANY($2::uuid[])
            ORDER BY order_index
            """,
            application_id,
            question_ids,
        )
    return await pool.fetch(
        """
        SELECT id, question_text, question_type FROM application_questions
        WHERE application_id = $1 AND answered_by = 'agent' AND answer_text IS NULL
        ORDER BY order_index
        """,
        application_id,
    )


async def save_drafted_answer(question_id: str, answer: str) -> None:
    pool = await get_pool()
    await pool.execute(
        "UPDATE application_questions SET agent_draft_answer = $1, answer_text = $1 WHERE id = $2",
        answer,
        question_id,
    )
