from typing import Literal

from pydantic import BaseModel, Field


class ParseResumeRequest(BaseModel):
    resume_id: str
    user_id: str
    user_jwt: str
    signed_download_url: str
    file_type: Literal["pdf", "docx"]


class ParseResumeResponse(BaseModel):
    status: Literal["complete", "failed"]
    error: str | None = None


# --- Structured extraction shape (mirrors web/src/db/schema.ts's
# parsedResumeData jsonb columns) -------------------------------------------


class ExtractedSkill(BaseModel):
    name: str
    category: str | None = None
    years_experience: float | None = None


class ExtractedExperience(BaseModel):
    company: str
    title: str
    start_date: str | None = None
    end_date: str | None = None
    description: str | None = None
    bullet_points: list[str] = Field(default_factory=list)


class ExtractedEducation(BaseModel):
    institution: str
    degree: str | None = None
    field: str | None = None
    graduation_date: str | None = None


SeniorityLevel = Literal["entry", "mid", "senior", "staff", "principal", "exec"]


class ExtractedResumeData(BaseModel):
    skills: list[ExtractedSkill] = Field(default_factory=list)
    work_experience: list[ExtractedExperience] = Field(default_factory=list)
    education: list[ExtractedEducation] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    projects: list[str] = Field(default_factory=list)
    total_years_experience: float | None = None
    seniority_level: SeniorityLevel | None = None
