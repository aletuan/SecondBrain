"""Category classification (mirror cli/src/llm/extractCategories.ts)."""

from __future__ import annotations

import json
import re
from typing import Any, Protocol


def build_category_system_prompt(allowed_ids_sorted: list[str]) -> str:
    list_s = ", ".join(allowed_ids_sorted)
    return (
        f"Bạn phân loại nội dung theo các category sau (chỉ dùng đúng id, có thể chọn nhiều id).\n\n"
        f"Các id hợp lệ: {list_s}\n\n"
        "Trả về **duy nhất** một JSON array các chuỗi id (ví dụ: "
        '["machine-learning","data-engineering"]). Không thêm id không nằm trong danh sách. '
        'Nếu không phù hợp rõ ràng category nào, có thể dùng "uncategorized" hoặc mảng rỗng []. '
        "Chỉ trả JSON array, không giải thích."
    )


class _OpenAIClient(Protocol):
    chat: Any


def extract_categories_sync(
    excerpt: str,
    client: _OpenAIClient,
    model: str,
    allowed_ids: list[str],
) -> list[str]:
    allowed_set = set(allowed_ids)
    sorted_ids = sorted(allowed_ids, key=lambda x: x.lower())
    try:
        res = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": build_category_system_prompt(sorted_ids)},
                {"role": "user", "content": excerpt[:120_000]},
            ],
            temperature=0.2,
            max_tokens=200,
        )
        raw = (res.choices[0].message.content or "").strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.I)
        cleaned = re.sub(r"\s*```$", "", cleaned).strip()
        parsed = json.loads(cleaned)
        if not isinstance(parsed, list):
            return []
        out = [str(t) for t in parsed if isinstance(t, str) and t and t in allowed_set]
        return sorted(set(out), key=lambda x: x.lower())
    except Exception:
        return []
