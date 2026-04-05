"""X / Twitter API v2 ingest (mirror cli/src/adapters/xApi.ts)."""

from __future__ import annotations

import json
import os
import re
import subprocess
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urlparse

import httpx

from brain_api.adapters.http_readability import BROWSER_UA
from brain_api.normaliser import bundle_from_parts, normalise_raw_html
from brain_api.settings import Settings
from brain_api.types.capture import CaptureBundle, ImageRef

X_ARTICLE_READABILITY_MIN_CHARS = 200
OG_DESC_MIN_CHARS = 40
MIN_ARTICLE_BODY_CHARS = 40


def _repo_root() -> Path:
    # api/src/brain_api/adapters/x_api.py → parents[4] = repo root
    return Path(__file__).resolve().parents[4]


def is_x_article_page_url(url_string: str) -> bool:
    try:
        u = urlparse(url_string)
        h = (u.hostname or "").replace("www.", "").lower()
        if h not in ("x.com", "twitter.com") and not h.endswith(".x.com"):
            return False
        return bool(re.match(r"^/i/article/\d+", u.path, re.I))
    except Exception:
        return False


def _decode_basic_html_entities(s: str) -> str:
    return (
        s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&nbsp;", " ")
    )


def _meta_content(html: str, attr: str, key: str) -> str | None:
    patterns = [
        re.compile(
            rf'<meta\s+{attr}=["\']{re.escape(key)}["\']\s+content=["\']([^"\']*)["\']',
            re.I,
        ),
        re.compile(
            rf'<meta\s+content=["\']([^"\']*)["\']\s+{attr}=["\']{re.escape(key)}["\']',
            re.I,
        ),
    ]
    for pat in patterns:
        m = pat.search(html)
        if m and m.group(1):
            return _decode_basic_html_entities(m.group(1))
    return None


def extract_open_graph_article(html: str) -> dict[str, str | None]:
    return {
        "title": _meta_content(html, "property", "og:title")
        or _meta_content(html, "name", "twitter:title"),
        "description": _meta_content(html, "property", "og:description")
        or _meta_content(html, "name", "twitter:description")
        or _meta_content(html, "name", "description"),
    }


def og_image_as_refs(html: str) -> list[ImageRef]:
    raw = (_meta_content(html, "property", "og:image") or "").strip()
    if not raw:
        return []
    try:
        pu = urlparse(raw)
        href = pu._replace(fragment="").geturl()
        return [ImageRef(url=href or raw, alt="Open Graph image")]
    except Exception:
        return []


def is_likely_x_content_block_or_error(text_plain: str) -> bool:
    t = text_plain.lower()
    if "privacy related extensions" in t and "x.com" in t:
        return True
    if "something went wrong" in t and "give it another shot" in t:
        return True
    if "couldn't log you in" in t or "could not log you in" in t:
        return True
    if "captcha" in t and "x.com" in t:
        return True
    return False


def _bundle_from_open_graph(
    final_url: str,
    meta: dict[str, str | None],
    from_reader: CaptureBundle,
    images: list[ImageRef],
) -> CaptureBundle:
    desc = (meta.get("description") or "").strip()
    title = (meta.get("title") or "").strip() or from_reader.title or final_url
    title = title.strip() or final_url
    return bundle_from_parts(
        canonical_url=final_url,
        title=title,
        text_plain=desc or from_reader.text_plain,
        images=images,
        code_blocks=[],
        fetched_at=from_reader.fetched_at,
        fetch_method="http_readability",
    )


def _response_final_url(r: Any) -> str:
    u = getattr(r, "url", None)
    if u is not None:
        return str(u)
    req = getattr(r, "request", None)
    if req is not None and getattr(req, "url", None) is not None:
        return str(req.url)
    return ""


def ingest_linked_article_for_x(
    article_url: str,
    *,
    http_get: Callable[[str, Mapping[str, str]], Any] | None = None,
) -> CaptureBundle:
    headers = {
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": BROWSER_UA,
    }

    def _get(u: str, h: Mapping[str, str]) -> Any:
        if http_get:
            return http_get(u, h)
        with httpx.Client(follow_redirects=True, timeout=60.0) as client:
            return client.get(u, headers=dict(h))

    try:
        res = _get(article_url, headers)
    except Exception as e:
        raise RuntimeError(f"x_linked_article: request failed for {article_url}: {e}") from e

    sc = getattr(res, "status_code", None)
    if sc is not None and sc != 200:
        raise RuntimeError(f"x_linked_article: HTTP {sc} for {article_url}")

    final_url = _response_final_url(res) or article_url
    html = res.text if hasattr(res, "text") else str(res.content or "")
    from_reader = normalise_raw_html(html, final_url, "http_readability")
    plain_len = len(re.sub(r"\s+", " ", from_reader.text_plain).strip())
    meta = extract_open_graph_article(html)
    desc = (meta.get("description") or "").strip()
    reader_bad = is_likely_x_content_block_or_error(from_reader.text_plain)
    is_article = is_x_article_page_url(final_url)
    thin = plain_len < X_ARTICLE_READABILITY_MIN_CHARS
    og_ok = len(desc) >= OG_DESC_MIN_CHARS

    if is_article and reader_bad and not og_ok:
        raise RuntimeError(
            "x_linked_article: X returned a bot/error page and Open Graph has no usable description. "
            "Retry later, open the article in a browser once, or use an Apify actor for X.",
        )

    if og_ok and (reader_bad or thin):
        imgs = og_image_as_refs(html)
        return _bundle_from_open_graph(
            final_url,
            meta,
            from_reader,
            imgs if imgs else from_reader.images,
        )

    return from_reader


def _require_bearer(settings: Settings | None = None) -> str:
    t = ""
    if settings is not None and settings.x_bearer_token:
        t = str(settings.x_bearer_token).strip()
    if not t:
        t = (os.environ.get("X_BEARER_TOKEN") or "").strip()
    if not t:
        raise ValueError(
            "Configure X API: set X_BEARER_TOKEN for X/Twitter URLs, or switch route to apify in "
            "config/routing.yaml.",
        )
    return t


def extract_tweet_id_from_url(url_string: str) -> str | None:
    try:
        u = urlparse(url_string)
        path = u.path
        m = re.search(r"/status(?:es)?/(\d+)", path)
        if m:
            return m.group(1)
        m = re.search(r"/i/(?:web/)?status/(\d+)", path)
        if m:
            return m.group(1)
        return None
    except Exception:
        return None


def _is_x_or_shortener_host(hostname: str) -> bool:
    h = hostname.lower()
    if h in (
        "t.co",
        "twitter.com",
        "www.twitter.com",
        "x.com",
        "www.x.com",
        "mobile.twitter.com",
        "mobile.x.com",
    ):
        return True
    return h.endswith(".twitter.com") or h.endswith(".x.com")


def pick_article_url_from_tweet(data: dict[str, Any]) -> str | None:
    text = str(data.get("text") or "")
    entities = data.get("entities") or {}
    urls = entities.get("urls") or []
    if not isinstance(urls, list):
        urls = []

    for u in urls:
        if not isinstance(u, dict):
            continue
        raw = (u.get("unwound_url") or u.get("expanded_url") or "").strip()
        if not raw:
            continue
        try:
            parsed = urlparse(raw)
            if parsed.scheme not in ("http", "https"):
                continue
            if is_x_article_page_url(parsed.geturl()):
                return parsed.geturl()
        except Exception:
            continue

    for u in urls:
        if not isinstance(u, dict):
            continue
        raw = (u.get("unwound_url") or u.get("expanded_url") or "").strip()
        if not raw:
            continue
        try:
            parsed = urlparse(raw)
            if parsed.scheme not in ("http", "https"):
                continue
            if _is_x_or_shortener_host(parsed.hostname or ""):
                continue
            return parsed.geturl()
        except Exception:
            continue

    from_text = re.findall(r"https?://[^\s<>\"{}|\\^`[\]]+", text, re.I) or []
    for raw in from_text:
        try:
            parsed = urlparse(re.sub(r"[),.;]+$", "", raw))
            if parsed.scheme not in ("http", "https"):
                continue
            if is_x_article_page_url(parsed.geturl()):
                return parsed.geturl()
        except Exception:
            continue

    for raw in from_text:
        try:
            parsed = urlparse(re.sub(r"[),.;]+$", "", raw))
            if parsed.scheme not in ("http", "https"):
                continue
            if _is_x_or_shortener_host(parsed.hostname or ""):
                continue
            return parsed.geturl()
        except Exception:
            continue

    for raw in from_text:
        try:
            parsed = urlparse(re.sub(r"[),.;]+$", "", raw))
            if (parsed.hostname or "").lower() == "t.co":
                return parsed.geturl()
        except Exception:
            continue

    return None


def primary_tweet_text(data: dict[str, Any]) -> str:
    short_text = str(data.get("text") or "").strip()
    note = data.get("note_tweet")
    note_text = ""
    if isinstance(note, dict):
        note_text = str(note.get("text") or "").strip()
    if note_text and len(note_text) > len(short_text):
        return note_text
    return str(data.get("text") or "")


def article_plain_text_from_api(article: Any) -> str | None:
    if not article or not isinstance(article, dict):
        return None
    for k in (
        "text",
        "content",
        "plain_text",
        "body",
        "markdown",
        "description",
        "article_text",
    ):
        v = article.get(k)
        if isinstance(v, str) and len(v.strip()) >= MIN_ARTICLE_BODY_CHARS:
            return v.strip()
    return None


def article_title_from_api(article: Any) -> str:
    if not article or not isinstance(article, dict):
        return ""
    t = article.get("title")
    return str(t).strip() if isinstance(t, str) else ""


def https_article_link(url: str) -> str:
    try:
        u = urlparse(url)
        h = (u.hostname or "").replace("www.", "").lower()
        if u.scheme == "http" and re.match(r"^(x|twitter)\.com$", h):
            return u._replace(scheme="https").geturl()
        return u.geturl()
    except Exception:
        return url


def _pick_article_url_for_tweet(data: dict[str, Any]) -> str | None:
    short_pick = pick_article_url_from_tweet(
        {"text": str(data.get("text") or ""), "entities": data.get("entities") or {}},
    )
    if short_pick:
        return short_pick
    note = data.get("note_tweet")
    if isinstance(note, dict):
        return pick_article_url_from_tweet(
            {"text": str(note.get("text") or ""), "entities": note.get("entities") or {}},
        )
    return None


def title_from_long_post(text: str, username: str, display_name: str | None = None) -> str:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    line = lines[0] if lines else ""
    if line and len(line) <= 120:
        return line
    slice_ = (line or text)[:80].strip()
    base = f"@{username} — {display_name}" if display_name else f"@{username}"
    return f"{base}: {slice_}" if slice_ else f"{base} — post"


def fetch_x_article_via_twitter_cli(tweet_id: str) -> dict[str, Any] | None:
    script = _repo_root() / "scripts" / "fetch-x-article.py"
    if not script.is_file():
        return None
    try:
        r = subprocess.run(
            ["uv", "run", "--with", "twitter-cli", "python3", str(script), tweet_id],
            capture_output=True,
            text=True,
            timeout=60,
            env=os.environ.copy(),
            cwd=str(_repo_root()),
        )
        parsed = json.loads(r.stdout or "{}")
        if not parsed.get("ok") or not parsed.get("text"):
            return None
        return {
            "title": str(parsed.get("title") or ""),
            "text": str(parsed["text"]),
            "images": list(parsed.get("images") or []),
        }
    except Exception:
        return None


def fetch_x_thread(
    url: str,
    *,
    settings: Settings | None = None,
    http_get: Callable[[str, Mapping[str, str]], Any] | None = None,
    twitter_cli_fetch: Callable[[str], dict[str, Any] | None] | None = None,
) -> CaptureBundle:
    token = _require_bearer(settings)
    tweet_id = extract_tweet_id_from_url(url)
    if not tweet_id:
        raise ValueError(
            "X API: could not parse tweet id from URL. Expected …/status/<id> (x.com or twitter.com).",
        )

    def _get(u: str, headers: Mapping[str, str]) -> Any:
        if http_get:
            return http_get(u, headers)
        with httpx.Client(follow_redirects=True, timeout=60.0) as client:
            return client.get(u, headers=dict(headers))

    cli_fetch = twitter_cli_fetch or fetch_x_article_via_twitter_cli

    params = {
        "tweet.fields": "created_at,author_id,text,entities,note_tweet,article",
        "expansions": "author_id",
        "user.fields": "username,name",
    }
    api_url = f"https://api.twitter.com/2/tweets/{tweet_id}?{urlencode(params)}"

    try:
        res = _get(api_url, {"Authorization": f"Bearer {token}"})
    except Exception as e:
        raise RuntimeError(f"X API: network error calling Twitter — {e}") from e

    try:
        json_body = res.json() if callable(getattr(res, "json", None)) else json.loads(res.text)
    except Exception as e:
        sc = getattr(res, "status_code", "?")
        raise RuntimeError(f"X API: invalid JSON from Twitter ({sc}) — {e}") from e

    sc = getattr(res, "status_code", 0)
    if sc != 200:
        errors = json_body.get("errors") if isinstance(json_body, dict) else None
        detail = ""
        if isinstance(errors, list):
            detail = "; ".join(
                str(e.get("detail") or e.get("title") or "")
                for e in errors
                if isinstance(e, dict)
            )
        detail = detail or str(getattr(res, "reason_phrase", "") or "") or str(sc)
        raise RuntimeError(f"X API: tweet lookup failed ({sc}): {detail}")

    data = json_body.get("data") if isinstance(json_body, dict) else None
    if not isinstance(data, dict):
        raise RuntimeError("X API: empty response (tweet missing or inaccessible)")

    includes = json_body.get("includes") if isinstance(json_body, dict) else {}
    users = includes.get("users") if isinstance(includes, dict) else []
    author = None
    if isinstance(users, list):
        aid = data.get("author_id")
        for u in users:
            if isinstance(u, dict) and str(u.get("id")) == str(aid):
                author = u
                break

    username = str(author.get("username") or "user") if isinstance(author, dict) else "user"
    tweet_permalink = f"https://x.com/{username}/status/{data['id']}"
    body_text = primary_tweet_text(data)
    tweet_header = f"## Tweet gốc (@{username})\n{tweet_permalink}\n\n{body_text}\n"

    short_text = str(data.get("text") or "")
    note_obj = data.get("note_tweet")
    note_text = ""
    if isinstance(note_obj, dict):
        note_text = str(note_obj.get("text") or "").strip()
    has_api_long_form = len(note_text) > len(short_text)

    created_at = str(data.get("created_at") or "")

    if has_api_long_form:
        display_name = str(author.get("name") or "") if isinstance(author, dict) else ""
        return bundle_from_parts(
            canonical_url=tweet_permalink,
            title=title_from_long_post(note_text, username, display_name or None),
            text_plain=f"## Post (@{username})\n{tweet_permalink}\n\n{note_text}\n",
            fetch_method="x_api",
            fetched_at=created_at or None,
        )

    api_article = data.get("article")
    article_body = article_plain_text_from_api(api_article)
    article_title = article_title_from_api(api_article)
    has_article_card = api_article is not None and isinstance(api_article, dict)

    if article_body and len(article_body) > len(short_text):
        cli_result = cli_fetch(tweet_id)
        if cli_result and cli_result.get("text"):
            t = (
                cli_result.get("title")
                or article_title
                or title_from_long_post(
                    str(cli_result.get("text")),
                    username,
                    str(author.get("name") or "") if isinstance(author, dict) else None,
                )
            )
            imgs = cli_result.get("images") or []
            image_refs = [
                ImageRef(url=str(u), alt="") for u in imgs if isinstance(u, str) and u.strip()
            ]
            return bundle_from_parts(
                canonical_url=tweet_permalink,
                title=str(t),
                text_plain=(
                    f"## X Article (@{username})\n{tweet_permalink}\n\n# {t}\n\n"
                    f"{cli_result['text']}\n"
                ),
                images=image_refs,
                fetch_method="x_api",
                fetched_at=created_at or None,
            )
        t = article_title or title_from_long_post(
            article_body,
            username,
            str(author.get("name") or "") if isinstance(author, dict) else None,
        )
        return bundle_from_parts(
            canonical_url=tweet_permalink,
            title=str(t),
            text_plain=(
                f"## X Article (@{username})\n{tweet_permalink}\n\n"
                f"# {article_title or t}\n\n{article_body}\n"
            ),
            fetch_method="x_api",
            fetched_at=created_at or None,
        )

    if has_article_card and article_title:
        cli_result = cli_fetch(tweet_id)
        if cli_result and cli_result.get("text"):
            ct = cli_result.get("title") or article_title
            imgs = cli_result.get("images") or []
            image_refs = [
                ImageRef(url=str(u), alt="") for u in imgs if isinstance(u, str) and u.strip()
            ]
            return bundle_from_parts(
                canonical_url=tweet_permalink,
                title=str(ct),
                text_plain=(
                    f"## X Article (@{username})\n{tweet_permalink}\n\n"
                    f"# {cli_result.get('title') or article_title}\n\n{cli_result['text']}\n"
                ),
                images=image_refs,
                fetch_method="x_api",
                fetched_at=created_at or None,
            )

        art_url = _pick_article_url_for_tweet(data)
        link = https_article_link(art_url) if art_url else ""
        lines = [
            f"## X Article (@{username})",
            tweet_permalink,
            "",
            f"# {article_title}",
            "",
            "_API chỉ trả `article.title`. twitter-cli cũng không lấy được body. "
            "Mở bài trên trình duyệt để đọc đầy đủ._",
        ]
        if link:
            lines.extend(["", f"[Article]({link})"])
        lines.append("")
        return bundle_from_parts(
            canonical_url=tweet_permalink,
            title=article_title,
            text_plain="\n".join(lines),
            fetch_method="x_api",
            fetched_at=created_at or None,
        )

    article_url = _pick_article_url_for_tweet(data)
    if not article_url:
        title = (
            f"@{username} — {author.get('name')}"
            if isinstance(author, dict) and author.get("name")
            else f"@{username} — post {data['id']}"
        )
        return bundle_from_parts(
            canonical_url=tweet_permalink,
            title=str(title),
            text_plain=body_text,
            fetch_method="x_api",
            fetched_at=created_at or None,
        )

    if is_x_article_page_url(article_url):
        cli_result = cli_fetch(tweet_id)
        if cli_result and cli_result.get("text"):
            imgs = cli_result.get("images") or []
            image_refs = [
                ImageRef(url=str(u), alt="") for u in imgs if isinstance(u, str) and u.strip()
            ]
            cli_title = cli_result.get("title") or f"@{username} — X Article"
            return bundle_from_parts(
                canonical_url=tweet_permalink,
                title=str(cli_title),
                text_plain=(
                    f"## X Article (@{username})\n{tweet_permalink}\n\n"
                    f"# {cli_result.get('title') or 'X Article'}\n\n{cli_result['text']}\n"
                ),
                images=image_refs,
                fetch_method="x_api",
                fetched_at=created_at or None,
            )
        link = https_article_link(article_url)
        return bundle_from_parts(
            canonical_url=tweet_permalink,
            title=f"@{username} — X Article",
            text_plain="\n".join(
                [
                    f"## X Article (@{username})",
                    tweet_permalink,
                    "",
                    "Không có `article` đủ từ API; twitter-cli cũng không lấy được. Mở trên trình duyệt.",
                    f"[Article]({link})",
                ]
            ),
            fetch_method="x_api",
            fetched_at=created_at or None,
        )

    try:
        article = ingest_linked_article_for_x(article_url, http_get=http_get)
    except Exception as e:
        raise RuntimeError(
            f"X API: tweet links to {article_url} but article could not be loaded — {e}",
        ) from e

    display_name = str(author.get("name") or "") if isinstance(author, dict) else ""
    art_title = article.title or f"From @{username}: {tweet_permalink}"
    merged_text = f"{tweet_header}\n---\n\n{article.text_plain}"
    return bundle_from_parts(
        canonical_url=article.canonical_url,
        title=art_title,
        text_plain=merged_text,
        images=article.images,
        code_blocks=article.code_blocks or [],
        fetch_method="x_api",
        fetched_at=created_at or article.fetched_at,
    )
