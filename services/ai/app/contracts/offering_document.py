from typing import Literal

from pydantic import Field

from app.contracts.campaign import StrictContract

OfferingKind = Literal["PRODUCT", "SERVICE", "UNSPECIFIED"]
Confidence = Literal["HIGH", "MEDIUM", "LOW"]
IssueSeverity = Literal["INFO", "WARNING"]
IssueCode = Literal[
    "NO_OFFERINGS_FOUND",
    "AMBIGUOUS_OFFERING",
    "MISSING_DESCRIPTION",
    "MISSING_PRICE",
    "CONFLICTING_INFORMATION",
    "POSSIBLE_NON_OFFERING",
    "REVIEW_REQUIRED",
    "SOURCE_TRUNCATED",
]


class OfferingDocumentFile(StrictContract):
    filename: str = Field(min_length=1, max_length=180)
    mime_type: Literal[
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
    ]
    base64_data: str = Field(min_length=4, max_length=11_200_000)


class OfferingDocumentAnalysisRequest(StrictContract):
    workspace_id: str = Field(min_length=1, max_length=120)
    files: list[OfferingDocumentFile] = Field(min_length=1, max_length=2)
    model: str | None = Field(default=None, min_length=1, max_length=200)


class OfferingDocumentCandidate(StrictContract):
    kind: OfferingKind
    name: str = Field(min_length=1, max_length=160)
    category: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=1_000)
    price_minor: int | None = Field(default=None, alias="priceMinor", ge=0)
    currency: str = Field(min_length=3, max_length=3)
    confidence: Confidence
    source_files: list[str] = Field(alias="sourceFiles", min_length=1, max_length=5)


class OfferingDocumentCatalog(StrictContract):
    summary: str | None = Field(default=None, max_length=4_000)
    items: list[OfferingDocumentCandidate] = Field(default_factory=list, max_length=30)
    differentiators: list[str] = Field(default_factory=list, max_length=20)
    price_range: str | None = Field(default=None, alias="priceRange", max_length=120)
    sales_channels: list[str] = Field(default_factory=list, alias="salesChannels", max_length=12)


class OfferingDocumentIssue(StrictContract):
    code: IssueCode
    severity: IssueSeverity
    message: str = Field(min_length=1, max_length=500)
    field: str | None = Field(default=None, max_length=120)
    offering_name: str | None = Field(default=None, alias="offeringName", max_length=160)
    source_files: list[str] = Field(default_factory=list, alias="sourceFiles", max_length=2)


class OfferingDocumentExtraction(StrictContract):
    catalog: OfferingDocumentCatalog
    issues: list[OfferingDocumentIssue] = Field(default_factory=list, max_length=30)


class OfferingDocumentAnalysisResponse(StrictContract):
    model: str = Field(min_length=1, max_length=200)
    prompt_version: str = Field(min_length=1, max_length=120)
    tokens_in: int = Field(ge=0)
    tokens_out: int = Field(ge=0)
    extraction: OfferingDocumentExtraction
