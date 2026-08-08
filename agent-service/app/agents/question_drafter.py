import asyncio

import jwt as pyjwt

from app import db
from app.llm import draft_answer
from app.schemas import DraftAnswersRequest, DraftAnswersResponse
from app.security import verify_user_jwt


def _resume_context_to_text(resume: dict | None) -> str:
    if not resume:
        return "No resume on file."

    parts = []
    if resume.get("seniority_level"):
        parts.append(f"Seniority: {resume['seniority_level']}")
    if resume.get("total_years_experience") is not None:
        parts.append(f"Years of experience: {resume['total_years_experience']}")

    skill_names = [s.get("name") for s in (resume.get("skills") or []) if s.get("name")]
    if skill_names:
        parts.append("Skills: " + ", ".join(skill_names))

    experience_lines = [
        f"- {e.get('title', '')} at {e.get('company', '')} "
        f"({e.get('startDate', '?')}–{e.get('endDate', 'present')}): {e.get('description', '')}"
        for e in (resume.get("work_experience") or [])
    ]
    if experience_lines:
        parts.append("Experience:\n" + "\n".join(experience_lines))

    return "\n".join(parts) if parts else "No resume details available."


async def run_question_drafter(request: DraftAnswersRequest) -> DraftAnswersResponse:
    """Question-Answer Drafter Agent (plan Section 4.3): drafts answers for
    every pending agent-mode question on an application, grounded in the
    candidate's resume and (if linked) the job description. Questions the
    user chose to answer themselves are never touched here — see
    get_pending_agent_questions, which only selects answered_by = 'agent'
    rows with no answer yet.
    """
    try:
        claims = verify_user_jwt(request.user_jwt)
    except pyjwt.PyJWTError:
        return DraftAnswersResponse(status="failed", error="Invalid user token")
    if claims.get("sub") != request.user_id:
        return DraftAnswersResponse(status="failed", error="Token/user mismatch")

    application = await db.get_application_for_user(request.application_id, request.user_id)
    if not application:
        return DraftAnswersResponse(status="failed", error="Application not found")

    run_id = await db.start_agent_run(
        request.user_id, "question_drafter", {"application_id": request.application_id}
    )

    try:
        job_description = None
        if application["job_posting_id"]:
            job_description = await db.get_job_posting_description(str(application["job_posting_id"]))

        resume = await db.get_resume_context(
            str(application["resume_id"]) if application["resume_id"] else None,
            request.user_id,
        )
        resume_context = _resume_context_to_text(resume)

        questions = await db.get_pending_agent_questions(request.application_id, request.question_ids)
        if not questions:
            await db.finish_agent_run(run_id, status="succeeded", output_summary={"drafted_count": 0})
            return DraftAnswersResponse(status="complete", drafted_count=0)

        async def draft_one(question):
            answer = await draft_answer(
                question_text=question["question_text"],
                question_type=question["question_type"],
                resume_context=resume_context,
                job_description=job_description,
            )
            await db.save_drafted_answer(str(question["id"]), answer)

        await asyncio.gather(*(draft_one(q) for q in questions))

        await db.finish_agent_run(
            run_id, status="succeeded", output_summary={"drafted_count": len(questions)}
        )
        return DraftAnswersResponse(status="complete", drafted_count=len(questions))

    except Exception as e:  # noqa: BLE001 — agent-boundary catch-all, see run_resume_parser
        await db.finish_agent_run(run_id, status="failed", error_message=str(e))
        return DraftAnswersResponse(status="failed", error=str(e))
