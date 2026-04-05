"""Authenticated POST /v1/ingest — NDJSON progress stream."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, model_validator

from brain_api.ingest.run_ingest import collect_ingest_events
from brain_api.progress import format_line
from brain_api.settings import Settings


def get_settings() -> Settings:
    return Settings()


router = APIRouter(prefix="/v1", tags=["ingest"])


class IngestBody(BaseModel):
    """Exactly one of `url` (new ingest) or `reingest_capture_dir` (absolute capture folder)."""

    url: str | None = None
    reingest_capture_dir: str | None = None

    @model_validator(mode="after")
    def _one_of(self) -> IngestBody:
        has_url = bool(self.url and str(self.url).strip())
        has_re = bool(self.reingest_capture_dir and str(self.reingest_capture_dir).strip())
        if has_url == has_re:
            raise ValueError("provide exactly one of url or reingest_capture_dir")
        return self


def _ingest_auth_enabled(settings: Settings) -> bool:
    k = settings.ingest_api_key
    if k is None:
        return False
    return bool(str(k).strip())


async def _ndjson_stream(events: list[dict[str, Any]]) -> AsyncIterator[bytes]:
    for ev in events:
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

    events = await asyncio.to_thread(
        collect_ingest_events,
        settings,
        url=body.url,
        reingest_capture_dir=body.reingest_capture_dir,
    )
    return StreamingResponse(
        _ndjson_stream(events),
        media_type="application/x-ndjson",
    )
