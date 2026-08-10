import base64

import httpx
import jwt as pyjwt

from app import db
from app.browser.greenhouse import fill_greenhouse_application
from app.browser.session import open_browser_page
from app.schemas import FieldOutcome, FillApplicationRequest, FillApplicationResponse
from app.security import verify_user_jwt


def _split_name(full_name: str | None) -> tuple[str, str]:
    parts = (full_name or "").strip().split(maxsplit=1)
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]


async def run_form_filler(request: FillApplicationRequest) -> FillApplicationResponse:
    """Form-Filler / Orchestrator Agent (plan Section 4.4): opens a browser
    session, fills the real application page from the user's profile,
    resume, and previously-answered questions, and stops before submit —
    the human always clicks that button themselves. Only Greenhouse-hosted
    applications are supported so far (verified live during development,
    see app/browser/greenhouse.py); anything else returns
    status="unsupported_site" rather than guessing at an unfamiliar form.
    """
    try:
        claims = verify_user_jwt(request.user_jwt)
    except pyjwt.PyJWTError:
        return FillApplicationResponse(status="failed", error="Invalid user token")
    if claims.get("sub") != request.user_id:
        return FillApplicationResponse(status="failed", error="Token/user mismatch")

    application = await db.get_application_for_user(request.application_id, request.user_id)
    if not application:
        return FillApplicationResponse(status="failed", error="Application not found")

    apply_url = application["application_url"]
    if not apply_url:
        return FillApplicationResponse(status="failed", error="Application has no application URL set")
    if "greenhouse.io" not in apply_url:
        return FillApplicationResponse(
            status="unsupported_site",
            error="Automated form-filling currently only supports Greenhouse-hosted applications.",
        )

    run_id = await db.start_agent_run(
        request.user_id, "form_filler", {"application_id": request.application_id}
    )

    try:
        profile = await db.get_profile_for_fill(request.user_id)
        first_name, last_name = _split_name(profile["full_name"] if profile else None)
        answered = await db.get_answered_questions(request.application_id)
        answers = [{"question_text": r["question_text"], "answer_text": r["answer_text"]} for r in answered]
        eeo = {
            "gender": profile["eeo_gender"] if profile else None,
            "race": profile["eeo_race"] if profile else None,
            "veteran_status": profile["eeo_veteran_status"] if profile else None,
            "disability_status": profile["eeo_disability_status"] if profile else None,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resume_resp = await client.get(request.signed_resume_url)
            resume_resp.raise_for_status()
            resume_bytes = resume_resp.content

        async with open_browser_page() as (page, browserbase_session_id):
            fill_result = await fill_greenhouse_application(
                page,
                apply_url,
                first_name=first_name,
                last_name=last_name,
                email=claims.get("email", ""),
                phone=profile["phone"] if profile else None,
                resume_bytes=resume_bytes,
                resume_filename=request.resume_filename,
                cover_letter_bytes=None,
                cover_letter_filename=None,
                answers=answers,
                eeo=eeo,
            )

        await db.finish_agent_run(
            run_id,
            status="succeeded",
            output_summary={
                "filled_count": fill_result.filled_count,
                "failed_count": fill_result.failed_count,
                "unmatched_count": len(fill_result.unmatched_questions),
            },
        )

        return FillApplicationResponse(
            status="complete",
            fields=[
                FieldOutcome(field_label=f.field_label, status=f.status, detail=f.detail)
                for f in fill_result.fields
            ],
            unmatched_questions=fill_result.unmatched_questions,
            screenshot_base64=base64.b64encode(fill_result.screenshot).decode()
            if fill_result.screenshot
            else None,
            browserbase_session_id=browserbase_session_id,
        )

    except Exception as e:  # agent-boundary catch-all, see run_resume_parser
        await db.finish_agent_run(run_id, status="failed", error_message=str(e))
        return FillApplicationResponse(status="failed", error=str(e))
