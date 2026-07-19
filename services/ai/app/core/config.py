from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ai_port: int = 8000
    internal_service_token: str = "change-me"
    database_url: str = "postgresql://markos:markos@localhost:5432/markos"
    llm_primary_model: str = ""
    llm_flagship_model: str = ""
    llm_longform_model: str = ""
    llm_cheap_model: str = ""
    website_extraction_model: str = "local-website-extractor"
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536
    image_model_primary: str = ""
    image_model_fallback: str = ""
    sentry_dsn: str = ""
    sentry_environment: str = "development"
    sentry_release: str = ""
    sentry_traces_sample_rate: float = 0


settings = Settings()
