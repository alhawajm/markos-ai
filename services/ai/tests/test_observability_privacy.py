import json

from app.core.observability import sanitize_event


def test_monitoring_never_retains_prompts_requests_or_frame_locals() -> None:
    event = {
        "event_id": "diagnostic-1",
        "level": "error",
        "request": {"data": "PRIVATE_PROMPT", "url": "/call?token=PRIVATE_TOKEN"},
        "extra": {"files": "PRIVATE_DOCUMENT"},
        "exception": {"values": [{
            "type": "ProviderError", "value": "PRIVATE_TOKEN",
            "stacktrace": {"frames": [{
                "filename": "/app/provider.py?secret=PRIVATE_TOKEN", "lineno": 20,
                "vars": {"prompt": "PRIVATE_PROMPT"}, "context_line": "PRIVATE_DOCUMENT",
            }]},
        }]},
    }
    safe = sanitize_event(event, {})
    for secret in ("PRIVATE_PROMPT", "PRIVATE_TOKEN", "PRIVATE_DOCUMENT"):
        assert secret not in json.dumps(safe)
    assert safe["exception"]["values"][0]["stacktrace"]["frames"][0] == {
        "filename": "/app/provider.py", "lineno": 20,
    }
