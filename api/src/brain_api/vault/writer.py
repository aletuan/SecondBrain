"""Write captures under vault (mirror cli/src/vault/writer.ts)."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import httpx

from brain_api.types.capture import CaptureBundle

CAPTURE_FOLDER_NAME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}--.+--[a-f0-9]{6}$")
DEFAULT_MAX_IMAGE_BYTES = 2_000_000


def format_timestamp(sec: float) -> str:
    s = max(0.0, float(sec))
    mm = int(s // 60)
    ss = int(s % 60)
    return f"{mm}:{ss:02d}"


def build_source_markdown_body(bundle: CaptureBundle) -> str:
    if bundle.source != "youtube":
        return f"# {bundle.title}\n\n{bundle.text_plain}\n"
    watch_line = (
        f"> YouTube: https://www.youtube.com/watch?v={bundle.youtube_video_id}"
        if bundle.youtube_video_id
        else f"> {bundle.canonical_url}"
    )
    lines = [
        f"# {bundle.title}",
        "",
        watch_line,
        "",
        "## Transcript (en)",
        "",
    ]
    segs = bundle.transcript_segments
    if segs and len(segs) > 0:
        for seg in segs:
            if seg.start_sec is not None and math.isfinite(seg.start_sec):
                lines.append(f"**{format_timestamp(seg.start_sec)}** {seg.text}")
                lines.append("")
            else:
                lines.append(seg.text)
                lines.append("")
    else:
        lines.append(bundle.text_plain)
        lines.append("")
    en_body = "\n".join(lines) + "\n"
    vi_segs = bundle.transcript_segments_vi
    if not vi_segs:
        return en_body
    disclaimer = (
        "> Bản dịch do LLM tạo; đối chiếu với **Transcript (en)** khi cần độ chính xác."
    )
    vi_lines = [
        "",
        "## Transcript (vi) — bản dịch (LLM)",
        "",
        disclaimer,
        "",
    ]
    for seg in vi_segs:
        if seg.start_sec is not None and math.isfinite(seg.start_sec):
            vi_lines.append(f"**{format_timestamp(seg.start_sec)}** {seg.text}")
            vi_lines.append("")
        else:
            vi_lines.append(seg.text)
            vi_lines.append("")
    vi_block = "\n".join(vi_lines) + "\n"
    return f"{en_body}{vi_block}"


def _buffer_looks_like_image(buf: bytes) -> bool:
    if len(buf) < 3:
        return False
    if len(buf) >= 8 and buf[0:4] == b"\x89PNG":
        return True
    if len(buf) >= 3 and buf[0:3] == b"\xff\xd8\xff":
        return True
    if len(buf) >= 6 and buf[0:3] == b"GIF":
        return True
    if len(buf) >= 12 and buf[0:4] == b"RIFF" and buf[8:12] == b"WEBP":
        return True
    return False


def _extension_from_content_type(ct: str, fallback_url: str) -> str:
    ct_low = ct.lower()
    if "png" in ct_low:
        return ".png"
    if "jpeg" in ct_low or "jpg" in ct_low:
        return ".jpg"
    if "gif" in ct_low:
        return ".gif"
    if "webp" in ct_low:
        return ".webp"
    if "svg" in ct_low:
        return ".svg"
    try:
        p = urlparse(fallback_url).path
        ext = Path(p).suffix
        if ext and len(ext) <= 6:
            return ext
    except Exception:
        pass
    return ".bin"


def _request_headers_for_capture_image(url: str) -> dict[str, str] | None:
    try:
        host = urlparse(url).hostname or ""
    except Exception:
        return None
    host = host.replace("www.", "").lower()
    if host != "pbs.twimg.com" and not host.endswith(".twimg.com"):
        return None
    headers = {
        "Referer": "https://x.com/",
        "User-Agent": (
            "Mozilla/5.0 (compatible; SecondBrainCapture/1.0; +https://x.com/) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ),
    }
    auth = (os.environ.get("TWITTER_AUTH_TOKEN") or "").strip()
    ct0 = (os.environ.get("TWITTER_CT0") or "").strip()
    if auth and ct0:
        headers["Cookie"] = f"auth_token={auth}; ct0={ct0}"
    return headers


def slugify(input_s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", input_s.lower()).strip("-")
    s = re.sub(r"^-+|-+$", "", s)
    return (s or "capture")[:80]


def short_id(canonical_url: str) -> str:
    return hashlib.sha256(canonical_url.encode("utf-8")).hexdigest()[:6]


def format_frontmatter(fields: dict[str, str | bool]) -> str:
    lines = ["---"]
    for k, v in fields.items():
        if isinstance(v, bool):
            lines.append(f"{k}: {str(v).lower()}")
        else:
            lines.append(f"{k}: {json.dumps(v)}")
    lines.append("---")
    return "\n".join(lines) + "\n"


def get_capture_files(capture_dir: str | Path) -> tuple[Path, Path]:
    d = Path(capture_dir)
    try:
        files = list(d.iterdir())
    except OSError:
        return d / "source.md", d / "note.md"
    source_file = next((f for f in files if f.name.endswith(".source.md")), None)
    note_file = next((f for f in files if f.name.endswith(".note.md")), None)
    return (
        source_file or (d / "source.md"),
        note_file or (d / "note.md"),
    )


def write_capture(
    vault_root: Path,
    bundle: CaptureBundle,
    *,
    ingested_at: datetime | None = None,
) -> tuple[Path, str]:
    if ingested_at is None:
        try:
            ingested_at = datetime.fromisoformat(
                bundle.fetched_at.replace("Z", "+00:00"),
            )
        except Exception:
            ingested_at = datetime.now(timezone.utc)
    day = ingested_at.strftime("%Y-%m-%d")
    slug = slugify(bundle.title or bundle.canonical_url)
    sid = short_id(bundle.canonical_url)
    folder_name = f"{day}--{slug}--{sid}"
    relative_folder = f"Captures/{folder_name}"
    capture_dir = vault_root / "Captures" / folder_name
    capture_dir.mkdir(parents=True, exist_ok=True)

    base_fm: dict[str, str | bool] = {
        "type": "capture",
        "url": bundle.canonical_url,
        "ingested_at": ingested_at.isoformat().replace("+00:00", "Z"),
        "fetch_method": bundle.fetch_method,
        "publish": False,
    }
    if bundle.source == "youtube":
        base_fm["source"] = "youtube"
        if bundle.youtube_video_id:
            base_fm["youtube_video_id"] = bundle.youtube_video_id
        base_fm["transcript_locale"] = (
            "en,vi" if bundle.transcript_segments_vi else "en"
        )
        if bundle.transcript_segments_vi:
            base_fm["transcript_vi"] = True

    source_body = build_source_markdown_body(bundle)
    source_md = format_frontmatter(base_fm) + source_body

    note_fm: dict[str, str | bool] = {
        "type": "capture",
        "url": bundle.canonical_url,
        "ingested_at": ingested_at.isoformat().replace("+00:00", "Z"),
        "fetch_method": bundle.fetch_method,
        "publish": False,
    }
    if bundle.source == "youtube":
        note_fm["source"] = "youtube"
        if bundle.youtube_video_id:
            note_fm["youtube_video_id"] = bundle.youtube_video_id

    note_md = format_frontmatter(note_fm) + f"# {bundle.title}\n\n"

    (capture_dir / f"{slug}.source.md").write_text(source_md, encoding="utf-8")
    (capture_dir / f"{slug}.note.md").write_text(note_md, encoding="utf-8")
    return capture_dir, relative_folder


def assert_capture_dir_under_vault(vault_root: Path, capture_dir_input: str) -> Path:
    captures_root = (vault_root / "Captures").resolve()
    resolved = Path(capture_dir_input).resolve()
    try:
        rel = resolved.relative_to(captures_root)
    except ValueError as e:
        raise ValueError("capture-dir must be a directory under vault Captures/") from e
    if str(rel).startswith(".."):
        raise ValueError("capture-dir must be a directory under vault Captures/")
    base = resolved.name
    if not CAPTURE_FOLDER_NAME_RE.match(base):
        raise ValueError(
            f'capture-dir folder name must match YYYY-MM-DD--slug--hash (6 hex); got "{base}"',
        )
    return resolved


def clear_capture_assets_dir(capture_dir: str | Path) -> None:
    assets = Path(capture_dir) / "assets"
    if assets.is_dir():
        shutil.rmtree(assets, ignore_errors=True)


def overwrite_capture_at_dir(
    capture_dir_abs: str | Path,
    bundle: CaptureBundle,
    *,
    ingested_at: datetime | None = None,
) -> None:
    d = Path(capture_dir_abs)
    if ingested_at is None:
        try:
            ingested_at = datetime.fromisoformat(
                bundle.fetched_at.replace("Z", "+00:00"),
            )
        except Exception:
            ingested_at = datetime.now(timezone.utc)
    source_path, note_path = get_capture_files(d)

    base_fm: dict[str, str | bool] = {
        "type": "capture",
        "url": bundle.canonical_url,
        "ingested_at": ingested_at.isoformat().replace("+00:00", "Z"),
        "fetch_method": bundle.fetch_method,
        "publish": False,
    }
    if bundle.source == "youtube":
        base_fm["source"] = "youtube"
        if bundle.youtube_video_id:
            base_fm["youtube_video_id"] = bundle.youtube_video_id
        base_fm["transcript_locale"] = (
            "en,vi" if bundle.transcript_segments_vi else "en"
        )
        if bundle.transcript_segments_vi:
            base_fm["transcript_vi"] = True

    source_body = build_source_markdown_body(bundle)
    source_md = format_frontmatter(base_fm) + source_body

    note_fm: dict[str, str | bool] = {
        "type": "capture",
        "url": bundle.canonical_url,
        "ingested_at": ingested_at.isoformat().replace("+00:00", "Z"),
        "fetch_method": bundle.fetch_method,
        "publish": False,
    }
    if bundle.source == "youtube":
        note_fm["source"] = "youtube"
        if bundle.youtube_video_id:
            note_fm["youtube_video_id"] = bundle.youtube_video_id

    note_md = format_frontmatter(note_fm) + f"# {bundle.title}\n\n"

    source_path.write_text(source_md, encoding="utf-8")
    note_path.write_text(note_md, encoding="utf-8")
    clear_capture_assets_dir(d)


def _strip_simple_yaml_frontmatter(raw: str) -> tuple[dict[str, str | bool], str]:
    m = re.match(r"^---\r?\n([\s\S]*?)\r?\n---\s*", raw)
    if not m:
        return {}, raw
    inner = m.group(1) or ""
    fm: dict[str, str | bool] = {}
    for line in inner.splitlines():
        kv = re.match(r"^([\w-]+):\s*(.+)$", line.strip())
        if not kv:
            continue
        k, v = kv.group(1), kv.group(2).strip()
        if v == "true":
            fm[k] = True
            continue
        if v == "false":
            fm[k] = False
            continue
        if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
            v = v[1:-1]
        fm[k] = v
    return fm, raw[m.end() :]


def read_ingest_url_from_capture_dir(capture_dir: str | Path) -> str:
    note_path, source_path = get_capture_files(capture_dir)
    for p in (note_path, source_path):
        try:
            raw = p.read_text(encoding="utf-8")
        except OSError:
            continue
        fm, _ = _strip_simple_yaml_frontmatter(raw)
        u = fm.get("url")
        if isinstance(u, str) and u.strip():
            s = u.strip()
            try:
                parsed = urlparse(s)
                if parsed.scheme in ("http", "https"):
                    return s
            except Exception:
                continue
    raise ValueError("reingest: no valid http(s) url in note/source frontmatter")


def add_tags_to_note_frontmatter(note_path: Path, tags: list[str]) -> None:
    if not tags:
        return
    content = note_path.read_text(encoding="utf-8")
    tags_line = "tags: [" + ", ".join(json.dumps(t) for t in tags) + "]"

    def _repl(m: re.Match[str]) -> str:
        return f"{m.group(1)}{tags_line}\n{m.group(2)}"

    updated = re.sub(
        r"^(---\n[\s\S]*?)(---)",
        _repl,
        content,
        count=1,
        flags=re.MULTILINE,
    )
    note_path.write_text(updated, encoding="utf-8")


def set_categories_in_note_frontmatter(note_path: Path, ids: list[str]) -> None:
    content = note_path.read_text(encoding="utf-8")
    m = re.match(r"^---\r?\n([\s\S]*?)\r?\n---\s*", content, flags=re.MULTILINE)
    if not m:
        raise ValueError("set_categories_in_note_frontmatter: missing YAML frontmatter")
    inner = m.group(1) or ""
    after = content[m.end() :]
    lines = inner.splitlines()
    kept = [ln for ln in lines if not re.match(r"^\s*categories:\s*", ln)]
    body = "\n".join(kept).rstrip()
    cats_line = (
        "categories: [" + ", ".join(json.dumps(i) for i in ids) + "]" if ids else ""
    )
    new_inner = f"{body}\n{cats_line}\n" if cats_line else f"{body}\n"
    note_path.write_text(f"---\n{new_inner}---\n{after}", encoding="utf-8")


def download_images_to_assets(
    bundle: CaptureBundle,
    capture_dir: str | Path,
    *,
    max_bytes: int | None = None,
) -> None:
    mb = max_bytes
    if mb is None:
        raw = os.environ.get("CAPTURE_IMAGE_MAX_BYTES")
        try:
            mb = int(raw) if raw else DEFAULT_MAX_IMAGE_BYTES
        except ValueError:
            mb = DEFAULT_MAX_IMAGE_BYTES
    if not isinstance(mb, int) or mb <= 0:
        return

    cap = Path(capture_dir)
    assets_dir = cap / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    _, note_path = get_capture_files(cap)
    lines: list[str] = []
    index = 0
    with httpx.Client(follow_redirects=True, timeout=60.0) as client:
        for img in bundle.images:
            try:
                headers = _request_headers_for_capture_image(img.url)
                r = client.get(img.url, headers=headers)
                if r.status_code != 200:
                    continue
                ct = (r.headers.get("content-type") or "").lower()
                if not ct.startswith("image/"):
                    continue
                buf = r.content
                if len(buf) > mb:
                    continue
                if not _buffer_looks_like_image(buf):
                    continue
                ext = _extension_from_content_type(ct, img.url)
                name = f"img-{index}{ext}"
                index += 1
                (assets_dir / name).write_bytes(buf)
                safe_alt = re.sub(r"[\]|]", "", img.alt or "")
                lines.append(f"![[assets/{name}|{safe_alt}]]")
            except Exception:
                continue
    if not lines:
        return
    with note_path.open("a", encoding="utf-8") as f:
        f.write("\n\n## Hình ảnh\n\n" + "\n".join(lines) + "\n")
