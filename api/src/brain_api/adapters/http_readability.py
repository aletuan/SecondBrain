"""HTTP fetch + Readability (mirror cli/src/adapters/httpReadability.ts)."""

from __future__ import annotations

from urllib.parse import urlparse, urlunparse

import httpx

from brain_api.normaliser import normalise_raw_html
from brain_api.types.capture import CaptureBundle


BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)


def ingest_http_readability(url: str) -> CaptureBundle:
    try:
        with httpx.Client(follow_redirects=True, timeout=60.0) as client:
            r = client.get(
                url,
                headers={
                    "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
                    "User-Agent": BROWSER_UA,
                },
            )
            r.raise_for_status()
            html = r.text
            page_url = str(r.request.url)
    except httpx.HTTPError as e:
        raise RuntimeError(f"http_readability: request failed for {url}: {e}") from e

    u = urlparse(page_url)
    canonical = urlunparse((u.scheme, u.netloc, u.path, u.params, u.query, u.fragment))
    return normalise_raw_html(html, canonical, "http_readability")
