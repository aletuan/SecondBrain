"""Note enrichment + tags (mirror cli/src/llm/enrich.ts)."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Protocol

ENRICH_SYSTEM_PROMPT = """Bạn là trợ lý ghi chú chuyên nghiệp. Chỉ được dựa trên khối nguồn (và tiêu đề/URL nếu có) mà người dùng gửi; không bịa số liệu hay trích dẫn không có trong nguồn.

Trả lời bằng Markdown với đúng hai section theo thứ tự (giữ nguyên tiêu đề cấp 2):

## Tóm tắt
Viết tiếng Việt, **rõ ràng và có cấu trúc** (không nhất thiết cực ngắn): ưu tiên **đủ để độc giả nắm từng mục chính** khi nguồn đã có chi tiết — tránh lan man khi nguồn ngắn.
- **Chủ đề / bối cảnh** — một câu: bài nói về cái gì, cho ai.
- **Ý chính** — từ **một** đến **tối đa 7** gạch đầu dòng cấp một; mỗi dòng là một luận điểm **lấy từ nguồn**. **Nếu nguồn trình bày nhiều khái niệm hoặc luận điểm song song** (danh sách, “N điểm”, từng đoạn minh họa): **không** gom tất cả vào một gạch chỉ liệt kê tên. **Mỗi gạch** tương ứng **một mục** (hoặc nhóm chặt); sau tên mục (dùng dấu —) thêm **một hoặc hai câu** về vai trò, ý chính, hoặc **một ví dụ** — **chỉ** từ nguồn. Nếu nguồn không giải thích mục đó, chỉ nêu điều có trong nguồn hoặc ghi *(chi tiết không nêu trong nguồn)* — **không** bịa định nghĩa. Ưu tiên **tên công cụ, số liệu, bước cụ thể** có trong nguồn. **Không** thêm ý chỉ để đủ số dòng — nếu nguồn ngắn hoặc ít ý, viết ít gạch hơn là bịa.
- **Trích ngắn (tùy chọn)** — Nếu nguồn có số liệu hoặc claim quan trọng, có thể thêm **một hoặc hai** cụm trích ngắn trong ngoặc kép — **chỉ** từ nguồn; nếu không có gì đáng trích, bỏ qua hoặc ghi *(Không có trích ngắn.)*
- **Kết luận hoặc thông điệp trung tâm** — 1–2 câu, bám sát nguồn.
- **Thuật ngữ, số liệu hoặc claim đáng nhớ** — nếu nguồn có: 2–5 gạch đầu dòng ngắn (chỉ điều thật sự xuất hiện). Nếu không có gì nổi bật, ghi một dòng: *(Không có mục riêng — nội dung mang tính mô tả chung.)*

## Insight (LLM) — suy luận
- **Tối đa 4** gạch đầu dòng: hệ quả, rủi ro, hạn chế phương pháp, liên hệ với bối cảnh rộng — **đây là suy luận của bạn**, không trình như trích dẫn trực tiếp từ nguồn. Tránh lặp lại nguyên si phần Tóm tắt; khi có thể, gắn suy luận với chi tiết đã nêu ở Tóm tắt.
- Có thể dùng công thức "Nếu … thì …" hoặc "Điểm cần kiểm chứng thêm: …" khi phù hợp.

**Không** thêm section "Câu hỏi mở" hay bất kỳ heading cấp 2 nào khác ngoài hai section trên."""

TAG_SYSTEM_PROMPT = (
    "Từ nội dung sau, trả về 3-5 tags chủ đề dưới dạng JSON array. "
    "Tags phải ngắn gọn, lowercase, dùng hyphen. Chỉ trả về JSON array."
)


def _fetch_method_hint(method: str) -> str:
    if method == "x_api":
        return (
            "Loại nguồn (X API): ưu tiên các bước, số liệu và tên công cụ xuất hiện trong post "
            "(tweet/long post); không suy diễn ngoài nguồn."
        )
    if method == "http_readability":
        return "Loại nguồn (trang web): ưu tiên luận điểm, số liệu và tên riêng trong bài đã trích."
    if method == "apify":
        return (
            "Loại nguồn (Apify crawl): ưu tiên chi tiết có trong nội dung đã trích; "
            "không thêm giả định ngoài ngữ cảnh nguồn."
        )
    return f"Loại nguồn ({method})."


def build_enrich_user_message(excerpt: str, ctx: dict[str, Any] | None = None) -> str:
    ctx = ctx or {}
    lines: list[str] = []
    t = ctx.get("title")
    if isinstance(t, str) and t.strip():
        lines.append(f"Tiêu đề: {t.strip()}")
    u = ctx.get("url")
    if isinstance(u, str) and u.strip():
        lines.append(f"URL: {u.strip()}")
    fm = ctx.get("fetch_method")
    if isinstance(fm, str) and fm:
        lines.append(_fetch_method_hint(fm))
    header = "\n".join(lines) + "\n\n---\n\n" if lines else ""
    return (
        f"{header}Nội dung nguồn (Markdown; có thể đã rút gọn giữa đầu và cuối):\n\n{excerpt}"
    )


def resolve_enrich_model(override: str | None = None) -> str:
    if override and override.strip():
        return override.strip()
    e = (os.environ.get("ENRICH_MODEL") or "").strip()
    if e:
        return e
    return (os.environ.get("OPENAI_MODEL") or "").strip() or "gpt-4o-mini"


DEFAULT_ENRICH_TEMPERATURE = 0.3


def resolve_enrich_temperature() -> float:
    raw = (os.environ.get("ENRICH_TEMPERATURE") or "").strip()
    if not raw:
        return DEFAULT_ENRICH_TEMPERATURE
    try:
        n = float(raw)
    except ValueError:
        return DEFAULT_ENRICH_TEMPERATURE
    if 0 <= n <= 2:
        return n
    return DEFAULT_ENRICH_TEMPERATURE


DEFAULT_ENRICH_MAX_COMPLETION_TOKENS = 4096
MIN_TOK = 256
MAX_TOK = 32_000


def resolve_enrich_max_completion_tokens() -> int:
    raw = (os.environ.get("ENRICH_MAX_COMPLETION_TOKENS") or "").strip()
    if not raw:
        return DEFAULT_ENRICH_MAX_COMPLETION_TOKENS
    try:
        n = int(raw, 10)
    except ValueError:
        return DEFAULT_ENRICH_MAX_COMPLETION_TOKENS
    if MIN_TOK <= n <= MAX_TOK:
        return n
    return DEFAULT_ENRICH_MAX_COMPLETION_TOKENS


class _OpenAIClient(Protocol):
    chat: Any


def build_enrichment_sections_sync(
    source_excerpt: str,
    client: _OpenAIClient,
    model: str,
    ctx: dict[str, Any] | None = None,
) -> str:
    user_content = build_enrich_user_message(source_excerpt, ctx)
    res = client.chat.completions.create(
        model=model,
        temperature=resolve_enrich_temperature(),
        max_tokens=resolve_enrich_max_completion_tokens(),
        messages=[
            {"role": "system", "content": ENRICH_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
    )
    text = res.choices[0].message.content if res.choices else None
    if not (text and text.strip()):
        raise RuntimeError("enrich: empty completion")
    return text.strip()


def extract_tags_sync(excerpt: str, client: _OpenAIClient, model: str) -> list[str]:
    try:
        res = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": TAG_SYSTEM_PROMPT},
                {"role": "user", "content": excerpt},
            ],
            temperature=0.2,
            max_tokens=100,
        )
        raw = (res.choices[0].message.content or "").strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.I)
        cleaned = re.sub(r"\s*```$", "", cleaned).strip()
        parsed = json.loads(cleaned)
        if not isinstance(parsed, list):
            return []
        out = [str(t) for t in parsed if isinstance(t, str) and t]
        return out[:5]
    except Exception:
        return []


def enrich_note_sync(
    *,
    note_path: Path,
    source_excerpt: str,
    title: str | None = None,
    url: str | None = None,
    fetch_method: str | None = None,
    api_key: str | None = None,
    model: str | None = None,
    client: _OpenAIClient | None = None,
) -> None:
    from openai import OpenAI

    key = (api_key or os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("enrich: OPENAI_API_KEY is not set")
    m = resolve_enrich_model(model)
    c = client or OpenAI(api_key=key)
    ctx: dict[str, Any] = {}
    if title:
        ctx["title"] = title
    if url:
        ctx["url"] = url
    if fetch_method:
        ctx["fetch_method"] = fetch_method
    body = build_enrichment_sections_sync(source_excerpt, c, m, ctx or None)
    block = f"\n\n---\n\n{body}\n"
    with note_path.open("a", encoding="utf-8") as f:
        f.write(block)