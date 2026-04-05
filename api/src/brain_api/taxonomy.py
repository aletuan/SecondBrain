"""Category taxonomy from YAML (id + label)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from brain_api.settings import Settings

# api/src/brain_api/taxonomy.py → parents[0]=brain_api, [1]=src, [2]=api
_API_ROOT = Path(__file__).resolve().parents[2]


def default_categories_path() -> Path:
    return _API_ROOT / "config" / "categories.default.yaml"


def load_taxonomy(settings: Settings) -> list[dict[str, str]]:
    path = (
        settings.categories_config_path
        if settings.categories_config_path is not None
        else default_categories_path()
    )
    text = path.read_text(encoding="utf-8")
    raw: Any = yaml.safe_load(text)
    if not isinstance(raw, dict):
        raise ValueError("categories: root must be a mapping")
    items = raw.get("items")
    if not isinstance(items, list):
        raise ValueError("categories: items must be a list")

    out: list[dict[str, str]] = []
    for row in items:
        if not isinstance(row, dict):
            continue
        id_ = row.get("id")
        label = row.get("label")
        if not isinstance(id_, str) or not id_.strip():
            raise ValueError("categories: each item needs a non-empty string id")
        if not isinstance(label, str):
            raise ValueError("categories: each item needs a string label")
        out.append({"id": id_, "label": label})
    return out
