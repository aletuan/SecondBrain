"""Ingest progress v1 newline-delimited JSON (mirrors cli/src/ingest/ingestProgress.ts)."""

from __future__ import annotations

import json
from typing import Any

_PHASES = frozenset({"fetch", "translate", "vault", "llm"})


def format_line(ev: dict[str, Any]) -> str:
    """One JSON object + newline, as emitted on stderr for ``--progress-json``."""
    return f"{json.dumps(ev, separators=(',', ':'))}\n"


def try_parse_line(line: str) -> dict[str, Any] | None:
    t = line.strip()
    if not t.startswith("{"):
        return None
    try:
        o = json.loads(t)
    except json.JSONDecodeError:
        return None
    if not isinstance(o, dict):
        return None
    r = o
    if r.get("v") != 1:
        return None
    kind = r.get("kind")
    if kind == "phase":
        state = r.get("state")
        if state not in ("active", "done"):
            return None
        ph = r.get("phase")
        if ph not in _PHASES:
            return None
        return {"v": 1, "kind": "phase", "phase": ph, "state": state}
    if kind == "done":
        capture_dir = r.get("captureDir")
        capture_id = r.get("captureId")
        if not isinstance(capture_dir, str) or not isinstance(capture_id, str):
            return None
        return {"v": 1, "kind": "done", "captureDir": capture_dir, "captureId": capture_id}
    if kind == "error":
        message = r.get("message")
        if not isinstance(message, str):
            return None
        if "phase" in r:
            phase_val = r["phase"]
            if phase_val not in _PHASES:
                return None
            return {"v": 1, "kind": "error", "message": message, "phase": phase_val}
        return {"v": 1, "kind": "error", "message": message}
    return None
