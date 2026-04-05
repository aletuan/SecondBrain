"""Authenticated POST /v1/ingest — NDJSON progress stream."""

from __future__ import annotations

import asyncio
import threading
from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, model_validator

from brain_api.ingest.run_ingest import emit_ingest_events
from brain_api.progress import format_line
from brain_api.settings import Settings

_STREAM_END = object()


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


async def _live_ndjson_stream(
    settings: Settings,
    url: str | None,
    reingest_capture_dir: str | None,
) -> AsyncIterator[bytes]:
    """Yield each progress line as ingest runs (worker thread + asyncio.Queue).

    Previously the route buffered the full ingest via ``asyncio.to_thread(collect_ingest_events)``,
    then streamed — clients received all phase lines at once after completion, so the reader UI
    could not highlight the active step.
    """
    loop = asyncio.get_running_loop()
    q: asyncio.Queue[Any] = asyncio.Queue()

    def emit(ev: dict[str, Any]) -> None:
        fut = asyncio.run_coroutine_threadsafe(q.put(ev), loop)
        fut.result()

    def worker() -> None:
        try:
            emit_ingest_events(
                settings,
                emit,
                url=url,
                reingest_capture_dir=reingest_capture_dir,
            )
        finally:
            asyncio.run_coroutine_threadsafe(q.put(_STREAM_END), loop)

    threading.Thread(target=worker, daemon=True).start()

    while True:
        item = await q.get()
        if item is _STREAM_END:
            break
        yield format_line(item).encode("utf-8")


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

    return StreamingResponse(
        _live_ndjson_stream(settings, body.url, body.reingest_capture_dir),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
        },
    )
