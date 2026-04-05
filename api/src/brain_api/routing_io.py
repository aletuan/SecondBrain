"""Resolve routing YAML path (mirror cli/src/config/routingFile.ts + api defaults)."""

from __future__ import annotations

from pathlib import Path

from brain_api.settings import Settings

# brain_api/routing_io.py → parents[0]=brain_api, [1]=src, [2]=api
_API_ROOT = Path(__file__).resolve().parents[2]


def default_routing_path() -> Path:
    return _API_ROOT / "config" / "routing.default.yaml"


def routing_yaml_path(settings: Settings) -> Path:
    if settings.routing_config_path is not None:
        p = settings.routing_config_path
        if p.is_file():
            return p
    return default_routing_path()


def read_routing_yaml(settings: Settings) -> str:
    return routing_yaml_path(settings).read_text(encoding="utf-8")
