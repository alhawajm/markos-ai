import logging

from pytest import LogCaptureFixture

from app.providers.openai_structured import log_provider_failure, safe_provider_detail


class FakeProviderError(Exception):
    type = "invalid_request_error"
    code = "invalid_prompt"
    param = "input"


def test_provider_failure_logs_only_safe_classification_fields(caplog: LogCaptureFixture) -> None:
    with caplog.at_level(logging.WARNING):
        log_provider_failure(FakeProviderError("provider message is not logged"), "test_schema")

    record = caplog.records[-1]
    assert "provider message is not logged" not in record.getMessage()
    assert "provider_error_type=invalid_request_error" in record.getMessage()
    assert "provider_code=invalid_prompt" in record.getMessage()
    assert "provider_param=input" in record.getMessage()


def test_provider_detail_rejects_unstructured_or_sensitive_values() -> None:
    assert safe_provider_detail("text.format.schema") == "text.format.schema"
    assert safe_provider_detail("input user-provided text") is None
    assert safe_provider_detail({"prompt": "not logged"}) is None
