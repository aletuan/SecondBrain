# Handoff: X.com ingest & X Articles

**Ngày:** 2026-03-20 (cập nhật 2026-03-21)
**Trạng thái:** ✅ X Article ingest hoạt động đầy đủ (full body + images) qua twitter-cli.

---

## Mục tiêu

- Ingest URL `x.com/.../status/<id>` bằng **X API v2** + **`X_BEARER_TOKEN`** (App-only Bearer).
- Vault: tweet + **full nội dung X Article** (long-form `/i/article/...`) kèm hình ảnh.

---

## Điều đã xác nhận hoạt động

| Hạng mục | Trạng thái |
|----------|------------|
| Bearer trong `.env` | `cli/src/adapters/xApi.ts` → `Authorization: Bearer …` cho `GET /2/tweets/:id`. |
| CLI load `.env` | `cli/src/cli.ts` có `import 'dotenv/config'`. |
| `tweet.fields` | `created_at,author_id,text,entities,note_tweet,article` (+ expansions user). |
| X API v2 `article` field | Trả `article.title` + `article.plain_text` (full body, plain text, **không có images**). |
| twitter-cli (GraphQL) | Trả full article body dạng **Markdown + embedded images** qua GraphQL + cookies. |
| Image download | Vault writer tải images từ `bundle.images` vào `assets/`, embed trong `note.md`. Với `pbs.twimg.com` / `*.twimg.com`: gửi `Referer: https://x.com/` + `User-Agent` giống browser; nếu có `TWITTER_AUTH_TOKEN` + `TWITTER_CT0` trong `.env` thì gửi kèm `Cookie` (một số URL CDN yêu cầu session). |

---

## Payload API thực tế (ví dụ tweet Article)

Tweet mẫu: `_avichawla/status/2034902650534187503`.

### X API v2 response

```json
“article”: {
  “title”: “KV Caching in LLMs, Clearly Explained”,
  “plain_text”: “You must have seen it every time...(~4700 chars, plain text, no images)...”,
  “cover_media”: “3_2034901698364502016”,
  “media_entities”: [“16_2034896816937041920”, “3_2034897122013978629”, ...],
  “preview_text”: “You must have seen...”
}
```

→ API v2 **có** trả `plain_text` nhưng **không có images** (chỉ trả media IDs, không có URLs).

### twitter-cli (GraphQL) response

```json
{ “ok”: true, “title”: “KV Caching in LLMs, Clearly Explained”,
  “text”: “...markdown with ## headings, ![](https://pbs.twimg.com/...) images...”,
  “images”: [“https://pbs.twimg.com/...”, ...] }  // 9 images
```

→ GraphQL trả full Draft.js content_state → convert sang Markdown **kèm inline images**.

---

## Nghiên cứu đã thực hiện (2026-03-21)

### 1. X API v2 — không có endpoint/tier nào trả Article body kèm images

- `tweet.fields=article` (thêm từ 2024-07-26) trả “Article metadata”.
- Không có `GET /2/articles/:id` hoặc CRUD endpoint — xác nhận qua X Developer Community (May & Aug 2024).
- **Không có tier nào** (Free/Basic/Pro/Enterprise) trả thêm image URLs trong `article` object.
- **OAuth user context** không thay đổi article fields so với app-only Bearer.
- Nguồn: [X API Changelog](https://docs.x.com/changelog), [X Developer Community](https://devcommunity.x.com).

### 2. Giải pháp: twitter-cli (`jackwener/twitter-cli`)

- Python CLI dùng **X internal GraphQL API** + browser cookies (không phải API v2).
- Lệnh `twitter article <tweet_id> --json` trả `articleTitle` + `articleText` (plain text, không có images do bug trong parser).
- **Workaround**: viết `scripts/fetch-x-article.py` — gọi trực tiếp GraphQL client của twitter-cli, tự parse Draft.js blocks + `media_entities` → Markdown **kèm image URLs**.

### 3. Vấn đề đã gặp & giải quyết

| Vấn đề | Giải pháp |
|--------|-----------|
| X API v2 trả `article.plain_text` (plain text, no images) | Ưu tiên twitter-cli để có Markdown + images; fallback về API plain text |
| twitter-cli `--json` output không có images | Bug trong `_extract_article_media_url_map` — không resolve `media_info.original_img_url`. Viết script riêng `scripts/fetch-x-article.py` |
| Scrape HTML `x.com/i/article/...` bị chặn | Không dùng nữa — twitter-cli GraphQL thay thế |
| `fetchXThread` return trước khi gọi twitter-cli | API trả `plain_text` → `articlePlainTextFromApi` match → return sớm. Fix: gọi twitter-cli **trước** cả khi API đã có body text |
| `.env` thiếu `TWITTER_AUTH_TOKEN` / `TWITTER_CT0` → ingest không có images | Cookies chưa được thêm vào `.env`. Khi thiếu, twitter-cli trả 401 → fallback về API `plain_text` (no images). Fix: thêm cả hai cookie vào `.env`. Đã xác nhận lại 2026-03-21 với tweet `ihtesham2005/status/2035035410758619428` — sau khi thêm cookies, ingest trả full Markdown + 1 image (`HD3lDYEbQAEah38.png`). |

---

## Kiến trúc hiện tại

```
URL x.com/.../status/<id>
  ↓
fetchXThread() — X API v2 (Bearer)
  ├─ note_tweet dài hơn text? → dùng API (long post, không cần article)
  ├─ article.plain_text có? →
  │    ├─ twitter-cli OK? → Markdown + images ✅
  │    └─ twitter-cli fail → API plain text (no images)
  ├─ article.title only? →
  │    ├─ twitter-cli OK? → Markdown + images ✅
  │    └─ twitter-cli fail → title-only stub + link
  ├─ URL /i/article/ (no article object)? →
  │    ├─ twitter-cli OK? → Markdown + images ✅
  │    └─ twitter-cli fail → stub + link
  └─ External URL? → HTTP fetch + Readability
```

---

## Yêu cầu setup

```bash
# X API v2 (tweet lookup)
X_BEARER_TOKEN=...          # .env

# twitter-cli (full Article body + images)
uv tool install twitter-cli
TWITTER_AUTH_TOKEN=...      # .env — browser cookie auth_token từ x.com
TWITTER_CT0=...             # .env — browser cookie ct0 từ x.com
```

Lấy cookies: browser DevTools → Application → Cookies → `x.com` → copy `auth_token` và `ct0`.

---

## Lệnh kiểm tra nhanh

```bash
# Tweet lookup qua API v2
pnpm verify-x-tweet 2034902650534187503

# Full ingest (no LLM)
pnpm exec tsx cli/src/cli.ts ingest 'https://x.com/_avichawla/status/2034902650534187503'

# Test twitter-cli trực tiếp
twitter article 2034902650534187503 --json

# Test script fetch article with images
uv run --with twitter-cli python3 scripts/fetch-x-article.py 2034902650534187503
```

---

## Việc còn mở

1. **Cookie expiry**: `TWITTER_AUTH_TOKEN` + `TWITTER_CT0` hết hạn → cần refresh thủ công từ browser. Có thể tự động hoá bằng browser cookie extraction của twitter-cli (cần Keychain access). Cookies đã refresh 2026-03-21 — nếu ingest bị fallback về plain text (no images), kiểm tra 401 error và refresh lại cookies.
2. **Rate limiting**: GraphQL API có thể rate-limit nếu gọi nhiều. Hiện chỉ gọi 1 request/article.
3. **twitter-cli upstream fix**: `_extract_article_media_url_map` không resolve `media_info.original_img_url` — nếu fix upstream thì có thể dùng `twitter article --json` thay vì script riêng.

---

## Tham chiếu nội bộ

- Plan: `docs/plans/2026-03-20-second-brain-implementation-plan.md`
- Adapter: `cli/src/adapters/xApi.ts` (`fetchXThread`, `fetchXArticleViaTwitterCli`)
- Python helper: `scripts/fetch-x-article.py`
- Tests: `cli/tests/adapters/xApi.test.ts` (26 tests)
- Env template: `.env.example` (đã thêm `TWITTER_AUTH_TOKEN`, `TWITTER_CT0`)
