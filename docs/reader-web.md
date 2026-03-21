# Reader web (separate app)

The second-brain **reader web** is a **separate** application from this CLI. It reads the Obsidian vault from **disk** (same machine or mounted volume) today; a remote **HTTP API** could replace that later. It is **not** Quartz, not an SSG wiki, and not a publishing pipeline.

## Implementation in this repo

A working app lives under [`reader-web/`](../reader-web/): **Vite** + vanilla TS, dev server with Connect middleware exposing read routes plus **`POST /api/ingest`**, which shells to `pnpm ingest` in the Brain CLI repo (`READER_BRAIN_ROOT`, default parent of `reader-web/`) with `VAULT_ROOT` aligned to the reader vault — same files Obsidian sees. Treat ingest as **local-only** (do not expose the dev server to the internet); use `READER_ALLOW_INGEST=0` to disable. See [`reader-web/README.md`](../reader-web/README.md).

**YouTube timeline:** the standalone demo [`visualizations/reader-youtube-timeline.html`](visualizations/reader-youtube-timeline.html) is optional reference only; the reader app implements embed + milestones + seek inside the capture detail screen (aligned with the main mock below).

## Design references (UX / layout)

- [`visualizations/second-brain-mock-ui.html`](visualizations/second-brain-mock-ui.html) — primary layout reference for the app
- [`visualizations/second-brain-solution.html`](visualizations/second-brain-solution.html)
- YouTube timeline + seek prototype (reference): [`visualizations/reader-youtube-timeline.html`](visualizations/reader-youtube-timeline.html)

## Vault contract (what the app should read)

### Capture folder

Path pattern (CLI output):

`vault/Captures/YYYY-MM-DD--slug--shortid/`

| File | Role |
|------|------|
| `source.md` | Canonical capture body: article text and/or `## Transcript (en)` / `## Transcript (vi) — bản dịch (LLM)` for YouTube |
| `note.md` | Working note; LLM enrichment appended here (`Tóm tắt`, `Insight`, …) |
| `assets/` | Images referenced from `note.md` |
| `milestones.yaml` | Optional YouTube seek markers (see below) |

### Frontmatter (typical)

- `type: capture`
- `url`, `ingested_at`, `publish` — **`publish: false`** means “private / do not surface in any public index”. A personal reader may still show it locally; a future “published” view should respect `publish: true` only.
- YouTube: `source: youtube`, `youtube_video_id`, `transcript_locale` (`en` or `en,vi`), `transcript_vi: true` when a Vietnamese transcript block exists.

### YouTube in the reader

1. **Layout:** **Below 1120px width**, video + milestones use the **full width** of the main column (no 720px cap); transcript stacks below with **larger subtitle typography** (`#cap-youtube`). **From 1120px up**, **two-column grid** (`.yt-split`) at roughly **56% / 44%** (`1.28fr` / `1fr`, transcript `min-width` ~320px). The live subtitle list height is capped to show **~4 bilingual rows**; **search + language chips sit under the list** (bottom of `#yt-sub-panel`).
2. **Embed:** Plain iframe when transcript has no parseable `**m:ss**` lines; otherwise the app mounts **`YT.Player`** on `#yt-player-root` (loads `iframe_api` once) for smooth seek + time sync.
3. **Transcript:** Parse `source.md` — section `## Transcript (en)` and, if present, `## Transcript (vi) — bản dịch (LLM)`. Timestamp lines look like `**m:ss** text`. When at least one segment parses, the capture view shows a **subtitle panel** in the **right column** (list on top, **toolbar below** the list) with seek + highlight. Playback **auto-scrolls only inside** `#yt-sub-list` (centered reading position with top/end clamping). **`overscroll-behavior: contain`** avoids chaining scroll to the page. The collapsible **Transcript gốc (markdown)** (`#yt-sub-raw`) is a **third row inside `.yt-split`**: on wide viewports it **spans both grid columns** (`grid-column: 1 / -1`), matching the horizontal extent of sections like **note.md**; stacked layout keeps it full width below the two blocks.
4. **Milestones:** If `milestones.yaml` exists, parse the `milestones` list (`t` in seconds, `label`, optional `kind: chapter | highlight`). Use for a timeline and **seek**:
   - **Simple seek (legacy embed):** set iframe `src` to `...&start={t}&autoplay=1` (reloads player).
   - **Smooth seek (subtitle panel path):** `player.seekTo(t, true)` via IFrame API.

### Digest / challenge

- Digests: `vault/Digests/YYYY-Www.md`
- Challenges: `vault/Challenges/YYYY-Www.md` (from `pnpm challenge`)
- Reader API: `GET /api/digests/:week` (markdown), `GET /api/challenges/:week` (404 if missing). On digest detail (`#/digest/YYYY-Www`), the UI loads both and renders the challenge section below the digest when the file exists.

## CLI helpers related to reader data

| Command | Purpose |
|---------|---------|
| `pnpm ingest -- <url> --translate-transcript` | New YouTube capture with **Vi** transcript (OpenAI batch, same idea as `youtube-crawl-translate`) |
| `pnpm translate-transcript -- --capture <dir>` | Add/replace `## Transcript (vi)` on an existing capture |
| `pnpm suggest-milestones -- --capture <dir> --max-sec <n>` | Merge LLM-suggested `milestones.yaml` |

## Repo layout

The [`reader-web/`](../reader-web/) package is the canonical app; it can stay here or move to its own repo / monorepo package. Keep the **vault path** configurable (`READER_VAULT_ROOT` or `VAULT_ROOT`).
