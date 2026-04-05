"""Capture bundle (mirror cli/src/types/capture.ts)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class ImageRef:
    url: str
    alt: str = ""


@dataclass
class CodeBlock:
    language: str
    code: str


@dataclass
class TranscriptSegment:
    text: str
    start_sec: float | None = None


@dataclass
class CaptureBundle:
    canonical_url: str
    title: str
    text_plain: str
    images: list[ImageRef] = field(default_factory=list)
    code_blocks: list[CodeBlock] = field(default_factory=list)
    fetched_at: str = field(default_factory=_iso_now)
    fetch_method: str = "http_readability"
    source: str | None = None
    youtube_video_id: str | None = None
    transcript_segments: list[TranscriptSegment] | None = None
    transcript_segments_vi: list[TranscriptSegment] | None = None
