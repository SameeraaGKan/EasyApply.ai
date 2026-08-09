from anthropic import AsyncAnthropic

from app.config import settings
from app.schemas import ExtractedJobRequirements, ExtractedResumeData

_client = AsyncAnthropic(api_key=settings.anthropic_api_key)

_MODEL = "claude-sonnet-4-5"

# Mirrors ExtractedResumeData — forcing tool use gets a schema-conformant
# response instead of parsing free-form text out of Claude's reply.
_EXTRACTION_TOOL = {
    "name": "record_extracted_resume_data",
    "description": "Records structured data extracted from a resume.",
    "input_schema": {
        "type": "object",
        "properties": {
            "skills": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "category": {"type": "string"},
                        "years_experience": {"type": "number"},
                    },
                    "required": ["name"],
                },
            },
            "work_experience": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "company": {"type": "string"},
                        "title": {"type": "string"},
                        "start_date": {"type": "string"},
                        "end_date": {"type": "string"},
                        "description": {"type": "string"},
                        "bullet_points": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["company", "title"],
                },
            },
            "education": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "institution": {"type": "string"},
                        "degree": {"type": "string"},
                        "field": {"type": "string"},
                        "graduation_date": {"type": "string"},
                    },
                    "required": ["institution"],
                },
            },
            "certifications": {"type": "array", "items": {"type": "string"}},
            "projects": {"type": "array", "items": {"type": "string"}},
            "total_years_experience": {"type": "number"},
            "seniority_level": {
                "type": "string",
                "enum": ["entry", "mid", "senior", "staff", "principal", "exec"],
            },
        },
        "required": ["skills", "work_experience", "education"],
    },
}

_SYSTEM_PROMPT = (
    "You extract structured data from resumes for a job-application assistant. "
    "Be faithful to the source text — do not invent skills, employers, or dates "
    "that aren't stated or clearly implied. Normalize skill names to their "
    "common form (e.g. 'JS' -> 'JavaScript', 'React.js' -> 'React') so they "
    "match cleanly against job descriptions later. Estimate "
    "total_years_experience from the work history date ranges, and infer "
    "seniority_level from titles and years of experience."
)


async def extract_resume_data(resume_text: str) -> ExtractedResumeData:
    """Runs one Claude call with forced tool use to turn raw resume text
    into the structured shape stored in parsed_resume_data (plan Section
    4.1 — Resume Parser Agent)."""
    response = await _client.messages.create(
        model=_MODEL,
        max_tokens=4096,
        system=_SYSTEM_PROMPT,
        tools=[_EXTRACTION_TOOL],
        tool_choice={"type": "tool", "name": _EXTRACTION_TOOL["name"]},
        messages=[{"role": "user", "content": resume_text}],
    )

    for block in response.content:
        if block.type == "tool_use" and block.name == _EXTRACTION_TOOL["name"]:
            return ExtractedResumeData.model_validate(block.input)

    raise RuntimeError("Claude did not return the expected tool call")


_ANSWER_SYSTEM_PROMPT = (
    "You draft answers to job application questions on behalf of a candidate, "
    "grounded strictly in the resume context and job description provided. "
    "Write in first person, as the candidate. Be specific and concrete — pull "
    "real details (companies, technologies, outcomes) from the resume context "
    "rather than writing generically. Never invent experience, skills, or "
    "credentials that aren't in the resume context. Match the expected format: "
    "for yes/no questions, answer with a single word plus at most one "
    "supporting sentence; for short-answer questions, 2-4 sentences; for "
    "long-answer questions, a well-organized paragraph or two. Return only the "
    "answer text — no preamble, no quotation marks."
)


async def draft_answer(
    *,
    question_text: str,
    question_type: str,
    resume_context: str,
    job_description: str | None,
) -> str:
    """Question-Answer Drafter Agent (plan Section 4.3): one Claude call per
    question, grounded in the candidate's resume and (if available) the
    target job description."""
    job_context = (
        f"\n\nJob description:\n{job_description}" if job_description else ""
    )
    prompt = (
        f"Resume context:\n{resume_context}{job_context}\n\n"
        f"Question type: {question_type}\n"
        f"Application question: {question_text}"
    )
    response = await _client.messages.create(
        model=_MODEL,
        max_tokens=1024,
        system=_ANSWER_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(block.text for block in response.content if block.type == "text").strip()


# Mirrors ExtractedJobRequirements. The same normalization rule as the
# resume extraction tool (`_EXTRACTION_TOOL` above) is repeated here
# deliberately — skill_overlap_pct in the matcher (plan Section 5 step 2)
# only works if both sides normalize skill names the same way.
_JOB_REQUIREMENTS_TOOL = {
    "name": "record_job_requirements",
    "description": "Records structured requirements extracted from a job posting.",
    "input_schema": {
        "type": "object",
        "properties": {
            "skills": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "required": {
                            "type": "boolean",
                            "description": "true if explicitly required/must-have, false if listed as nice-to-have/preferred",
                        },
                    },
                    "required": ["name", "required"],
                },
            },
            "seniority_level": {
                "type": "string",
                "enum": ["entry", "mid", "senior", "staff", "principal", "exec"],
            },
        },
        "required": ["skills"],
    },
}

_JOB_REQUIREMENTS_SYSTEM_PROMPT = (
    "You extract structured requirements from job postings for a job-matching "
    "system. Identify every skill, technology, or qualification mentioned and "
    "mark it required=true if the posting treats it as a must-have (e.g. "
    "'requirements', 'must have', 'you have') or required=false if it's listed "
    "as preferred/nice-to-have/bonus. Normalize skill names to their common "
    "form (e.g. 'JS' -> 'JavaScript', 'React.js' -> 'React') so they match "
    "cleanly against resume skills. Infer seniority_level from the title and "
    "any stated years-of-experience or level language."
)


async def extract_job_requirements(title: str, description: str) -> ExtractedJobRequirements:
    """One Claude call with forced tool use, run at ingestion time for every
    job posting (plan Section 5 step 2 / Section 6) — mirrors
    extract_resume_data so both sides of the match produce comparably
    normalized skill lists."""
    response = await _client.messages.create(
        model=_MODEL,
        max_tokens=2048,
        system=_JOB_REQUIREMENTS_SYSTEM_PROMPT,
        tools=[_JOB_REQUIREMENTS_TOOL],
        tool_choice={"type": "tool", "name": _JOB_REQUIREMENTS_TOOL["name"]},
        messages=[{"role": "user", "content": f"Title: {title}\n\n{description}"}],
    )

    for block in response.content:
        if block.type == "tool_use" and block.name == _JOB_REQUIREMENTS_TOOL["name"]:
            return ExtractedJobRequirements.model_validate(block.input)

    raise RuntimeError("Claude did not return the expected tool call")


_RATIONALE_SYSTEM_PROMPT = (
    "You explain, in 1-2 sentences, why a job posting is or isn't a strong "
    "match for a candidate. Ground the explanation in the specific score "
    "factors given — mention concrete skills/experience that align or are "
    "missing, and any notable mismatch (seniority, location). Be direct and "
    "specific, not generic. Write in second person ('You have...'). Return "
    "only the explanation — no preamble."
)


async def generate_match_rationale(
    *,
    job_title: str,
    company_name: str,
    score_breakdown: dict,
    resume_context: str,
) -> str:
    """LLM rationale generation (plan Section 5 step 5) — explanation only,
    computed after ranking so it never influences the (deterministic) score
    itself."""
    prompt = (
        f"Candidate resume context:\n{resume_context}\n\n"
        f"Job: {job_title} at {company_name}\n"
        f"Score breakdown: {score_breakdown}\n\n"
        "Explain why this is or isn't a strong match."
    )
    response = await _client.messages.create(
        model=_MODEL,
        max_tokens=256,
        system=_RATIONALE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(block.text for block in response.content if block.type == "text").strip()
