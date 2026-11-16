import asyncio

import pytest
from pydantic import ValidationError
from test_conversation import Client

from app.contracts.workspace_assistant import WorkspaceAssistantRequest, WorkspaceAssistantResult
from app.providers.workspace_assistant import respond_to_workspace


def test_workspace_chat_uses_business_context_and_returns_a_plan_without_execution() -> None:
    client = Client(
        {
            "reply": "Let’s make a post.",
            "proposal": {
                "action": "CONTENT",
                "summary": "A bakery photo and bilingual caption.",
                "instruction": "Create a post about the morning bake with an image and bilingual caption.",
                "contentType": "POST",
                "contentItemId": None,
                "durationDays": None,
                "startsAt":None,"publishesPerDay":None,
            },
        }
    )
    request = WorkspaceAssistantRequest(
        workspace_id="test",
        message="Make a post",
        locale="en",
        model="configured-model",
        context={"business": {"name": "Pearl"}},
        history=[],
    )
    response = asyncio.run(respond_to_workspace(request, client))
    assert response.result.proposal is not None
    assert response.result.proposal.action == "CONTENT"
    assert client.fake.request["model"] == "configured-model"
    assert "Pearl" in str(client.fake.request["input"])
    assert "one confirmation" in str(client.fake.request["instructions"])
    instructions = str(client.fake.request["instructions"])
    assert "duration" in instructions
    assert "frequency" in instructions
    assert "do not silently fill" in instructions
    assert response.prompt_version == "workspace-chat.v5"


def test_workspace_contract_cannot_publish_or_schedule() -> None:
    with pytest.raises(ValidationError):
        WorkspaceAssistantResult.model_validate(
            {
                "reply": "Publish",
                "proposal": {
                    "action": "PUBLISH",
                    "summary": "Publish",
                    "instruction": "Publish",
                    "contentType": "POST",
                    "contentItemId": None,
                    "durationDays": None,
                },
            }
        )


@pytest.mark.parametrize("message", [
    "Remember that I prefer Arabic first.", "تذكّر أنني أفضل العربية أولاً."
])
def test_workspace_memory_is_grounded_in_latest_user_evidence(message: str) -> None:
    client = Client({"reply": "Understood.", "proposal": None, "memoryUpdates": [{
        "key": "LANGUAGE", "operation": "REMEMBER", "text": "Arabic first.", "evidence": message
    }]})
    request = WorkspaceAssistantRequest(workspace_id="test", message=message, locale="en", model="configured-model",
        context={"personalization": {"preferences": [], "sharedGuidance": {"version": "test"}}})
    response = asyncio.run(respond_to_workspace(request, client))
    assert response.result.memoryUpdates[0].evidence == message
    instructions = str(client.fake.request["instructions"])
    assert "one-off edit" in instructions
    assert "exact verbatim evidence" in instructions
    assert "forgotten or superseded" in instructions
    assert "only the server" in instructions
