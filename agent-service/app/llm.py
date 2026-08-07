from anthropic import Anthropic

from app.config import settings
from app.schemas import ExtractedResumeData

_client = Anthropic(api_key=settings.anthropic_api_key)

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


def extract_resume_data(resume_text: str) -> ExtractedResumeData:
    """Runs one Claude call with forced tool use to turn raw resume text
    into the structured shape stored in parsed_resume_data (plan Section
    4.1 — Resume Parser Agent)."""
    response = _client.messages.create(
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
