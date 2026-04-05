"""Generic Apify website actor (mirror cli/src/adapters/apify.ts)."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse, urlunparse

from apify_client import ApifyClient

from brain_api.normaliser import bundle_from_parts
from brain_api.types.capture import CaptureBundle, ImageRef


def _canonical_href(url: str) -> str:
    u = urlparse(url)
    return urlunparse((u.scheme, u.netloc, u.path, u.params, u.query, u.fragment))


def ingest_apify(
    *,
    url: str,
    actor_id: str,
    token: str,
    build: str | None = None,
    client: ApifyClient | None = None,
) -> CaptureBundle:
    c = client or ApifyClient(token)
    run_input: dict[str, Any] = {"startUrls": [{"url": url}]}
    call_kw: dict[str, Any] = {"run_input": run_input}
    if build:
        call_kw["build"] = build
    run = c.actor(actor_id).call(**call_kw)
    if not isinstance(run, dict) or not run:
        raise RuntimeError("apify: actor call returned no run")
    ds_id = run.get("defaultDatasetId")
    if not ds_id:
        raise RuntimeError("apify: run missing defaultDatasetId")
    page = c.dataset(str(ds_id)).list_items(limit=10)
    items = list(getattr(page, "items", []) or [])
    row: dict[str, Any] = items[0] if items else {}
    text = ""
    if isinstance(row.get("text"), str) and row["text"]:
        text = str(row["text"])
    elif isinstance(row.get("markdown"), str) and row["markdown"]:
        text = str(row["markdown"])
    raw_title = row.get("title") if isinstance(row.get("title"), str) else ""
    title = (raw_title or "").strip() or urlparse_host(url)
    images: list[ImageRef] = []
    if isinstance(row.get("screenshotUrl"), str) and row["screenshotUrl"]:
        images.append(ImageRef(url=str(row["screenshotUrl"]), alt="screenshot"))
    return bundle_from_parts(
        canonical_url=_canonical_href(url),
        title=title,
        text_plain=text,
        images=images,
        fetch_method="apify",
    )


def urlparse_host(url: str) -> str:
    try:
        return urlparse(url).hostname or url
    except Exception:
        return url
