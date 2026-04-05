"""Apify YouTube row → transcript segments."""

from brain_api.adapters.youtube import transcript_from_apify_youtube_row


def test_transcript_from_segments_array() -> None:
    row = {
        "segments": [
            {"start": 0, "text": "Hello"},
            {"start": 1.5, "text": "World"},
        ],
    }
    text, segs = transcript_from_apify_youtube_row(row)
    assert "Hello" in text
    assert segs is not None
    assert len(segs) == 2
    assert segs[0].text == "Hello"
    assert segs[0].start_sec == 0.0
    assert segs[1].start_sec == 1.5


def test_transcript_fallback_fulltext() -> None:
    row = {"fullText": "Single block"}
    text, segs = transcript_from_apify_youtube_row(row)
    assert text == "Single block"
    assert segs is None
