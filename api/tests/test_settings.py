from pathlib import Path

import pytest
from pydantic import ValidationError

from brain_api.settings import Settings


def test_vault_root_required_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("VAULT_ROOT", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_vault_root_resolves_from_env(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    vault = tmp_path / "vault"
    vault.mkdir()
    monkeypatch.setenv("VAULT_ROOT", str(vault))
    s = Settings(_env_file=None)
    assert s.vault_root == vault.resolve()


def test_optional_paths_and_secrets(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    vault = tmp_path / "v"
    vault.mkdir()
    r = tmp_path / "routing.yaml"
    c = tmp_path / "categories.yaml"
    r.write_text("x: 1\n")
    c.write_text("y: 2\n")

    monkeypatch.setenv("VAULT_ROOT", str(vault))
    monkeypatch.setenv("ROUTING_CONFIG_PATH", str(r))
    monkeypatch.setenv("CATEGORIES_CONFIG_PATH", str(c))
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-openai")
    monkeypatch.setenv("INGEST_API_KEY", "secret-ingest")

    s = Settings(_env_file=None)
    assert s.vault_root == vault.resolve()
    assert s.routing_config_path == r.resolve()
    assert s.categories_config_path == c.resolve()
    assert s.openai_api_key == "sk-test-openai"
    assert s.ingest_api_key == "secret-ingest"


def test_apify_token_from_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    vault = tmp_path / "v"
    vault.mkdir()
    monkeypatch.setenv("VAULT_ROOT", str(vault))
    monkeypatch.setenv("APIFY_TOKEN", "apify_test_xxx")
    s = Settings(_env_file=None)
    assert s.apify_token == "apify_test_xxx"


def test_optional_paths_default_none(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    vault = tmp_path / "v"
    vault.mkdir()
    monkeypatch.setenv("VAULT_ROOT", str(vault))
    monkeypatch.delenv("ROUTING_CONFIG_PATH", raising=False)
    monkeypatch.delenv("CATEGORIES_CONFIG_PATH", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("INGEST_API_KEY", raising=False)
    monkeypatch.delenv("APIFY_TOKEN", raising=False)

    s = Settings(_env_file=None)
    assert s.routing_config_path is None
    assert s.categories_config_path is None
    assert s.openai_api_key is None
    assert s.ingest_api_key is None
    assert s.apify_token is None
