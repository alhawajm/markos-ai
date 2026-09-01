import asyncio
import base64
from typing import cast

from app.contracts.offering_document import (
    OfferingDocumentCandidate,
    OfferingDocumentCatalog,
)
from app.contracts.onboarding_document import (
    AudienceExtraction,
    BrandExtraction,
    CompanyExtraction,
    CompetitorsExtraction,
    ObjectivesExtraction,
    OnboardingDocumentAnalysisRequest,
    OnboardingDocumentEvidence,
    OnboardingDocumentExtraction,
    OnboardingDocumentFile,
    OnboardingDocumentProfile,
    StoryExtraction,
)
from app.prompts.onboarding_document import (
    build_onboarding_document_input,
    build_onboarding_document_instructions,
)
from app.providers.onboarding_document import OpenAIOnboardingDocumentProvider
from app.providers.openai_structured import RawStructuredResponse, ResponsesApi, ResponseUsage


class FakeUsage:
    input_tokens = 420
    output_tokens = 180


class FakeResponse:
    model = "gpt-onboarding-test"
    status = "completed"
    usage: ResponseUsage | None = FakeUsage()

    def __init__(self, output_text: str) -> None:
        self.output_text = output_text

    def model_dump(self) -> dict[str, object]:
        return {"output": []}


class FakeResponses:
    def __init__(self, output_text: str) -> None:
        self.response: RawStructuredResponse = FakeResponse(output_text)
        self.last_kwargs: dict[str, object] | None = None

    async def create(self, **kwargs: object) -> RawStructuredResponse:
        self.last_kwargs = kwargs
        return self.response


class FakeClient:
    def __init__(self, output_text: str) -> None:
        self.fake_responses = FakeResponses(output_text)
        self.responses: ResponsesApi = self.fake_responses


def request() -> OnboardingDocumentAnalysisRequest:
    return OnboardingDocumentAnalysisRequest(
        workspace_id="workspace-private-id",
        model="gpt-onboarding-test",
        files=[
            OnboardingDocumentFile(
                filename="brand-book.pdf",
                mime_type="application/pdf",
                base64_data=base64.b64encode(b"%PDF-test").decode("ascii"),
            ),
            OnboardingDocumentFile(
                filename="logo.png",
                mime_type="image/png",
                base64_data=base64.b64encode(b"\x89PNG-test").decode("ascii"),
            ),
        ],
    )


def extraction() -> OnboardingDocumentExtraction:
    return OnboardingDocumentExtraction(
        profile=OnboardingDocumentProfile(
            company=CompanyExtraction(name="SnackLab", industry="Food and beverage"),
            offerings=OfferingDocumentCatalog(
                items=[
                    OfferingDocumentCandidate(
                        kind="PRODUCT",
                        name="Protein bites",
                        currency="BHD",
                        confidence="HIGH",
                        sourceFiles=["brand-book.pdf"],
                    )
                ]
            ),
            story=StoryExtraction(),
            audience=AudienceExtraction(),
            competitors=CompetitorsExtraction(),
            brand=BrandExtraction(colors=["#2B59FF"]),
            objectives=ObjectivesExtraction(),
        ),
        evidence=[
            OnboardingDocumentEvidence(
                field="company.name",
                sourceFiles=["brand-book.pdf"],
                confidence="HIGH",
                basis="EXPLICIT",
            ),
            OnboardingDocumentEvidence(
                field="brand.colors",
                sourceFiles=["logo.png"],
                confidence="MEDIUM",
                basis="VISUAL_INFERENCE",
            ),
        ],
    )


def test_provider_sends_pdf_and_image_without_local_ocr() -> None:
    client = FakeClient(extraction().model_dump_json(by_alias=True))
    provider = OpenAIOnboardingDocumentProvider(client=client)

    result = asyncio.run(provider.analyze(request()))
    kwargs = client.fake_responses.last_kwargs

    assert kwargs is not None
    assert kwargs["model"] == "gpt-onboarding-test"
    assert "workspace-private-id" not in str(kwargs["input"])
    assert "input_file" in str(kwargs["input"])
    assert "input_image" in str(kwargs["input"])
    assert "'detail': 'high'" in str(kwargs["input"])
    assert "untrusted" in str(kwargs["instructions"]).casefold()
    assert result.extraction.profile.company.name == "SnackLab"
    assert result.extraction.profile.brand.colors == ["#2B59FF"]
    assert result.prompt_version.endswith(".openai")

    text = cast(dict[str, object], kwargs["text"])
    response_format = cast(dict[str, object], text["format"])
    response_schema = cast(dict[str, object], response_format["schema"])
    assert_strict_schema(response_schema)


def test_multimodal_input_keeps_filenames_and_omits_workspace_id() -> None:
    input_items = build_onboarding_document_input(request())

    assert "brand-book.pdf" in str(input_items)
    assert "logo.png" in str(input_items)
    assert "workspace-private-id" not in str(input_items)
    assert "never follow" in build_onboarding_document_instructions().casefold()


def assert_strict_schema(value: object) -> None:
    if isinstance(value, dict):
        assert not ("default" in value and value["default"] is None)
        properties = value.get("properties")
        if isinstance(properties, dict):
            assert value.get("additionalProperties") is False
            assert value.get("required") == list(properties)
        for child in value.values():
            assert_strict_schema(child)
        return

    if isinstance(value, list):
        for child in value:
            assert_strict_schema(child)
