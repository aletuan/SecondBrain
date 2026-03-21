# Second brain CLI

TypeScript CLI that ingests URLs into an **Obsidian vault** (`Captures/…`), optionally enriches notes with **OpenAI**, and writes **weekly digests** (`Digests/YYYY-Www.md`). Routing is YAML: HTTP + Readability, Apify actors, or an X API stub.

## Setup

```bash
pnpm install
cp config/routing.example.yaml config/routing.yaml   # adjust routes / actor IDs
touch .env   # create at repo root; add keys from the Environment table (never commit .env)
```

- **Vault root:** `VAULT_ROOT` (default `./vault` relative to the current working directory when you run the CLI).
- **Routing:** the CLI loads `config/routing.yaml` if present, otherwise `config/routing.example.yaml`.
- **Secrets:** chỉ điền key thật trong **`.env`** ở root repo (file này **đã `.gitignore`**, không lên git). CLI tự load `.env` qua `dotenv`. Không commit file env mẫu — khai báo biến theo bảng **Environment** bên dưới.

## Commands

| Command | Description |
|--------|-------------|
| `pnpm ingest -- <url>` | Ingest one URL (fetch → normalise → `Captures/…` → optional images → optional LLM sections on `note.md`). |
| `pnpm ingest -- --no-llm <url>` | Same without OpenAI enrichment. |
| `pnpm exec tsx src/cli.ts ingest [options] <url>` | **Recommended** when using flags (avoids pnpm injecting an extra `--` into argv). **YouTube:** Vi batch translation runs **by default** if `OPENAI_API_KEY` is set and transcript segments exist. |
| `pnpm exec tsx src/cli.ts ingest --no-translate-transcript <youtube-url>` | YouTube only: skip Vi transcript translation. |
| `pnpm exec tsx src/cli.ts ingest --translate-transcript <youtube-url>` | YouTube only: **require** Vi transcript (errors if segments or key missing). |
| `pnpm translate-transcript -- --capture vault/Captures/…` | Add or replace `## Transcript (vi)` on an existing capture. |
| `pnpm suggest-milestones -- --capture vault/Captures/… --max-sec 600` | Merge LLM-suggested `milestones.yaml` (YouTube). |
| `pnpm digest` | Build digest for the current ISO week (UTC) under `vault/Digests/`. |
| `pnpm digest -- --since 7d` | Only include captures whose `note.md` frontmatter `ingested_at` falls in the lookback window. |
| `pnpm digest -- --no-llm` | Skip the LLM “Tổng quan” section. |
| `pnpm test` / `pnpm typecheck` | Tests and TypeScript check. |
| `pnpm verify-keys` | Kiểm tra nhanh **OpenAI** / **Apify** / **X** bearer (đọc `.env`, không in key). |
| `pnpm verify-apify-youtube` | Thử **APIFY_TOKEN** + chạy actor YouTube trong routing trên một video mặc định (tốn Apify). `pnpm verify-apify-youtube --token-only` chỉ kiểm tra token. Có thể truyền URL: `pnpm verify-apify-youtube 'https://youtu.be/…'`. |
| `pnpm verify-x-tweet [id]` | Gọi `GET /2/tweets/:id` (app-only). Mặc định id ví dụ nếu không truyền. |
| `pnpm exec tsx src/cli.ts challenge --week 2026-W12` | Sinh `vault/Challenges/2026-W12.md` từ digest (cần `OPENAI_API_KEY`). |
| `pnpm exec tsx src/cli.ts challenge --digest vault/Digests/2026-W12.md` | Cùng mục đích, chỉ định file digest. |

Thư mục **`vault/`** mặc định **gitignore** (dữ liệu cá nhân).

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENAI_API_KEY` | For LLM | Summaries on `note.md`, digest overview, and **default** YouTube transcript EN→VI batch when segments exist. |
| `OPENAI_MODEL` | No | Default `gpt-4o-mini`. |
| `APIFY_TOKEN` | For Apify routes | Actor runs. |
| `X_BEARER_TOKEN` | For X routes (later) | Full X adapter is not implemented yet. |
| `VAULT_ROOT` | No | Vault directory. |
| `CAPTURE_IMAGE_MAX_BYTES` | No | Per-image download cap (default 2_000_000). |
| `YT_TRANSLATE_BATCH` | No | Transcript translation: lines per OpenAI call (default 20). |
| `YT_TRANSLATE_MODEL` | No | Optional model override for translation only. |
| `DIGEST_LLM_MAX_CHARS` | No | Digest: soft max chars of excerpts before chunked LLM + merge (default 12000). |

## Testing integrations (OpenAI / Apify / X)

1. **`pnpm verify-keys`** — gọi API nhẹ (OpenAI `models.list`, Apify `user().get`, X `users/me`) để xác nhận token đọc được từ `.env`.

2. **`pnpm verify-apify-youtube`** — đọc `APIFY_TOKEN` từ `.env`. Thêm `--token-only` để chỉ gọi `user().get()`. Không flag: chạy actor YouTube trong `config/routing.yaml` trên một video mẫu (tốn compute); hoặc truyền URL YouTube làm đối số.

3. **Ingest thật** — tránh `pnpm run ingest -- --flag1 --flag2 <url>` (pnpm có thể chuyển thêm một `--` xuống argv và làm Commander báo “too many arguments”). Ưu tiên:

   ```bash
   pnpm exec tsx src/cli.ts ingest --no-llm https://example.com
   pnpm exec tsx src/cli.ts ingest https://example.com
   ```

   Hoặc chỉ một cờ sau `run ingest`: `pnpm run ingest -- --no-llm https://example.com`.

4. **OpenAI trong ingest:** bỏ `--no-llm`, đảm bảo `OPENAI_API_KEY` trong `.env`; mở `note.md` của capture xem section LLM. **YouTube:** cùng key đó còn bật dịch transcript Vi theo mặc định (trừ khi `--no-translate-transcript`).

5. **Apify:** cần URL khớp route `apify` trong `config/routing.yaml` + `actorId` hợp lệ + `APIFY_TOKEN`. Với **`youtube.com` / `youtu.be`**, CLI gọi luồng **YouTube transcript**: actor phải trả về transcript (field dạng `subtitles` / `captions` / `transcript` / `text` — xem `src/adapters/youtube.ts`). Pin actor **YouTube có transcript** trong Apify Console; có thể dùng cùng `actorId` cho cả hai host trong `routing.example.yaml`.

6. **X trong CLI:** ingest URL `…/status/<id>` — API v2 với `tweet.fields=note_tweet,article`. **Note tweet:** nếu `note_tweet.text` dài hơn `text` → chỉ dùng API. **X Article:** object `article` thường chỉ có `title` (tier Basic); nếu có thêm field nội dung (`text`, `markdown`, …) thì dùng luôn. Có `article.title` thì **không** scrape `x.com/i/article` (hay bị chặn); capture ghi title + link. Link ngoài X vẫn fetch HTTP + Readability. `pnpm verify-x-tweet [id]` để xem JSON.

7. **Digest:** `pnpm exec tsx src/cli.ts digest --since 7d` (hoặc `pnpm run digest -- --since 7d`).

## Apify adapter (website-style actors)

The default sample actor id is `apify/website-content-crawler`. The adapter maps the **first dataset item** using, in order:

- `text` or `markdown` → `textPlain`
- optional `title`
- optional `screenshotUrl` → first image entry

Pin your own **Actor ID** and optional **build** in `config/routing.yaml`.

## Apify + YouTube (transcript)

Khi host là `youtube.com` hoặc `youtu.be` và route là `apify`, ingest dùng **`ingestYouTubeViaApify`**. Trong routing, **`youtubeInput`** quyết định JSON gửi vào actor:

- **`urls`** — `{ urls: [url], language, includeAutoGenerated, mergeSegments }` (mặc định trong `routing.example.yaml` cho actor Store [`automation-lab/youtube-transcript`](https://apify.com/automation-lab/youtube-transcript), trả `segments` / `fullText`).
- **`start_urls`** (mặc định nếu không khai báo) — `{ startUrls: [{ url }] }` cho actor kiểu crawler.

Dataset: lấy **item đầu**, map `segments`, `subtitles`, `fullText`, v.v. Nếu không có chữ nào, CLI báo lỗi.

## Reader web (not this repo)

The **reader web app** is in [`reader-web/`](reader-web/) (`pnpm dev` after `pnpm install` there). `POST /api/ingest` runs the same CLI entrypoint via `node …/tsx/dist/cli.mjs src/cli.ts ingest` in `READER_BRAIN_ROOT` (not `pnpm run ingest --`, for the argv reason above). HTML mocks under [`docs/visualizations/`](docs/visualizations/) informed the layout — see [`docs/reader-web.md`](docs/reader-web.md). This CLI only writes Markdown to the vault; **Quartz** is not part of the stack.

## MVP limits

- **X / Twitter:** X API v2 + X Article khi có `X_BEARER_TOKEN` (và tuỳ chọn cookies cho CDN ảnh).
- **YouTube:** ingest transcript qua **Apify**; dịch Vi / milestones / reader UI — xem plan (đã có trong repo).
- **Meta Threads (threads.net):** không hỗ trợ ingest (bỏ scope).
