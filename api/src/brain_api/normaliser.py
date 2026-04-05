"""Normalise HTML / bundle parts (mirror cli/src/normaliser.ts)."""

from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from readability import Document

from brain_api.types.capture import CaptureBundle, CodeBlock, ImageRef


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def bundle_from_parts(
    *,
    canonical_url: str,
    fetch_method: str,
    title: str = "",
    text_plain: str = "",
    images: list[ImageRef] | None = None,
    code_blocks: list[CodeBlock] | None = None,
    fetched_at: str | None = None,
    source: str | None = None,
    youtube_video_id: str | None = None,
    transcript_segments: list | None = None,
    transcript_segments_vi: list | None = None,
) -> CaptureBundle:
    return CaptureBundle(
        canonical_url=canonical_url,
        title=title or "",
        text_plain=text_plain or "",
        images=list(images or []),
        code_blocks=list(code_blocks or []),
        fetched_at=fetched_at if fetched_at is not None else _iso_now(),
        fetch_method=fetch_method,
        source=source,
        youtube_video_id=youtube_video_id,
        transcript_segments=transcript_segments,
        transcript_segments_vi=transcript_segments_vi,
    )


def _collect_images_and_code(root: BeautifulSoup, base_url: str) -> tuple[list[ImageRef], list[CodeBlock]]:
    images: list[ImageRef] = []
    for img in root.find_all("img"):
        src = img.get("src")
        if not src or not isinstance(src, str):
            continue
        try:
            images.append(ImageRef(url=urljoin(base_url, src), alt=str(img.get("alt") or "")))
        except Exception:
            continue
    code_blocks: list[CodeBlock] = []
    for pre in root.find_all("pre"):
        code_el = pre.find("code")
        lang = "text"
        if code_el and code_el.get("class"):
            for c in code_el.get("class", []):
                if isinstance(c, str) and c.startswith("language-"):
                    lang = c.split("-", 1)[1] or "text"
                    break
        code = (code_el.get_text() if code_el else pre.get_text()).strip()
        if code:
            code_blocks.append(CodeBlock(language=lang, code=code))
    return images, code_blocks


def normalise_raw_html(html: str, page_url: str, fetch_method: str) -> CaptureBundle:
    """Parse article HTML with Readability into a :class:`CaptureBundle`."""
    canonical_url = page_url
    doc = Document(html)
    title = (doc.title() or "").strip()
    summary_html = doc.summary(html_partial=True) or ""
    if summary_html:
        soup = BeautifulSoup(summary_html, "lxml")
        body = soup.body or soup
        text_plain = " ".join(body.get_text(separator=" ", strip=True).split())
        images, code_blocks = _collect_images_and_code(body, canonical_url)
    else:
        soup = BeautifulSoup(html, "lxml")
        body = soup.body or soup
        ttxt = soup.title.get_text(strip=True) if soup.title else ""
        title = title or ttxt or canonical_url
        text_plain = " ".join(body.get_text(separator=" ", strip=True).split())
        images, code_blocks = _collect_images_and_code(body, canonical_url)

    return CaptureBundle(
        canonical_url=canonical_url,
        title=title or canonical_url,
        text_plain=text_plain,
        images=images,
        code_blocks=code_blocks,
        fetch_method=fetch_method,
    )
