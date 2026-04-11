from __future__ import annotations

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_allow_origins: str = "http://localhost:3000"
    frontend_app_url: str = "http://localhost:3000"
    oauth_redirect_base_url: str = "http://localhost:3000"

    groq_api_key: str = ""
    groq_tts_model: str = "playai-tts"
    groq_tts_voice_en: str = "alloy"
    groq_tts_voice_hi: str = "alloy"
    groq_tts_voice_en_female: str = ""
    groq_tts_voice_en_male: str = ""
    groq_tts_voice_hi_female: str = ""
    groq_tts_voice_hi_male: str = ""
    openai_api_key: str = ""
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    default_model: str = "llama-3.3-70b-versatile"
    fallback_model: str = "gpt-5.4-mini"

    upstash_redis_rest_url: str = ""
    upstash_redis_rest_token: str = ""

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/omni"
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""
    qdrant_collection: str = "omni_memory"

    jwt_issuer: str = "omni-copilot"
    jwt_audience: str = "omni-copilot-api"
    jwt_secret: str = "replace-with-long-secret"

    google_client_id: str = ""
    google_client_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    notion_client_id: str = ""
    notion_client_secret: str = ""
    slack_client_id: str = ""
    slack_client_secret: str = ""
    discord_client_id: str = ""
    discord_client_secret: str = ""

    mem0_enabled: bool = False
    mem0_api_key: str = ""

    @field_validator("cors_allow_origins")
    @classmethod
    def normalize_origins(cls, value: str) -> str:
        return value.strip()

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allow_origins.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
