"""POST /v1/ingest: auth and NDJSON progress stub (TDD)."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from brain_api.main import create_app
from brain_api.progress import try_parse_line


@pytest.fixture
def vault_dir(tmp_path: Path) -> Path:
    v = tmp_path / "vault"
    v.mkdir()
    return v


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch, vault_dir: Path) -> TestClient:
    monkeypatch.setenv("VAULT_ROOT", str(vault_dir))
    monkeypatch.setenv("INGEST_API_KEY", "test")
    return TestClient(create_app())


def test_ingest_missing_key_returns_401_json_message(
    client: TestClient,
) -> None:
    r = client.post("/v1/ingest", json={"url": "https://example.com"})
    assert r.status_code == 401
    data = r.json()
    assert "message" in data
    assert isinstance(data["message"], str)


def test_ingest_wrong_key_returns_401(client: TestClient) -> None:
    r = client.post(
        "/v1/ingest",
        headers={"X-Ingest-Key": "wrong"},
        json={"url": "https://example.com"},
    )
    assert r.status_code == 401
    assert "message" in r.json()


def test_ingest_valid_key_streams_ndjson_progress(
    client: TestClient,
) -> None:
    r = client.post(
        "/v1/ingest",
        headers={"X-Ingest-Key": "test"},
        json={"url": "https://example.com"},
    )
    assert r.status_code == 200
    ct = r.headers.get("content-type", "")
    assert "application/x-ndjson" in ct or "text/plain" in ct

    body = r.text
    lines = [ln for ln in body.splitlines() if ln.strip()]
    assert len(lines) >= 2

    parsed = []
    for ln in lines:
        p = try_parse_line(ln)
        assert p is not None, f"unparseable line: {ln!r}"
        parsed.append(p)

    phases = [p for p in parsed if p.get("kind") == "phase"]
    assert len(phases) >= 1

    dones = [p for p in parsed if p.get("kind") == "done"]
    assert len(dones) == 1
    assert dones[0]["captureDir"] == "/tmp/stub/Captures/x"
    assert dones[0]["captureId"] == "stub-id"
