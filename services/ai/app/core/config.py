from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ai_port: int = 8000
    internal_service_token: str = "change-me"
    database_url: str = "postgresql://markos:markos@localhost:5432/markos"
    ai_text_provider: Literal["local", "openai"] = "local"
    # `local` remains accepted as a legacy value, but it is deliberately disabled
    # by the provider factory. MARKOS must never represent a synthetic bitmap as
    # AI-generated media.
    ai_image_provider: Literal["disabled", "local", "openai"] = "disabled"
    ai_video_provider: Literal["disabled", "openai"] = "disabled"
    ai_campaign_timeout_seconds: float = Field(default=50, gt=0, le=60)
    ai_profile_timeout_seconds: float = Field(default=50, gt=0, le=60)
    ai_document_timeout_seconds: float = Field(default=50, gt=0, le=60)
    ai_content_timeout_seconds: float = Field(default=50, gt=0, le=60)
    ai_image_timeout_seconds: float = Field(default=120, gt=0, le=180)
    ai_video_timeout_seconds: float = Field(default=120, gt=0, le=180)
    openai_api_key: SecretStr | None = None
    openai_timeout_seconds: float = Field(default=45, gt=0, le=60)
    openai_max_retries: int = Field(default=1, ge=0, le=3)
    openai_max_output_tokens: int = Field(default=4_000, ge=256, le=32_000)
    openai_reasoning_effort: Literal["none", "low", "medium", "high", "xhigh", "max"] = "low"
    openai_store_responses: bool = True
    llm_primary_model: str = ""
    llm_flagship_model: str = ""
    llm_longform_model: str = ""
    llm_cheap_model: str = ""
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536
    image_model_primary: str = ""
    image_model_fallback: str = ""
    video_model_primary: str = ""
    sentry_dsn: str = ""
    sentry_environment: str = "development"
    sentry_release: str = ""
    sentry_traces_sample_rate: float = 0


settings = Settings()
