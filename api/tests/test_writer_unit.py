"""Vault writer helpers."""

from brain_api.types.capture import CaptureBundle, TranscriptSegment
from brain_api.vault.writer import build_source_markdown_body, short_id, slugify


def test_slugify_and_short_id() -> None:
    assert slugify("Hello World!!") == "hello-world"
    assert len(short_id("https://a.com")) == 6


def test_youtube_source_body_with_timestamps() -> None:
    b = CaptureBundle(
        canonical_url="https://www.youtube.com/watch?v=abcdefghijk",
        title="T",
        text_plain="fallback",
        fetch_method="apify",
        source="youtube",
        youtube_video_id="abcdefghijk",
        transcript_segments=[
            TranscriptSegment(text="a", start_sec=65.0),
            TranscriptSegment(text="b", start_sec=None),
        ],
    )
    md = build_source_markdown_body(b)
    assert "## Transcript (en)" in md
    assert "**1:05** a" in md
    assert "b" in md
