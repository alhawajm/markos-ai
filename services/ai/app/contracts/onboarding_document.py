from typing import Literal

from pydantic import Field

from app.contracts.campaign import StrictContract
from app.contracts.offering_document import OfferingDocumentCatalog

Confidence = Literal["HIGH", "MEDIUM", "LOW"]
EvidenceBasis = Literal["EXPLICIT", "VISUAL_INFERENCE"]
IssueSeverity = Literal["INFO", "WARNING"]
IssueCode = Literal[
    "MISSING_ESSENTIAL",
    "AMBIGUOUS_INFORMATION",
    "CONFLICTING_INFORMATION",
    "VISUAL_INFERENCE",
    "REVIEW_REQUIRED",
    "UNSUPPORTED_CONTENT",
]


class OnboardingDocumentFile(StrictContract):
    filename: str = Field(min_length=1, max_length=180)
    mime_type: Literal[
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "image/jpeg",
        "image/png",
        "image/webp",
    ]
    base64_data: str = Field(min_length=4, max_length=11_200_000)


class OnboardingDocumentAnalysisRequest(StrictContract):
    workspace_id: str = Field(min_length=1, max_length=120)
    files: list[OnboardingDocumentFile] = Field(min_length=1, max_length=5)
    model: str | None = Field(default=None, min_length=1, max_length=200)


class CompanyExtraction(StrictContract):
    name: str | None = Field(default=None, max_length=160)
    industry: str | None = Field(default=None, max_length=120)
    size: str | None = Field(default=None, max_length=80)
    location: str | None = Field(default=None, max_length=120)
    socials: list[str] = Field(default_factory=list, max_length=20)
    website: str | None = Field(default=None, max_length=500)
    languages: list[str] = Field(default_factory=list, max_length=30)


class StoryExtraction(StrictContract):
    mission: str | None = Field(default=None, max_length=2_000)
    origin: str | None = Field(default=None, max_length=2_000)
    problem_solved: str | None = Field(default=None, alias="problemSolved", max_length=1_000)
    values: list[str] = Field(default_factory=list, max_length=30)
    usp: str | None = Field(default=None, max_length=1_000)
    vision: str | None = Field(default=None, max_length=1_000)


class AudienceExtraction(StrictContract):
    age_range: str | None = Field(default=None, alias="ageRange", max_length=80)
    demographics: str | None = Field(default=None, max_length=1_000)
    gender_breakdown: str | None = Field(default=None, alias="genderBreakdown", max_length=120)
    interests: list[str] = Field(default_factory=list, max_length=30)
    locations: list[str] = Field(default_factory=list, max_length=20)
    motivations: list[str] = Field(default_factory=list, max_length=20)
    pain_points: list[str] = Field(default_factory=list, alias="painPoints", max_length=30)


class CompetitorCandidate(StrictContract):
    name: str = Field(min_length=1, max_length=160)
    instagram_handle: str | None = Field(default=None, alias="instagramHandle", max_length=80)
    website: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=1_000)


class CompetitorsExtraction(StrictContract):
    market_context: str | None = Field(default=None, alias="marketContext", max_length=2_000)
    items: list[CompetitorCandidate] = Field(default_factory=list, max_length=20)
    competitive_advantage: str | None = Field(
        default=None, alias="competitiveAdvantage", max_length=1_000
    )
    do_differently: str | None = Field(default=None, alias="doDifferently", max_length=1_000)


class BrandExtraction(StrictContract):
    aesthetic_words: list[str] = Field(default_factory=list, alias="aestheticWords", max_length=20)
    colors: list[str] = Field(default_factory=list, max_length=7)
    fonts: list[str] = Field(default_factory=list, max_length=12)
    tone_words: list[str] = Field(default_factory=list, alias="toneWords", max_length=4)
    voice_notes: str | None = Field(default=None, alias="voiceNotes", max_length=1_000)


class ObjectivesExtraction(StrictContract):
    current_priority: str | None = Field(default=None, alias="currentPriority", max_length=1_000)
    goals: list[str] = Field(default_factory=list, max_length=30)
    budget_range: str | None = Field(default=None, alias="budgetRange", max_length=120)
    instagram_experience: str | None = Field(
        default=None, alias="instagramExperience", max_length=120
    )
    success_90_days: str | None = Field(default=None, alias="success90Days", max_length=1_000)


class OnboardingDocumentProfile(StrictContract):
    company: CompanyExtraction
    offerings: OfferingDocumentCatalog
    story: StoryExtraction
    audience: AudienceExtraction
    competitors: CompetitorsExtraction
    brand: BrandExtraction
    objectives: ObjectivesExtraction


class OnboardingDocumentEvidence(StrictContract):
    field: str = Field(min_length=1, max_length=120)
    source_files: list[str] = Field(alias="sourceFiles", min_length=1, max_length=5)
    confidence: Confidence
    basis: EvidenceBasis


class OnboardingDocumentIssue(StrictContract):
    code: IssueCode
    severity: IssueSeverity
    message: str = Field(min_length=1, max_length=500)
    field: str | None = Field(default=None, max_length=120)
    source_files: list[str] = Field(default_factory=list, alias="sourceFiles", max_length=5)


class OnboardingDocumentExtraction(StrictContract):
    profile: OnboardingDocumentProfile
    evidence: list[OnboardingDocumentEvidence] = Field(default_factory=list, max_length=100)
    issues: list[OnboardingDocumentIssue] = Field(default_factory=list, max_length=50)


class OnboardingDocumentAnalysisResponse(StrictContract):
    model: str = Field(min_length=1, max_length=200)
    prompt_version: str = Field(min_length=1, max_length=120)
    tokens_in: int = Field(ge=0)
    tokens_out: int = Field(ge=0)
    extraction: OnboardingDocumentExtraction
