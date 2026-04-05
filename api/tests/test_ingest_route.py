"""POST /v1/ingest: auth and NDJSON progress stream (pipeline mocked for CI)."""

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from brain_api.main import create_app
from brain_api.progress import try_parse_line
from brain_api.settings import Settings


@pytest.fixture
def vault_dir(tmp_path: Path) -> Path:
    v = tmp_path / "vault"
    v.mkdir()
    return v


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch, vault_dir: Path) -> TestClient:
    monkeypatch.setenv("VAULT_ROOT", str(vault_dir))
    monkeypatch.setenv("INGEST_API_KEY", "test")

    def fake_collect(
        settings: Settings,
        *,
        url: str | None = None,
        reingest_capture_dir: str | None = None,
    ) -> list[dict[str, Any]]:
        _ = url, reingest_capture_dir
        cap = settings.vault_root / "Captures" / "2026-04-05--stub-slug--abc123"
        cap.mkdir(parents=True, exist_ok=True)
        return [
            {"v": 1, "kind": "phase", "phase": "fetch", "state": "active"},
            {"v": 1, "kind": "phase", "phase": "fetch", "state": "done"},
            {"v": 1, "kind": "phase", "phase": "translate", "state": "active"},
            {"v": 1, "kind": "phase", "phase": "translate", "state": "done"},
            {"v": 1, "kind": "phase", "phase": "vault", "state": "active"},
            {"v": 1, "kind": "phase", "phase": "vault", "state": "done"},
            {"v": 1, "kind": "phase", "phase": "llm", "state": "active"},
            {"v": 1, "kind": "phase", "phase": "llm", "state": "done"},
            {
                "v": 1,
                "kind": "done",
                "captureDir": str(cap.resolve()),
                "captureId": cap.name,
            },
        ]

    monkeypatch.setattr(
        "brain_api.routes.ingest.collect_ingest_events",
        fake_collect,
    )
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
    assert "Captures" in dones[0]["captureDir"]
    assert dones[0]["captureId"] == "2026-04-05--stub-slug--abc123"


def test_ingest_reingest_capture_dir_alone_streams_stub(
    client: TestClient,
) -> None:
    r = client.post(
        "/v1/ingest",
        headers={"X-Ingest-Key": "test"},
        json={"reingest_capture_dir": "/tmp/Captures/foo"},
    )
    assert r.status_code == 200
    lines = [ln for ln in r.text.splitlines() if ln.strip()]
    dones = [try_parse_line(ln) for ln in lines]
    assert any(p and p.get("kind") == "done" for p in dones)


def test_ingest_neither_url_nor_reingest_422(client: TestClient) -> None:
    r = client.post(
        "/v1/ingest",
        headers={"X-Ingest-Key": "test"},
        json={},
    )
    assert r.status_code == 422
