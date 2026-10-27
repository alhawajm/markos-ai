from sentry_sdk import capture_exception as sentry_capture_exception
from sentry_sdk import flush as sentry_flush
from sentry_sdk import init as sentry_init
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.types import Event, Hint

from app.core.config import settings

_initialized = False


def sanitize_event(event: Event, _hint: Hint) -> Event:
    """Only diagnostic identifiers reach monitoring; never prompts, files or credentials."""
    safe: Event = {}
    for key in ("event_id", "timestamp", "platform", "level", "release", "environment"):
        if key in event:
            safe[key] = event[key]
    exceptions = event.get("exception", {}).get("values", [])
    safe["exception"] = {"values": [
        {"type": value.get("type", "Error"), "value": "AI service error",
         "stacktrace": {"frames": [
             {key: frame[key] for key in ("filename", "function", "lineno", "colno", "in_app")
              if key in frame and key != "filename"} | (
                  {"filename": frame["filename"].split("?", 1)[0].split("#", 1)[0]}
                  if isinstance(frame.get("filename"), str) else {})
             for frame in value.get("stacktrace", {}).get("frames", [])
         ]}}
        for value in exceptions if isinstance(value, dict)
    ]}
    return safe


def init_observability() -> None:
    global _initialized

    if _initialized or not settings.sentry_dsn:
        return

    sentry_init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment,
        release=settings.sentry_release or None,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        integrations=[FastApiIntegration()],
        send_default_pii=False,
        max_request_body_size="never",
        before_send=sanitize_event,
        before_send_transaction=lambda _event, _hint: None,
    )
    _initialized = True


def observability_enabled() -> bool:
    return _initialized


def capture_exception(error: BaseException) -> None:
    if _initialized:
        sentry_capture_exception(error)


def flush_observability(timeout: float = 2.0) -> None:
    if _initialized:
        sentry_flush(timeout=timeout)
