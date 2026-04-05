"""Stub authenticated POST /v1/ingest — NDJSON progress stream (Phase 1)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from brain_api.progress import format_line
from brain_api.settings import Settings


def get_settings() -> Settings:
    return Settings()


router = APIRouter(prefix="/v1", tags=["ingest"])

STUB_CAPTURE_DIR = "/tmp/stub/Captures/x"
STUB_CAPTURE_ID = "stub-id"


class IngestBody(BaseModel):
    url: str


def _ingest_auth_enabled(settings: Settings) -> bool:
    k = settings.ingest_api_key
    if k is None:
        return False
    return bool(str(k).strip())


def _stub_events() -> list[dict[str, str | int]]:
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
            "captureDir": STUB_CAPTURE_DIR,
            "captureId": STUB_CAPTURE_ID,
        },
    ]


async def _stub_ndjson_stream() -> AsyncIterator[bytes]:
    for ev in _stub_events():
        yield format_line(ev).encode("utf-8")


@router.post("/ingest", response_model=None)
async def ingest(
    body: IngestBody,
    settings: Annotated[Settings, Depends(get_settings)],
    x_ingest_key: Annotated[str | None, Header(alias="X-Ingest-Key")] = None,
) -> StreamingResponse | JSONResponse:
    if _ingest_auth_enabled(settings):
        if x_ingest_key is None or x_ingest_key != settings.ingest_api_key:
            return JSONResponse(
                status_code=401,
                content={"message": "Invalid or missing X-Ingest-Key"},
            )
    _ = body.url
    return StreamingResponse(
        _stub_ndjson_stream(),
        media_type="application/x-ndjson",
    )
