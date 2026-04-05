"""Routing YAML load + resolve (mirror cli/src/config/loadRouting.ts)."""

import pytest

from brain_api.config.load_routing import load_routing, resolve_strategy

MINIMAL_ROUTING = """\
version: 1
defaultStrategy: http_readability
routes: []
"""


def test_load_routing_parses_valid_yaml() -> None:
    cfg = load_routing(MINIMAL_ROUTING)
    assert cfg["version"] == 1
    assert cfg["defaultStrategy"] == "http_readability"
    assert cfg["routes"] == []


def test_load_routing_invalid_version_fails() -> None:
    bad = """\
version: 2
defaultStrategy: http_readability
routes: []
"""
    with pytest.raises(ValueError, match="expected version: 1"):
        load_routing(bad)


def test_resolve_youtube_apify_merges_actor_and_route_fields() -> None:
    yaml_text = """\
version: 1
defaultStrategy: http_readability
apifyDefaults:
  actorId: apify/website-content-crawler
  build: "default-build"
routes:
  - match:
      hostSuffix: youtube.com
    strategy: apify
    apify:
      actorId: automation-lab/youtube-transcript
      youtubeInput: urls
      inputFromUrl: true
"""
    cfg = load_routing(yaml_text)
    out = resolve_strategy(cfg, "https://www.youtube.com/watch?v=abc")
    assert out["strategy"] == "apify"
    apify = out["apify"]
    assert apify is not None
    assert apify["actorId"] == "automation-lab/youtube-transcript"
    assert apify["youtubeInput"] == "urls"
    assert apify["inputFromUrl"] is True
    assert apify["build"] == "default-build"


def test_resolve_unknown_host_uses_default_strategy_without_apify() -> None:
    cfg = load_routing(MINIMAL_ROUTING)
    out = resolve_strategy(cfg, "https://totally-unknown.example.org/path")
    assert out["strategy"] == "http_readability"
    assert out.get("apify") is None
