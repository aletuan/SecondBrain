"""Load routing YAML and resolve fetch strategy per URL (mirror cli/src/config/loadRouting.ts)."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import yaml


def load_routing(yaml_text: str) -> dict[str, Any]:
    raw = yaml.safe_load(yaml_text)
    if not isinstance(raw, dict):
        raise ValueError("routing: root must be a mapping")
    if raw.get("version") != 1:
        raise ValueError("routing: expected version: 1")
    if not raw.get("defaultStrategy"):
        raise ValueError("routing: missing defaultStrategy")
    if not isinstance(raw.get("routes"), list):
        raise ValueError("routing: routes must be an array")
    return raw


def _host_matches(hostname: str, suffix: str) -> bool:
    if suffix == "*":
        return True
    return hostname == suffix or hostname.endswith(f".{suffix}")


def _path_matches(pathname: str, prefix: str | None) -> bool:
    if prefix is None or prefix == "":
        return True
    with_slash = prefix if prefix.endswith("/") else f"{prefix}/"
    return pathname == prefix or pathname.startswith(with_slash) or pathname.startswith(prefix)


def _merge_apify(
    apify_defaults: dict[str, Any] | None,
    route_apify: dict[str, Any] | None,
) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if apify_defaults:
        out.update(apify_defaults)
    if route_apify:
        out.update(route_apify)
    return out


def resolve_strategy(config: dict[str, Any], url_string: str) -> dict[str, Any]:
    try:
        parsed = urlparse(url_string)
    except ValueError as e:
        raise ValueError(f"resolveStrategy: invalid URL: {url_string}") from e
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"resolveStrategy: invalid URL: {url_string}")

    hostname = parsed.hostname
    if hostname is None:
        raise ValueError(f"resolveStrategy: invalid URL: {url_string}")
    hostname = hostname.lower()
    pathname = parsed.path or "/"

    routes = config.get("routes") or []
    apify_defaults = config.get("apifyDefaults")

    for route in routes:
        if not isinstance(route, dict):
            continue
        match = route.get("match") or {}
        if not isinstance(match, dict):
            continue
        suf = match.get("hostSuffix")
        if suf is not None:
            if not _host_matches(hostname, str(suf).lower()):
                continue
        path_prefix = match.get("pathPrefix")
        if path_prefix is not None and not isinstance(path_prefix, str):
            path_prefix = str(path_prefix)
        if not _path_matches(pathname, path_prefix):
            continue

        strategy = route.get("strategy")
        if strategy == "apify":
            merged = _merge_apify(
                apify_defaults if isinstance(apify_defaults, dict) else None,
                route.get("apify") if isinstance(route.get("apify"), dict) else None,
            )
            if not merged.get("actorId"):
                raise ValueError(
                    "routing: apify route missing actorId and apifyDefaults.actorId",
                )
            return {"strategy": strategy, "apify": merged}
        return {"strategy": strategy}

    strategy = config["defaultStrategy"]
    if strategy == "apify":
        merged = _merge_apify(
            apify_defaults if isinstance(apify_defaults, dict) else None,
            None,
        )
        if not merged.get("actorId"):
            raise ValueError("routing: default apify strategy requires apifyDefaults.actorId")
        return {"strategy": strategy, "apify": merged}
    return {"strategy": strategy}
