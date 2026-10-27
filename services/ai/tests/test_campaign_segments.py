import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.providers.campaign import LocalCampaignProvider


@pytest.mark.parametrize(("total", "start", "length"), [(30, 29, 2), (60, 57, 4), (90, 85, 6)])
def test_final_window_has_every_requested_day_and_exact_intensity(monkeypatch: pytest.MonkeyPatch, total: int, start: int, length: int) -> None:
    monkeypatch.setattr("app.main.get_campaign_provider", lambda: LocalCampaignProvider())
    client = TestClient(app)
    headers = {"authorization": f"Bearer {settings.internal_service_token}"}
    common = {"workspace_id": "isolated-workspace", "publishes_per_day": 3, "starts_at": "2026-12-01T00:00:00Z", "locale": "ar",
              "context": [{"section": "COMPANY", "key": "profile", "value": {"name": "Event business"}}], "model": "configured-test-model"}
    first = client.post("/ai/campaigns/segment", headers=headers, json={**common, "duration_days": 7, "planning_context": {"total_duration_days": total, "start_day": 1}})
    assert first.status_code == 200
    outline = {key: value for key, value in first.json()["campaign"].items() if key not in {"durationDays", "publishesPerDay", "weeklyCadence"}}
    response = client.post("/ai/campaigns/segment", headers=headers, json={**common, "duration_days": length,
                           "planning_context": {"total_duration_days": total, "start_day": start, "outline": outline, "previous_weeks": ["Prior event awareness"]}})
    assert response.status_code == 200
    body = response.json()
    assert body["model"] == "configured-test-model"
    days = body["campaign"]["weeklyCadence"][0]["days"]
    assert [day["day"] for day in days] == list(range(1, length + 1))
    assert all(len(day["posts"]) == 3 for day in days)


def test_windows_require_authentication_and_valid_complete_boundaries() -> None:
    client = TestClient(app)
    assert client.post("/ai/campaigns/segment", json={}).status_code == 401
    base = {"workspace_id": "workspace", "duration_days": 7, "starts_at": "2026-12-01T00:00:00Z"}
    headers = {"authorization": f"Bearer {settings.internal_service_token}"}
    for planning in [{"total_duration_days": 30, "start_day": 2}, {"total_duration_days": 30, "start_day": 8}, {"total_duration_days": 30, "start_day": 29}]:
        assert client.post("/ai/campaigns/segment", headers=headers, json={**base, "planning_context": planning}).status_code == 422
    response = client.post("/ai/campaigns/generate", headers=headers, json={**base, "duration_days": 90})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "CAMPAIGN_QUEUE_REQUIRED"
