import asyncio
from datetime import datetime, timezone

import jwt as pyjwt

from app import db
from app.embeddings import build_resume_summary
from app.llm import generate_match_rationale
from app.schemas import MatchRequest, MatchResponse
from app.security import verify_user_jwt

_SENIORITY_ORDER = ["entry", "mid", "senior", "staff", "principal", "exec"]

_RETRIEVAL_TOP_K = 75  # dense-retrieval candidate pool (plan Section 5 step 3)
_RATIONALE_TOP_N = 20  # how many of the ranked results get an LLM rationale

_WEIGHTS = {
    "semantic_similarity": 0.40,
    "skill_overlap_pct": 0.30,
    "experience_fit": 0.15,
    "location_fit": 0.10,
    "recency": 0.05,
}


def _semantic_similarity(distance: float) -> float:
    # pgvector `<=>` returns cosine distance; clamp since floating point and
    # non-unit-norm embeddings can push this slightly outside [0, 2].
    return max(0.0, min(1.0, 1 - distance))


def _skill_overlap_pct(resume_skills: list[dict], job_skills: list[dict]) -> float:
    if not job_skills:
        return 0.5  # neutral — posting wasn't skill-extracted for some reason
    required = [s for s in job_skills if s.get("required", True)]
    target = required or job_skills
    target_names = {s["name"].strip().lower() for s in target if s.get("name")}
    if not target_names:
        return 0.5
    resume_names = {s.get("name", "").strip().lower() for s in resume_skills}
    return len(resume_names & target_names) / len(target_names)


def _experience_fit(resume_level: str | None, job_level: str | None) -> float:
    if not resume_level or not job_level:
        return 0.5
    if resume_level not in _SENIORITY_ORDER or job_level not in _SENIORITY_ORDER:
        return 0.5
    diff = abs(_SENIORITY_ORDER.index(resume_level) - _SENIORITY_ORDER.index(job_level))
    if diff == 0:
        return 1.0
    if diff == 1:
        return 0.6
    return 0.0


def _location_fit(remote_preference: str | None, job_is_remote: bool) -> float:
    # Soft-penalize rather than hard-filter (plan Section 5 step 1) — no
    # geocoding in Phase 3, so this only reasons about remote vs. not.
    if not remote_preference or remote_preference == "any":
        return 1.0
    if remote_preference == "remote":
        return 1.0 if job_is_remote else 0.2
    # hybrid / onsite: can't confirm actual proximity without geocoding the
    # posting's location against the user's, so this is deliberately a
    # modest, non-extreme score in either direction.
    return 0.5 if job_is_remote else 0.7


def _recency(posted_at: datetime | None) -> float:
    if not posted_at:
        return 0.5
    if posted_at.tzinfo is None:
        posted_at = posted_at.replace(tzinfo=timezone.utc)
    days_old = (datetime.now(timezone.utc) - posted_at).days
    return max(0.0, min(1.0, 1 - days_old / 90))


async def run_matcher(request: MatchRequest) -> MatchResponse:
    """Matcher/Ranker Agent (plan Section 4.2 / Section 5): dense retrieval
    over job_postings by resume-embedding similarity, then a weighted
    structured re-rank, then an LLM rationale for the top results the user
    will actually see.
    """
    try:
        claims = verify_user_jwt(request.user_jwt)
    except pyjwt.PyJWTError:
        return MatchResponse(status="failed", error="Invalid user token")
    if claims.get("sub") != request.user_id:
        return MatchResponse(status="failed", error="Token/user mismatch")

    resume = await db.get_resume_for_matching(request.resume_id, request.user_id)
    if not resume or not resume.get("embedding"):
        return MatchResponse(status="failed", error="No parsed resume found to match against")

    remote_preference = await db.get_profile_remote_preference(request.user_id)
    candidates = await db.get_candidate_job_postings(resume["embedding"], _RETRIEVAL_TOP_K)

    scored = []
    for candidate in candidates:
        breakdown = {
            "semanticSimilarity": _semantic_similarity(candidate["distance"]),
            "skillOverlapPct": _skill_overlap_pct(resume.get("skills") or [], candidate["extracted_skills"] or []),
            "experienceFit": _experience_fit(resume.get("seniority_level"), candidate["seniority_level"]),
            "locationFit": _location_fit(remote_preference, candidate["is_remote"]),
            "recency": _recency(candidate["posted_at"]),
        }
        # Weighted composite score — plan Section 5 step 4's formula. Keys
        # here are camelCase to match matches.score_breakdown's stored
        # shape (web/src/db/schema.ts); _WEIGHTS is keyed in snake_case
        # matching the plan doc, hence the explicit mapping rather than a
        # shared key set between the two.
        overall = (
            _WEIGHTS["semantic_similarity"] * breakdown["semanticSimilarity"]
            + _WEIGHTS["skill_overlap_pct"] * breakdown["skillOverlapPct"]
            + _WEIGHTS["experience_fit"] * breakdown["experienceFit"]
            + _WEIGHTS["location_fit"] * breakdown["locationFit"]
            + _WEIGHTS["recency"] * breakdown["recency"]
        )
        scored.append((overall, breakdown, candidate))

    scored.sort(key=lambda x: x[0], reverse=True)
    top_results = scored[: request.limit]

    resume_context = build_resume_summary(
        skills=[s.get("name", "") for s in (resume.get("skills") or [])],
        recent_titles=[],
        total_years_experience=resume.get("total_years_experience"),
        seniority_level=resume.get("seniority_level"),
    )

    async def finalize(rank: int, overall: float, breakdown: dict, candidate: dict):
        rationale = None
        if rank < _RATIONALE_TOP_N:
            try:
                rationale = await generate_match_rationale(
                    job_title=candidate["title"],
                    company_name=candidate["company_name"],
                    score_breakdown=breakdown,
                    resume_context=resume_context,
                )
            except Exception:
                rationale = None  # rationale is explanatory, not required — never block a match on it

        await db.upsert_match(
            user_id=request.user_id,
            job_posting_id=str(candidate["id"]),
            resume_id=resume["resume_id"],
            overall_score=round(overall * 100, 2),
            score_breakdown=breakdown,
            match_rationale=rationale,
        )

    await asyncio.gather(
        *(
            finalize(rank, overall, breakdown, candidate)
            for rank, (overall, breakdown, candidate) in enumerate(top_results)
        )
    )

    return MatchResponse(status="complete", match_count=len(top_results))
