from typing import Literal

from pydantic import BaseModel, Field, model_validator


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


# --- Job posting ingestion (plan Section 6) --------------------------------


class IngestJobPostingRequest(BaseModel):
    user_id: str
    user_jwt: str
    company_name: str
    title: str
    url: str | None = None
    raw_text: str | None = None

    @model_validator(mode="after")
    def _exactly_one_source(self) -> "IngestJobPostingRequest":
        if bool(self.url) == bool(self.raw_text):
            raise ValueError("Provide exactly one of `url` or `raw_text`")
        return self


class IngestJobPostingResponse(BaseModel):
    status: Literal["complete", "failed"]
    job_posting_id: str | None = None
    error: str | None = None


# --- Question-Answer Drafter agent (plan Section 4.3) ----------------------


class DraftAnswersRequest(BaseModel):
    application_id: str
    user_id: str
    user_jwt: str
    question_ids: list[str] | None = None


class DraftAnswersResponse(BaseModel):
    status: Literal["complete", "failed"]
    drafted_count: int = 0
    error: str | None = None


# --- Job-board ingestion + Matcher/Ranker agent (plan Sections 5-6) --------


class ExtractedJobSkill(BaseModel):
    name: str
    required: bool = True


class ExtractedJobRequirements(BaseModel):
    skills: list[ExtractedJobSkill] = Field(default_factory=list)
    seniority_level: SeniorityLevel | None = None


class IngestJobBoardRequest(BaseModel):
    # user_id/user_jwt are only used to verify the request and attribute the
    # agent_runs audit-log entry to whoever triggered it — job_postings
    # itself is a shared table with no per-user ownership (plan Section 2).
    user_id: str
    user_jwt: str
    source: Literal["greenhouse", "lever"]
    company_token: str
    limit: int = Field(default=25, ge=1, le=200)


class IngestJobBoardResponse(BaseModel):
    status: Literal["complete", "failed"]
    ingested_count: int = 0
    skipped_count: int = 0
    error: str | None = None


class MatchRequest(BaseModel):
    user_id: str
    user_jwt: str
    resume_id: str | None = None
    limit: int = Field(default=20, ge=1, le=100)


class MatchResponse(BaseModel):
    status: Literal["complete", "failed"]
    match_count: int = 0
    error: str | None = None
