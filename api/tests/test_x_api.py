"""X API adapter unit tests (parity with cli/tests/adapters/xApi.test.ts)."""

from __future__ import annotations

from typing import Any

import pytest

from brain_api.adapters.x_api import (
    article_plain_text_from_api,
    extract_tweet_id_from_url,
    fetch_x_thread,
    ingest_linked_article_for_x,
    is_likely_x_content_block_or_error,
    pick_article_url_from_tweet,
    primary_tweet_text,
)


class MockResp:
    def __init__(
        self,
        *,
        status_code: int = 200,
        json_data: dict[str, Any] | None = None,
        text: str = "",
        url: str = "https://example.com",
        reason_phrase: str = "OK",
    ) -> None:
        self.status_code = status_code
        self._json = json_data
        self.text = text
        self.url = url
        self.reason_phrase = reason_phrase

    def json(self) -> Any:
        return self._json


def test_extract_tweet_id_from_url() -> None:
    assert extract_tweet_id_from_url("https://x.com/_avichawla/status/2034902650534187503") == (
        "2034902650534187503"
    )
    assert extract_tweet_id_from_url("https://twitter.com/foo/statuses/1234567890123456789") == (
        "1234567890123456789"
    )
    assert extract_tweet_id_from_url("https://mobile.twitter.com/bar/status/99") == "99"
    assert extract_tweet_id_from_url("https://x.com/i/web/status/2034902650534187503") == (
        "2034902650534187503"
    )
    assert extract_tweet_id_from_url("https://x.com/_avichawla") is None
    assert extract_tweet_id_from_url("not-a-url") is None


def test_pick_article_url_from_tweet() -> None:
    assert (
        pick_article_url_from_tweet(
            {
                "text": "https://t.co/x",
                "entities": {"urls": [{"expanded_url": "https://blog.example.com/post?x=1"}]},
            },
        )
        == "https://blog.example.com/post?x=1"
    )
    assert (
        pick_article_url_from_tweet(
            {
                "text": "x",
                "entities": {
                    "urls": [
                        {"expanded_url": "https://t.co/a", "unwound_url": "https://news.site/a"},
                    ],
                },
            },
        )
        == "https://news.site/a"
    )
    assert (
        pick_article_url_from_tweet(
            {
                "text": "hi",
                "entities": {"urls": [{"expanded_url": "https://twitter.com/foo/status/1"}]},
            },
        )
        is None
    )
    assert (
        pick_article_url_from_tweet(
            {
                "text": "https://t.co/HTVp6zvP3v",
                "entities": {"urls": [{"expanded_url": "https://x.com/i/article/2034896077460316163"}]},
            },
        )
        == "https://x.com/i/article/2034896077460316163"
    )
    assert (
        pick_article_url_from_tweet(
            {"text": "Read https://medium.com/p/abc — thanks", "entities": {}},
        )
        == "https://medium.com/p/abc"
    )
    assert (
        pick_article_url_from_tweet({"text": "https://t.co/HTVp6zvP3v", "entities": {}})
        == "https://t.co/HTVp6zvP3v"
    )
    assert (
        pick_article_url_from_tweet(
            {"text": "Read https://x.com/i/article/99 — thanks", "entities": {}},
        )
        == "https://x.com/i/article/99"
    )


def test_article_plain_text_from_api() -> None:
    assert len(article_plain_text_from_api({"title": "T", "text": "x" * 50}) or "") == 50
    md = article_plain_text_from_api({"title": "T", "markdown": "# Hi\n\n" + "p" * 40})
    assert md and "Hi" in md
    api_plain = "Body from X API v2 article.plain_text field. " * 2
    assert article_plain_text_from_api({"title": "T", "plain_text": api_plain}) == api_plain.strip()
    assert article_plain_text_from_api({"title": "Only title"}) is None


def test_primary_tweet_text() -> None:
    assert (
        "KV Caching"
        in primary_tweet_text(
            {
                "id": "1",
                "text": "Short https://t.co/x",
                "note_tweet": {
                    "text": "KV Caching in LLMs, Clearly Explained\n\nFull article body here.",
                },
            },
        )
    )
    assert primary_tweet_text({"id": "1", "text": "Only"}) == "Only"


def test_is_likely_x_content_block_or_error() -> None:
    assert is_likely_x_content_block_or_error(
        "Something went wrong, but don't fret — let's give it another shot. "
        "Some privacy related extensions may cause issues on x.com.",
    )
    assert not is_likely_x_content_block_or_error(
        "Bernie Sanders discusses AI policy with Claude.",
    )


def test_ingest_linked_article_og_description() -> None:
    shell_html = """<!doctype html><html><head>
      <meta property="og:title" content="Bernie on AI" />
      <meta property="og:description" content="Claude, this is Senator Bernie Sanders. We discuss AI and jobs." />
      <title>x</title>
      </head><body><div id="root"></div></body></html>"""

    def http_get(u: str, h: dict[str, str]) -> MockResp:
        return MockResp(
            text=shell_html,
            url="https://x.com/i/article/2034896077460316163",
        )

    b = ingest_linked_article_for_x("https://t.co/short", http_get=http_get)
    assert b.canonical_url == "https://x.com/i/article/2034896077460316163"
    assert "Senator Bernie Sanders" in b.text_plain


def test_ingest_linked_article_error_shell_no_og() -> None:
    shell_html = """<!doctype html><html><head><title>x</title></head><body>
      <p>Something went wrong, but don't fret — let's give it another shot.</p>
      </body></html>"""

    def http_get(u: str, h: dict[str, str]) -> MockResp:
        return MockResp(text=shell_html, url="https://x.com/i/article/1")

    with pytest.raises(RuntimeError, match="bot/error page"):
        ingest_linked_article_for_x("https://x.com/i/article/1", http_get=http_get)


def test_fetch_x_thread_missing_bearer(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("X_BEARER_TOKEN", "")
    with pytest.raises(ValueError, match="Configure X API"):
        fetch_x_thread("https://x.com/user/status/1")


def test_fetch_x_thread_tweet_only(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("X_BEARER_TOKEN", "test-bearer")

    def http_get(u: str, h: dict[str, str]) -> MockResp:
        assert "api.twitter.com" in u
        return MockResp(
            json_data={
                "data": {
                    "id": "111",
                    "text": "Hello world",
                    "author_id": "u1",
                    "created_at": "2026-03-20T12:00:00.000Z",
                    "entities": {},
                },
                "includes": {"users": [{"id": "u1", "username": "alice", "name": "Alice"}]},
            },
        )

    b = fetch_x_thread("https://x.com/alice/status/111", http_get=http_get)
    assert b.fetch_method == "x_api"
    assert b.text_plain == "Hello world"
    assert b.canonical_url == "https://x.com/alice/status/111"


def test_fetch_x_thread_linked_article(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("X_BEARER_TOKEN", "test-bearer")
    article_html = """<!doctype html><html><head><title>Article</title></head><body>
      <article><h1>Article Title</h1><p>Body paragraph.</p></article></body></html>"""

    def http_get(u: str, h: dict[str, str]) -> MockResp:
        if "api.twitter.com" in u:
            return MockResp(
                json_data={
                    "data": {
                        "id": "111",
                        "text": "https://t.co/x",
                        "author_id": "u1",
                        "created_at": "2026-03-20T12:00:00.000Z",
                        "entities": {"urls": [{"expanded_url": "https://blog.example.com/p/1"}]},
                    },
                    "includes": {"users": [{"id": "u1", "username": "alice", "name": "Alice"}]},
                },
            )
        if u.startswith("https://blog.example.com/"):
            return MockResp(text=article_html, url=u)
        raise AssertionError(f"unexpected fetch: {u}")

    b = fetch_x_thread("https://x.com/alice/status/111", http_get=http_get)
    assert b.fetch_method == "x_api"
    assert b.canonical_url == "https://blog.example.com/p/1"
    assert "## Tweet gốc (@alice)" in b.text_plain
    assert "https://x.com/alice/status/111" in b.text_plain
    assert "Body paragraph" in b.text_plain


def test_fetch_x_thread_note_tweet(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("X_BEARER_TOKEN", "test-bearer")
    calls: list[str] = []

    def http_get(u: str, h: dict[str, str]) -> MockResp:
        calls.append(u)
        if "api.twitter.com" in u:
            return MockResp(
                json_data={
                    "data": {
                        "id": "111",
                        "text": "Read my post https://t.co/x",
                        "author_id": "u1",
                        "created_at": "2026-03-20T12:00:00.000Z",
                        "entities": {"urls": [{"expanded_url": "https://x.com/i/article/99"}]},
                        "note_tweet": {
                            "text": "KV Caching in LLMs — full long-form content from the X API note_tweet field.",
                        },
                    },
                    "includes": {"users": [{"id": "u1", "username": "alice", "name": "Alice"}]},
                },
            )
        raise AssertionError(f"should not fetch non-API URL: {u}")

    b = fetch_x_thread("https://x.com/alice/status/111", http_get=http_get)
    assert len(calls) == 1
    assert b.canonical_url == "https://x.com/alice/status/111"
    assert "note_tweet field" in b.text_plain
    assert "KV Caching" in b.text_plain
    assert "KV Caching" in b.title


def test_fetch_x_thread_title_stub_cli_null(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("X_BEARER_TOKEN", "test-bearer")

    def http_get(u: str, h: dict[str, str]) -> MockResp:
        if "api.twitter.com" in u:
            return MockResp(
                json_data={
                    "data": {
                        "id": "111",
                        "text": "https://t.co/x",
                        "author_id": "u1",
                        "created_at": "2026-03-20T12:00:00.000Z",
                        "article": {"title": "KV Caching in LLMs, Clearly Explained"},
                        "entities": {
                            "urls": [
                                {
                                    "expanded_url": "http://x.com/i/article/2034896077460316163",
                                    "unwound_url": "https://x.com/i/article/2034896077460316163",
                                },
                            ],
                        },
                    },
                    "includes": {"users": [{"id": "u1", "username": "alice", "name": "Alice"}]},
                },
            )
        raise AssertionError(u)

    b = fetch_x_thread(
        "https://x.com/alice/status/111",
        http_get=http_get,
        twitter_cli_fetch=lambda _tid: None,
    )
    assert b.title == "KV Caching in LLMs, Clearly Explained"
    assert "KV Caching in LLMs" in b.text_plain
    assert "article.title" in b.text_plain


def test_fetch_x_thread_cli_full_article(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("X_BEARER_TOKEN", "test-bearer")

    def http_get(u: str, h: dict[str, str]) -> MockResp:
        if "api.twitter.com" in u:
            return MockResp(
                json_data={
                    "data": {
                        "id": "111",
                        "text": "https://t.co/x",
                        "author_id": "u1",
                        "created_at": "2026-03-20T12:00:00.000Z",
                        "article": {"title": "KV Caching in LLMs"},
                        "entities": {"urls": [{"expanded_url": "https://x.com/i/article/99"}]},
                    },
                    "includes": {"users": [{"id": "u1", "username": "alice", "name": "Alice"}]},
                },
            )
        raise AssertionError(u)

    b = fetch_x_thread(
        "https://x.com/alice/status/111",
        http_get=http_get,
        twitter_cli_fetch=lambda _tid: {
            "title": "KV Caching in LLMs, Clearly Explained",
            "text": "You must have seen it every time you use ChatGPT that the first token takes longer.",
        },
    )
    assert b.title == "KV Caching in LLMs, Clearly Explained"
    assert "first token takes longer" in b.text_plain
    assert "article.title" not in b.text_plain


def test_fetch_x_thread_api_plain_text_prefers_cli(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("X_BEARER_TOKEN", "test-bearer")
    api_body = "Plain text from API only — no image URLs here. " * 2

    def http_get(u: str, h: dict[str, str]) -> MockResp:
        if "api.twitter.com" in u:
            return MockResp(
                json_data={
                    "data": {
                        "id": "333",
                        "text": "https://t.co/x",
                        "author_id": "u1",
                        "created_at": "2026-03-20T12:00:00.000Z",
                        "article": {"title": "Article Title", "plain_text": api_body.strip()},
                        "entities": {"urls": [{"expanded_url": "https://x.com/i/article/99"}]},
                    },
                    "includes": {"users": [{"id": "u1", "username": "carol", "name": "Carol"}]},
                },
            )
        raise AssertionError(u)

    cli_calls: list[str] = []

    def cli(tid: str) -> dict[str, Any]:
        cli_calls.append(tid)
        return {
            "title": "From CLI",
            "text": "Rich markdown from GraphQL path with ![img](https://pbs.twimg.com/media/x.jpg).",
            "images": ["https://pbs.twimg.com/media/x.jpg"],
        }

    b = fetch_x_thread("https://x.com/carol/status/333", http_get=http_get, twitter_cli_fetch=cli)
    assert cli_calls == ["333"]
    assert "Rich markdown from GraphQL" in b.text_plain
    assert "Plain text from API only" not in b.text_plain
    assert len(b.images) == 1
    assert b.images[0].url == "https://pbs.twimg.com/media/x.jpg"
    assert b.title == "From CLI"


def test_fetch_x_thread_plain_text_fallback_when_cli_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("X_BEARER_TOKEN", "test-bearer")
    api_body = "Fallback body from article.plain_text when CLI is unavailable. " * 2

    def http_get(u: str, h: dict[str, str]) -> MockResp:
        if "api.twitter.com" in u:
            return MockResp(
                json_data={
                    "data": {
                        "id": "444",
                        "text": "https://t.co/x",
                        "author_id": "u1",
                        "created_at": "2026-03-20T12:00:00.000Z",
                        "article": {"title": "T", "plain_text": api_body.strip()},
                        "entities": {},
                    },
                    "includes": {"users": [{"id": "u1", "username": "dave", "name": "Dave"}]},
                },
            )
        raise AssertionError(u)

    cli_calls: list[str] = []

    def cli(tid: str) -> None:
        cli_calls.append(tid)
        return None

    b = fetch_x_thread("https://x.com/dave/status/444", http_get=http_get, twitter_cli_fetch=cli)
    assert cli_calls == ["444"]
    assert "Fallback body from article.plain_text" in b.text_plain
    assert b.images == []
