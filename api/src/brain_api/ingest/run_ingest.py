"""Orchestrate ingest phases + vault write (mirror cli/src/ingest/runIngest.ts)."""

from __future__ import annotations

import logging
import os
import re
from collections.abc import Callable
from dataclasses import replace
from pathlib import Path
from typing import Any

from openai import OpenAI

from brain_api.config.load_routing import load_routing, resolve_strategy
from brain_api.ingest.fetch_bundle import fetch_capture_bundle
from brain_api.llm.enrich import enrich_note_sync, extract_tags_sync, resolve_enrich_model
from brain_api.llm.enrich_source import enrich_max_chars_from_env, truncate_source_for_enrich
from brain_api.llm.extract_categories import extract_categories_sync
from brain_api.llm.translate import translate_transcript_segments
from brain_api.routing_io import read_routing_yaml
from brain_api.settings import Settings
from brain_api.taxonomy import load_taxonomy
from brain_api.vault.writer import (
    add_tags_to_note_frontmatter,
    assert_capture_dir_under_vault,
    download_images_to_assets,
    get_capture_files,
    overwrite_capture_at_dir,
    read_ingest_url_from_capture_dir,
    set_categories_in_note_frontmatter,
    write_capture,
)

logger = logging.getLogger(__name__)


def _openai_key(settings: Settings) -> str:
    return (settings.openai_api_key or os.environ.get("OPENAI_API_KEY") or "").strip()


def _allowed_category_ids(settings: Settings) -> list[str]:
    items = load_taxonomy(settings)
    return sorted({str(x["id"]) for x in items}, key=lambda x: x.lower())


def emit_ingest_events(
    settings: Settings,
    emit: Callable[[dict[str, Any]], None],
    *,
    url: str | None = None,
    reingest_capture_dir: str | None = None,
) -> None:
    """Run ingest and push NDJSON-shaped dicts through ``emit`` as each phase advances."""
    vault_root = settings.vault_root.resolve()
    last_phase: str | None = None

    def phase(name: str, state: str) -> None:
        nonlocal last_phase
        if state == "active":
            last_phase = name
        emit({"v": 1, "kind": "phase", "phase": name, "state": state})

    try:
        capture_dir_abs: Path | None = None
        if reingest_capture_dir and str(reingest_capture_dir).strip():
            capture_dir_abs = assert_capture_dir_under_vault(
                vault_root,
                str(reingest_capture_dir).strip(),
            )
            ingest_url = read_ingest_url_from_capture_dir(capture_dir_abs)
        elif url and str(url).strip():
            ingest_url = str(url).strip()
        else:
            raise ValueError("provide url or reingest_capture_dir")

        cfg = load_routing(read_routing_yaml(settings))
        resolved = resolve_strategy(cfg, ingest_url)
        strategy = str(resolved["strategy"])
        apify = resolved.get("apify") if isinstance(resolved.get("apify"), dict) else None

        phase("fetch", "active")
        bundle = fetch_capture_bundle(ingest_url, strategy, apify, settings)
        phase("fetch", "done")

        api_key = _openai_key(settings)
        do_translate = (
            bundle.source == "youtube"
            and bool(bundle.transcript_segments)
            and bool(api_key)
        )

        if do_translate:
            phase("translate", "active")
            model = (
                (os.environ.get("YT_TRANSLATE_MODEL") or "").strip()
                or (os.environ.get("OPENAI_MODEL") or "").strip()
                or "gpt-4o-mini"
            )
            client = OpenAI(api_key=api_key)
            vi = translate_transcript_segments(
                bundle.transcript_segments or [],
                client=client,
                model=model,
            )
            bundle = replace(bundle, transcript_segments_vi=vi)
            phase("translate", "done")

        phase("vault", "active")
        if capture_dir_abs is not None:
            overwrite_capture_at_dir(capture_dir_abs, bundle)
            out_dir = capture_dir_abs
        else:
            out_dir, _rel = write_capture(vault_root, bundle)
        download_images_to_assets(bundle, out_dir)
        phase("vault", "done")

        source_path, note_path = get_capture_files(out_dir)
        source_raw = source_path.read_text(encoding="utf-8")
        body = re.sub(r"^---[\s\S]*?---\s*", "", source_raw, count=1)
        excerpt = truncate_source_for_enrich(body, enrich_max_chars_from_env())

        if api_key:
            phase("llm", "active")
            enrich_client = OpenAI(api_key=api_key)
            enrich_model = resolve_enrich_model()
            allowed = _allowed_category_ids(settings)
            enrich_note_sync(
                note_path=note_path,
                source_excerpt=excerpt,
                title=bundle.title,
                url=bundle.canonical_url,
                fetch_method=bundle.fetch_method,
                client=enrich_client,
            )
            tags = extract_tags_sync(excerpt, enrich_client, enrich_model)
            categories = extract_categories_sync(
                excerpt,
                enrich_client,
                enrich_model,
                allowed,
            )
            add_tags_to_note_frontmatter(note_path, tags)
            set_categories_in_note_frontmatter(note_path, categories)
            phase("llm", "done")

        capture_id = out_dir.name
        emit(
            {
                "v": 1,
                "kind": "done",
                "captureDir": str(out_dir.resolve()),
                "captureId": capture_id,
            },
        )
    except Exception as e:
        logger.exception("ingest failed (phase=%s)", last_phase)
        err: dict[str, Any] = {"v": 1, "kind": "error", "message": str(e)}
        if last_phase:
            err["phase"] = last_phase
        emit(err)


def collect_ingest_events(
    settings: Settings,
    *,
    url: str | None = None,
    reingest_capture_dir: str | None = None,
) -> list[dict[str, Any]]:
    """Collect all ingest events into a list (tests / synchronous consumers)."""
    events: list[dict[str, Any]] = []
    emit_ingest_events(
        settings,
        events.append,
        url=url,
        reingest_capture_dir=reingest_capture_dir,
    )
    return events
