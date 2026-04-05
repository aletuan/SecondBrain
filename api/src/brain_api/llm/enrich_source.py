"""Truncate source body for LLM context (mirror cli/src/llm/enrichSource.ts)."""

from __future__ import annotations

import os

DEFAULT_ENRICH_MAX_CHARS = 12_000

_SEP = (
    "\n\n---\n*(Đoạn giữa đã lược bỏ để vừa giới hạn ngữ cảnh; ưu tiên phần đầu và phần cuối bài "
    "— thường chứa dẫn nhập và kết luận.)*\n---\n\n"
)


def enrich_max_chars_from_env() -> int:
    raw = os.environ.get("ENRICH_MAX_CHARS")
    try:
        n = int(raw) if raw else 0
    except ValueError:
        n = 0
    if 4000 <= n <= 200_000:
        return n
    return DEFAULT_ENRICH_MAX_CHARS


def truncate_source_for_enrich(body: str, max_chars: int) -> str:
    if len(body) <= max_chars:
        return body
    budget = max_chars - len(_SEP)
    if budget < 500:
        return body[:max_chars]
    head = int(budget * 0.62)
    tail = budget - head
    return body[:head] + _SEP + body[-tail:]
