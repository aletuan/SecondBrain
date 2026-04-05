"""Resolve routing and fetch :class:`CaptureBundle` (mirror cli/src/ingest/runIngest.ts)."""

from __future__ import annotations

import os
import re
from typing import Any
from urllib.parse import urlparse

from brain_api.adapters.apify_generic import ingest_apify
from brain_api.adapters.http_readability import ingest_http_readability
from brain_api.adapters.x_api import fetch_x_thread
from brain_api.adapters.youtube import extract_youtube_video_id, ingest_youtube_via_apify
from brain_api.settings import Settings
from brain_api.types.capture import CaptureBundle


def _is_youtube_url(url: str) -> bool:
    if extract_youtube_video_id(url):
        return True
    try:
        h = (urlparse(url).hostname or "").lower()
        return bool(re.search(r"youtube\.com|youtu\.be", h))
    except Exception:
        return False


def fetch_capture_bundle(
    url: str,
    strategy: str,
    apify_cfg: dict[str, Any] | None,
    settings: Settings | None = None,
) -> CaptureBundle:
    if strategy == "http_readability":
        return ingest_http_readability(url)
    if strategy == "x_api":
        return fetch_x_thread(url, settings=settings)
    if strategy == "apify":
        token = (
            ((settings.apify_token if settings else None) or os.environ.get("APIFY_TOKEN") or "")
            .strip()
        )
        if not token:
            raise ValueError("APIFY_TOKEN is required for Apify routes")
        if not apify_cfg or not apify_cfg.get("actorId"):
            raise ValueError("routing: missing apify actorId")
        actor_id = str(apify_cfg["actorId"])
        build = apify_cfg.get("build")
        build_s = str(build).strip() if build else None
        raw_yi = apify_cfg.get("youtubeInput")
        yi = str(raw_yi).strip() if raw_yi else None
        if yi not in ("start_urls", "urls"):
            yi = None
        if _is_youtube_url(url):
            return ingest_youtube_via_apify(
                url=url,
                actor_id=actor_id,
                token=token,
                build=build_s,
                youtube_input=yi,
            )
        return ingest_apify(
            url=url,
            actor_id=actor_id,
            token=token,
            build=build_s,
        )
    raise ValueError(f"unknown strategy: {strategy}")
