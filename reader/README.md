# Reader web

Vite SPA over your **local** Obsidian vault (same contract as [`docs/reader.md`](../docs/reader.md)): **ingest URL** (same as `pnpm ingest` in the Brain CLI), captures list, capture detail with rendered `note.md`, YouTube embed + transcript tabs (EN / VI / both), and milestone seek.

Layout and tokens follow [`docs/visualizations/second-brain-mock-ui.html`](../docs/visualizations/second-brain-mock-ui.html). Timeline/seek behaviour from [`reader-youtube-timeline.html`](../docs/visualizations/reader-youtube-timeline.html) is folded into the YouTube capture view here; the standalone HTML remains a small static demo.

## Requirements

- Node 20+
- `pnpm` (from repo root or here)

## Setup

```bash
cd reader
pnpm install
# optional: touch .env and set READER_VAULT_ROOT / READER_BRAIN_ROOT (see Environment below)
```

## Commands

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Vite dev server (default port **5174**) + `/api/*` vault middleware |
| `pnpm build` | Production client bundle → `dist/` |
| `pnpm preview` | Build then Express: static `dist/` + same `/api/*` (port **4173** or `READER_PORT`) |
| `pnpm typecheck` | `tsc --noEmit` for `cli/src/`, `vault/`, Vite config, `serve.ts` |

Open **`http://127.0.0.1:5174`** for dev (same host Vite binds to by default — avoids some HMR WebSocket issues when `localhost` vs `127.0.0.1` disagree). From the Brain repo root you can run `pnpm reader:dev` (same as `cd reader && pnpm dev`). Routes use the hash: `#/`, `#/captures`, `#/capture/:id`. Legacy bookmarks `#/digests` or `#/digest/…` redirect to `#/captures`.

**Live reload vs restart**

| What you change | What to do |
|-----------------|------------|
| `reader/src/*` (UI, `main.ts`, `style.css`) | Save the file — Vite **hot-updates** or **full page reload** automatically. No need to restart the dev server. |
| `reader/vault/*.ts` (Connect `/api/*` middleware) | **Restart** `pnpm dev` — middleware is registered once at startup. The dev server prints a yellow hint when you save these files. |
| `reader/vite.config.ts` | **Restart** `pnpm dev`. |
| `pnpm preview` / `dist/` | **No HMR.** Run `pnpm build` again (or use `pnpm dev` while iterating). |

**If the browser still looks stale:** confirm you are on **`pnpm dev`** (port **5174**), not **`pnpm preview`** (port **4173**, static `dist/`). Then DevTools → **Network** → **Disable cache**, hard-reload. Optional: `READER_VITE_POLL=1 pnpm dev` if file saves are not detected (Docker bind mounts, some network disks). Optional: `READER_DEV_HOST=0.0.0.0` to listen on all interfaces (local network only — do not expose to the internet).

**Fresh UI while coding:** dev server sends strong no-cache headers (`no-store`, `Pragma`, `Expires`) via `server.headers` plus an early Connect middleware (`reader-dev-no-cache` in `vite.config.ts`), and `index.html` includes `http-equiv` hints. `serve.ts` preview uses the same policy for `dist/`.

## Environment

| Variable | Purpose |
|----------|---------|
| `READER_VAULT_ROOT` | Vault path (preferred for this app) |
| `VAULT_ROOT` | Same as CLI; used if `READER_VAULT_ROOT` unset |
| `READER_BRAIN_ROOT` | Brain CLI repo (contains `cli/src/cli.ts`); default parent of `reader/` |
| `READER_ALLOW_INGEST` | `0` / `false` disables ingest routes (`POST /api/ingest`, start/stream) |
| `READER_PORT` | Preview server port (default `4173`) |
| `READER_DEV_HOST` | Dev + HMR bind host (default `127.0.0.1`). Use `0.0.0.0` only on trusted LAN. |
| `READER_VITE_POLL` | Set to `1` or `true` so Vite watches files with polling (fixes missed saves on Docker / some disks). |

If neither vault env is set, the app resolves `../vault` from the `reader/` working directory.

## API (local middleware)

- `GET /api/health` — `vaultRoot`, `brainRoot`, `ingestAvailable`, `ingestSse` (same as `ingestAvailable` when the SSE ingest flow is built in)
- `POST /api/ingest` — JSON `{ "url": "https://…" }` → runs the Brain CLI ingest in `READER_BRAIN_ROOT` with `VAULT_ROOT` set to the reader vault (same behaviour as CLI: LLM when `OPENAI_API_KEY`; YouTube Vi transcript when segments + key). **Local-only**; set `READER_ALLOW_INGEST=0` to turn off. The **web UI** uses SSE (`/start` + `/stream`) when `ingestSse` is true; otherwise it falls back to this endpoint.
- `POST /api/ingest/start` — body `{ "url": "https://…" }` → `{ ok, jobId }`. Open `GET /api/ingest/stream?jobId=…` as **SSE** (`text/event-stream`); each event is `data: <JSON>` with `v:1` and `kind`: `phase` \| `done` \| `error` (CLI `--progress-json` on stderr, forwarded by the server).
- `GET /api/captures` — list captures (each item includes `publish`, `reaction_avg`, `reaction_count` from `{slug}.comment` when present; the library table shows average rating, not publish state)
- `GET /api/captures/:id` — capture payload (markdown, frontmatter, YouTube, transcripts, milestones)
- `GET /api/captures/:id/reactions` — reader reactions timeline parsed from `{slug}.comment` in the capture folder (JSON `{ entries: [{ at, rating, text? }] }`; empty file → `entries: []`)
- `POST /api/captures/:id/reactions` — JSON `{ "rating": 1-5, "comment"?: string }` appends one Markdown entry to `{slug}.comment` (UTF-8). Comment optional; max length 8000 chars. Returns `{ ok: true }` or `{ error }`.
- `GET /api/captures/:id/assets/*` — image files from `assets/`
## Obsidian CLI (optional batch)

If you use the official Obsidian CLI for batch tagging, keep commands in your private notes. A short note lives at [`docs/integrations/obsidian-cli-batch.md`](../docs/integrations/obsidian-cli-batch.md).
