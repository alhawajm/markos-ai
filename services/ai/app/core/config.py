from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ai_port: int = 8000
    internal_service_token: str = "change-me"
    database_url: str = "postgresql://markos:markos@localhost:5432/markos"
    ai_text_provider: Literal["local", "openai"] = "local"
    ai_strategy_timeout_seconds: float = Field(default=20, gt=0, le=60)
    openai_api_key: SecretStr | None = None
    openai_timeout_seconds: float = Field(default=12, gt=0, le=60)
    openai_max_retries: int = Field(default=1, ge=0, le=3)
    openai_max_output_tokens: int = Field(default=4_000, ge=256, le=32_000)
    openai_reasoning_effort: Literal["none", "low", "medium", "high", "xhigh", "max"] = "low"
    llm_primary_model: str = ""
    llm_flagship_model: str = ""
    llm_longform_model: str = ""
    llm_cheap_model: str = ""
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536
    image_model_primary: str = ""
    image_model_fallback: str = ""
    sentry_dsn: str = ""
    sentry_environment: str = "development"
    sentry_release: str = ""
    sentry_traces_sample_rate: float = 0


settings = Settings()
