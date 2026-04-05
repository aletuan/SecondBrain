"""collect_ingest_events error → NDJSON error line."""

from pathlib import Path

import pytest

from brain_api.ingest.run_ingest import collect_ingest_events
from brain_api.settings import Settings


def test_collect_emits_error_when_fetch_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    vault = tmp_path / "vault"
    vault.mkdir()
    monkeypatch.setenv("VAULT_ROOT", str(vault))
    monkeypatch.delenv("INGEST_API_KEY", raising=False)

    def _boom(*_a: object, **_k: object) -> None:
        raise RuntimeError("fetch failed")

    monkeypatch.setattr(
        "brain_api.ingest.run_ingest.fetch_capture_bundle",
        _boom,
    )

    events = collect_ingest_events(Settings(), url="https://example.com")
    assert events[-1]["kind"] == "error"
    assert "fetch failed" in str(events[-1]["message"])
