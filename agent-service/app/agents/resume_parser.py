import httpx
import jwt as pyjwt

from app import db
from app.embeddings import embed_resume_query, build_resume_summary
from app.llm import extract_resume_data
from app.parsing.extract_text import extract_text
from app.schemas import ParseResumeRequest, ParseResumeResponse
from app.security import verify_user_jwt

_PARSED_BY_MODEL = "claude-sonnet-4-5"


async def run_resume_parser(request: ParseResumeRequest) -> ParseResumeResponse:
    """Resume Parser Agent (plan Section 4.1): download -> extract text ->
    Claude structured extraction -> embed a normalized summary -> write
    parsed_resume_data. Every failure path marks the resume `failed` and
    closes out the agent_runs row rather than leaving it stuck
    `processing`/`running` — the top-level try/except is intentional here,
    this is the orchestration boundary that turns any internal failure into
    the {status: failed} contract the web app expects.
    """
    try:
        claims = verify_user_jwt(request.user_jwt)
    except pyjwt.PyJWTError:
        return ParseResumeResponse(status="failed", error="Invalid user token")
    if claims.get("sub") != request.user_id:
        return ParseResumeResponse(status="failed", error="Token/user mismatch")

    run_id = await db.start_agent_run(
        request.user_id,
        "resume_parser",
        {"resume_id": request.resume_id, "file_type": request.file_type},
    )

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(request.signed_download_url)
            resp.raise_for_status()
            file_bytes = resp.content

        raw_text = extract_text(file_bytes, request.file_type)
        if not raw_text.strip():
            raise ValueError("No extractable text found in resume")

        extracted = await extract_resume_data(raw_text)

        recent_titles = [e.title for e in extracted.work_experience[:3]]
        summary = build_resume_summary(
            skills=[s.name for s in extracted.skills],
            recent_titles=recent_titles,
            total_years_experience=extracted.total_years_experience,
            seniority_level=extracted.seniority_level,
        )
        embedding = await embed_resume_query(summary)

        await db.insert_parsed_resume_data(
            resume_id=request.resume_id,
            user_id=request.user_id,
            raw_text=raw_text,
            data=extracted,
            embedding=embedding,
            parsed_by_model=_PARSED_BY_MODEL,
        )

        await db.finish_agent_run(
            run_id,
            status="succeeded",
            output_summary={
                "skills_count": len(extracted.skills),
                "experience_count": len(extracted.work_experience),
            },
        )
        return ParseResumeResponse(status="complete")

    except Exception as e:  # intentional agent-boundary catch-all, see docstring
        await db.update_resume_parse_status(request.resume_id, request.user_id, "failed")
        await db.finish_agent_run(run_id, status="failed", error_message=str(e))
        return ParseResumeResponse(status="failed", error=str(e))
