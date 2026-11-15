import asyncio

import pytest
from pydantic import ValidationError

from app.contracts.workspace_assistant import WorkspaceAssistantRequest, WorkspaceAssistantResult
from app.providers.workspace_assistant import respond_to_workspace
from tests.test_conversation import Client


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
