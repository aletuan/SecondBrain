"""Application settings from environment (pydantic-settings)."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# api/src/brain_api/settings.py → repo root and api/ (later file overrides)
_REPO_ROOT = Path(__file__).resolve().parents[3]
_API_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(
            str(_REPO_ROOT / ".env"),
            str(_API_ROOT / ".env"),
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    vault_root: Path
    routing_config_path: Path | None = None
    categories_config_path: Path | None = None
    openai_api_key: str | None = None
    # Apify API token (env: APIFY_TOKEN) — must be on Settings so repo-root `.env` is applied
    apify_token: str | None = None
    # X API v2 app-only bearer (env: X_BEARER_TOKEN)
    x_bearer_token: str | None = None
    ingest_api_key: str | None = None
