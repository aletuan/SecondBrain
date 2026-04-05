"""YouTube transcript EN→VI batches (mirror cli/src/llm/translateTranscript.ts)."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Protocol

from brain_api.types.capture import TranscriptSegment

logger = logging.getLogger(__name__)

DEFAULT_SYSTEM = """You translate English transcript segments to Vietnamese.

Rules:
- Preserve conversational tone.
- Keep technical terms in English when standard (API, SaaS, Claude Code, Jira, etc.).
- Output EXACTLY one Vietnamese string per input line. Same count. Never merge or skip.
- Reply with a single JSON object only: {"lines":["trans1","trans2",...]} — same length as input. No markdown, no prose before or after.
- If a line is [Music] or similar, output the same."""


def _sanitize_control_chars(s: str) -> str:
    return re.sub(r"[\x00-\x1f\x7f]", " ", s)


def _strip_markdown_fence(raw: str) -> str:
    r = raw.strip()
    if not r.startswith("```"):
        return r
    lines = r.split("\n")
    without_first = "\n".join(lines[1:])
    end = without_first.find("```")
    r = (without_first if end == -1 else without_first[:end]).strip()
    return r


def extract_json_string_array(raw: str) -> list[str]:
    r = _strip_markdown_fence(raw.strip())

    def parse_value(s: str) -> list[str] | None:
        try:
            parsed: Any = json.loads(s)
        except json.JSONDecodeError as e:
            if "control" in str(e).lower() or "Invalid control" in str(e):
                try:
                    parsed = json.loads(_sanitize_control_chars(s))
                except json.JSONDecodeError:
                    return None
            else:
                return None
        if isinstance(parsed, list):
            return [str(x or "").strip() for x in parsed]
        if isinstance(parsed, dict):
            for key in ("lines", "translations", "vi"):
                v = parsed.get(key)
                if isinstance(v, list):
                    return [str(x or "").strip() for x in v]
        return None

    direct = parse_value(r)
    if direct:
        return direct

    depth = 0
    start = -1
    for i, c in enumerate(r):
        if c == "[":
            if depth == 0:
                start = i
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0 and start >= 0:
                inner = parse_value(r[start : i + 1])
                if inner:
                    return inner
    snippet = r[:220] + "…" if len(r) > 220 else r
    raise RuntimeError(
        'translateTranscript: expected JSON object {"lines":[...]} or JSON array in model output '
        f"(got: {re.sub(r'\s+', ' ', snippet)})",
    )


class _ChatCompletions(Protocol):
    def create(self, **kwargs: Any) -> Any: ...


class _OpenAIClient(Protocol):
    chat: Any


def batch_size_from_env_or(opt: int | None) -> int:
    if opt is not None and opt > 0:
        return int(opt)
    raw = os.environ.get("YT_TRANSLATE_BATCH")
    try:
        n = int(raw) if raw else 0
    except ValueError:
        n = 0
    if n > 0:
        return n
    return 20


def translate_transcript_segments(
    segments: list[TranscriptSegment],
    *,
    client: _OpenAIClient,
    model: str,
    system_prompt: str | None = None,
    batch_size: int | None = None,
) -> list[TranscriptSegment]:
    if not segments:
        return []
    system = system_prompt or DEFAULT_SYSTEM
    bs = batch_size_from_env_or(batch_size)
    out: list[TranscriptSegment] = []

    n_seg = len(segments)
    for i in range(0, n_seg, bs):
        batch = segments[i : i + bs]
        end = min(i + len(batch), n_seg)
        logger.info(
            "translate_transcript: batch %s–%s of %s segments (batch_size=%s)",
            i + 1,
            end,
            n_seg,
            bs,
        )
        texts = [s.text.strip() if s.text.strip() else " " for s in batch]
        user_content = (
            f"Translate these {len(texts)} lines to Vietnamese. Reply with JSON only: "
            '{{"lines":[...]}} with exactly '
            f"{len(texts)} strings (same order).\n\n"
            + "\n".join(f"{j + 1}. {t}" for j, t in enumerate(texts))
        )
        base_params: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
        }
        comp = client.chat.completions
        try:
            res = comp.create(**base_params, response_format={"type": "json_object"})
        except Exception as e:
            msg = str(e)
            if re.search(r"response_format|json_object|unsupported.*format", msg, re.I):
                res = comp.create(**base_params)
            else:
                raise
        raw = (res.choices[0].message.content or "").strip() if res.choices else ""
        if not raw:
            raise RuntimeError("translateTranscript: empty completion")
        arr = extract_json_string_array(raw)
        while len(arr) < len(texts):
            arr.append("")
        arr = arr[: len(texts)]
        for j, seg in enumerate(batch):
            vi = (arr[j] or "").strip() or seg.text
            out.append(TranscriptSegment(text=vi, start_sec=seg.start_sec))
    return out
