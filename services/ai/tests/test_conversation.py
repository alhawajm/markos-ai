import asyncio
import json

import pytest
from pydantic import ValidationError

from app.contracts.conversation import AuthoringSnapshot, ConversationRequest, ConversationResult
from app.core.config import settings
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


def snapshot() -> dict[str, object]:
    return {
        "id": "05c8f930-5d08-4f5c-8953-8c5e6c4a5d95", "contentType": "POST", "revision": 2,
        "editable": True, "caption": "Owner's latest edit", "contentPillar": None,
        "campaignGoal": None, "tone": None, "brief": None, "reelScript": None,
        "mediaItems": [{"id": "637ba2d2-7ee7-4259-8397-c09cf3c2fc65", "position": 0,
                        "mediaKind": "IMAGE", "purpose": None, "title": None, "body": None,
                        "visualDirection": "Warm bakery", "aspectRatio": "SQUARE",
                        "generationDurationSeconds": None, "media": None}],
    }


def request() -> ConversationRequest:
    return ConversationRequest.model_validate({
        "workspace_id": "test-workspace", "locale": "en", "model": "configured-model",
        "message": "Use the second option, Arabic first", "current": snapshot(),
        "context": {"offerings": [{"name": "Citrus knot", "version": 2}]},
        "history": [{"role": "assistant", "text": "Option 1: Warm citrus. Option 2: A little sunshine."}],
        "summary": "Owner wants a short introduction.",
    })


def result(operations: list[dict[str, object]]) -> dict[str, object]:
    return {"reply": "Prepared the changes.", "summary": "Owner selected option two.",
            "operations": operations, "generation": [], "conversion": None}


def test_provider_receives_typed_draft_history_and_returns_exact_caption() -> None:
    caption = "  شمس صغيرة 🍊\n\nA little sunshine.\n\n#Bahrain\n"
    client = Client(result([{"type": "updateContent", "field": "caption", "value": caption}]))
    response = asyncio.run(respond_to_conversation(request(), client))
    assert response.result.operations[0].model_dump()["value"] == caption
    assert response.model == "test-returned-model"
    supplied = json.loads(str(client.fake.request["input"]))
    assert supplied["current"] == snapshot()
    assert supplied["history"][0]["text"].startswith("Option 1")
    assert supplied["summary"] == "Owner wants a short introduction."
    assert client.fake.request["model"] == "configured-model"


def test_discussion_and_safe_local_mode_do_not_emit_actions(monkeypatch: pytest.MonkeyPatch) -> None:
    response = asyncio.run(respond_to_conversation(request(), Client(result([]))))
    assert response.result.operations == []
    monkeypatch.setattr(settings, "ai_text_provider", "local")
    local = asyncio.run(respond_to_conversation(request()))
    assert local.result.operations == []
    assert local.result.generation == []
    assert local.result.conversion is None


@pytest.mark.parametrize(("field", "limit"), [("contentPillar", 160), ("campaignGoal", 500), ("tone", 200), ("brief", 1000)])
def test_details_field_limits_reject_the_whole_edit(field: str, limit: int) -> None:
    with pytest.raises(ValidationError):
        ConversationResult.model_validate(result([{"type": "updateContent", "field": field, "value": "x" * (limit + 1)}]))


@pytest.mark.parametrize("caption", ["🍊" * 2201, " ".join(f"#tag{i}" for i in range(31))])
def test_invalid_caption_is_rejected(caption: str) -> None:
    with pytest.raises(ValidationError):
        ConversationResult.model_validate(result([{"type": "updateContent", "field": "caption", "value": caption}]))


def test_stable_references_independent_reel_duration_and_targeted_generation() -> None:
    ops: list[dict[str, object]] = [
        {"type": "addReelBeat", "ref": "$beat", "text": "Show baking"},
        {"type": "updateReelBeat", "beatId": "$beat", "text": "Show fresh baking"},
        {"type": "reorderReelBeats", "orderedIds": ["$beat"]},
        {"type": "updateReelScript", "field": "intendedDurationSeconds", "value": 30},
        {"type": "updateMediaItem", "itemId": "637ba2d2-7ee7-4259-8397-c09cf3c2fc65", "field": "generationDurationSeconds", "value": 8},
    ]
    data = result(ops)
    data["generation"] = [{"itemId": "637ba2d2-7ee7-4259-8397-c09cf3c2fc65"}]
    client = Client(data)
    response = asyncio.run(respond_to_conversation(request(), client))
    assert response.result.model_dump()["operations"] == ops
    assert response.result.generation[0].itemId == "637ba2d2-7ee7-4259-8397-c09cf3c2fc65"
    instructions = str(client.fake.request["instructions"])
    for phrase in ["put each agreed value in its respective field", "confirmation only after saving", "no normal published Instagram caption", "cannot inspect images", "independent of"]:
        assert phrase in instructions
    schema = json.dumps(client.fake.request["text"])
    assert "anyOf" in schema
    assert "oneOf" not in schema


@pytest.mark.parametrize("operation", [
    {"type": "updateContent", "field": "status", "value": "PUBLISHED"},
    {"type": "updateContent", "field": "plannedAt", "value": "tomorrow"},
    {"type": "updateMediaItem", "itemId": "slide 2", "field": "title", "value": "Wrong"},
    {"type": "updateMediaItem", "itemId": "637ba2d2-7ee7-4259-8397-c09cf3c2fc65", "field": "mediaAssetId", "value": "library-id"},
    {"type": "deleteAsset", "assetId": "library-id"},
])
def test_unknown_actions_and_unstable_targets_rejected(operation: dict[str, object]) -> None:
    with pytest.raises(AiServiceError):
        asyncio.run(respond_to_conversation(request(), Client(result([operation]))))


def test_snapshot_rejects_storage_internals_and_legacy_result() -> None:
    with pytest.raises(ValidationError):
        AuthoringSnapshot.model_validate({**snapshot(), "storageKey": "private"})
    with pytest.raises(ValidationError):
        ConversationResult.model_validate({"reply": "Applied", "summary": "", "changes": {"carousel": []}})
