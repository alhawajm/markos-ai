from sentry_sdk import capture_exception as sentry_capture_exception
from sentry_sdk import flush as sentry_flush
from sentry_sdk import init as sentry_init
from sentry_sdk.integrations.fastapi import FastApiIntegration

from app.core.config import settings

_initialized = False


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
