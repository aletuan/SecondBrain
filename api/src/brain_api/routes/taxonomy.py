"""GET /v1/taxonomy/categories — category list for reader UI."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from brain_api.settings import Settings
from brain_api.taxonomy import load_taxonomy


def get_settings() -> Settings:
    return Settings()


router = APIRouter(prefix="/v1/taxonomy", tags=["taxonomy"])


@router.get("/categories")
def get_categories(
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, list[dict[str, str]]]:
    return {"items": load_taxonomy(settings)}
