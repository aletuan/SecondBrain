"""Application settings from environment (pydantic-settings)."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    vault_root: Path
    routing_config_path: Path | None = None
    categories_config_path: Path | None = None
    openai_api_key: str | None = None
    # X API v2 app-only bearer (env: X_BEARER_TOKEN)
    x_bearer_token: str | None = None
    ingest_api_key: str | None = None
