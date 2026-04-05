"""Taxonomy YAML → list of {id, label}."""

from pathlib import Path

import pytest

from brain_api.settings import Settings
from brain_api.taxonomy import default_categories_path, load_taxonomy


def _repo_api_config() -> Path:
    """api/config/categories.default.yaml from this test file location."""
    return Path(__file__).resolve().parents[1] / "config" / "categories.default.yaml"


def test_load_taxonomy_from_default_yaml_items_shape_and_unique_ids(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    vault = tmp_path / "vault"
    vault.mkdir()
    monkeypatch.setenv("VAULT_ROOT", str(vault))
    monkeypatch.delenv("CATEGORIES_CONFIG_PATH", raising=False)

    cfg_path = _repo_api_config()
    assert cfg_path.is_file(), f"missing bundled default: {cfg_path}"

    s = Settings(_env_file=None)
    items = load_taxonomy(s)

    assert len(items) >= 1
    ids: list[str] = []
    for it in items:
        assert set(it.keys()) == {"id", "label"}
        assert isinstance(it["id"], str) and it["id"]
        assert isinstance(it["label"], str)
        ids.append(it["id"])
    assert len(ids) == len(set(ids))


def test_default_categories_path_points_at_api_config() -> None:
    p = default_categories_path()
    assert p.name == "categories.default.yaml"
    assert p.parent.name == "config"
    assert (p.parent.parent / "src" / "brain_api").is_dir()
