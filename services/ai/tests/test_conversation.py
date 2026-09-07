import asyncio
import json

import pytest
from pydantic import ValidationError

from app.contracts.conversation import ConversationChanges, ConversationMessage, ConversationRequest
from app.core.errors import AiServiceError
from app.providers.conversation import respond_to_conversation
from app.providers.openai_structured import RawStructuredResponse, ResponsesApi, ResponseUsage


class Usage:
    input_tokens = 60
    output_tokens = 90


class Response:
    model = "test-returned-model"
    status = "completed"
    usage: ResponseUsage | None = Usage()

    def __init__(self, text: str) -> None:
        self.output_text = text

    def model_dump(self) -> dict[str, object]:
        return {"output": []}


class Responses:
    def __init__(self, result: dict[str, object]) -> None:
        self.result = result
        self.request: dict[str, object] = {}

    async def create(self, **kwargs: object) -> RawStructuredResponse:
        self.request = kwargs
        return Response(json.dumps(self.result, ensure_ascii=False))


class Client:
    def __init__(self, result: dict[str, object]) -> None:
        self.fake = Responses(result)
        self.responses: ResponsesApi = self.fake


def request() -> ConversationRequest:
    return ConversationRequest(
        workspace_id="test-workspace", locale="en", model="configured-model",
        message="Use the second option, Arabic first",
        current={"caption": "Owner's latest edit", "contentType": "POST", "status": "DRAFT"},
        context={"offerings": [{"name": "Citrus knot", "version": 2}]},
        history=[ConversationMessage(role="assistant", text="Option 1: Warm citrus. Option 2: A little sunshine.")],
        summary="Owner wants a short introduction.",
    )


def test_provider_receives_current_draft_history_and_returns_exact_caption() -> None:
    caption = "  شمس صغيرة 🍊\n\nA little sunshine.\n\n#Bahrain\n"
    result: dict[str, object] = {"reply": "Updated the caption.", "summary": "Owner selected option two, Arabic first.", "changes": {"caption": caption, "brief": None, "visualDirection": None, "carousel": None, "reelScript": None}}
    client = Client(result)
    response = asyncio.run(respond_to_conversation(request(), client))
    assert response.result.changes is not None
    assert response.result.changes.caption == caption
    assert response.model == "test-returned-model"
    sent = client.fake.request
    assert sent["model"] == "configured-model"
    supplied = json.loads(str(sent["input"]))
    assert supplied["current"]["caption"] == "Owner's latest edit"
    assert supplied["history"][0]["text"].startswith("Option 1")
    assert supplied["summary"] == "Owner wants a short introduction."


def test_discussion_can_return_no_changes() -> None:
    client = Client({"reply": "Which offering should we introduce?", "summary": "Offering is unresolved.", "changes": None})
    response = asyncio.run(respond_to_conversation(request(), client))
    assert response.result.changes is None


@pytest.mark.parametrize("caption", ["🍊" * 2201, " ".join(f"#tag{i}" for i in range(31))])
def test_invalid_caption_is_rejected(caption: str) -> None:
    with pytest.raises(ValidationError):
        ConversationChanges(caption=caption, brief=None, visualDirection=None, carousel=None, reelScript=None)


def test_unknown_publication_action_is_rejected_by_provider_boundary() -> None:
    client = Client({"reply": "Published", "summary": "", "changes": {"status": "PUBLISHED"}})
    with pytest.raises(AiServiceError):
        asyncio.run(respond_to_conversation(request(), client))
