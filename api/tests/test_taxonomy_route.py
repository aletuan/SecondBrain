"""GET /v1/taxonomy/categories."""

import json
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from brain_api.main import create_app


def _expected_items_from_default_file() -> list[dict[str, str]]:
    cfg = Path(__file__).resolve().parents[1] / "config" / "categories.default.yaml"
    data = yaml.safe_load(cfg.read_text(encoding="utf-8"))
    items = data["items"]
    return [{"id": x["id"], "label": x["label"]} for x in items]


def test_get_taxonomy_categories_200_json_items_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("VAULT_ROOT", "/tmp")
    monkeypatch.delenv("CATEGORIES_CONFIG_PATH", raising=False)
    monkeypatch.delenv("INGEST_API_KEY", raising=False)

    expected = _expected_items_from_default_file()
    client = TestClient(create_app())
    r = client.get("/v1/taxonomy/categories")
    assert r.status_code == 200
    data = r.json()
    assert data == {"items": expected}
    assert r.headers.get("content-type", "").startswith("application/json")


def test_get_taxonomy_categories_json_serializable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("VAULT_ROOT", "/tmp")
    monkeypatch.delenv("CATEGORIES_CONFIG_PATH", raising=False)
    monkeypatch.delenv("INGEST_API_KEY", raising=False)

    client = TestClient(create_app())
    r = client.get("/v1/taxonomy/categories")
    assert r.status_code == 200
    json.loads(r.content.decode("utf-8"))
