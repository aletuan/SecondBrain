# Reader web

Vite SPA over your **local** Obsidian vault (same contract as [`docs/reader-web.md`](../docs/reader-web.md)): **ingest URL** (same as `pnpm ingest` in the Brain CLI), captures list, capture detail with rendered `note.md`, YouTube embed + transcript tabs (EN / VI / both), milestone seek, and digests.

Layout and tokens follow [`docs/visualizations/second-brain-mock-ui.html`](../docs/visualizations/second-brain-mock-ui.html). Timeline/seek behaviour from [`reader-youtube-timeline.html`](../docs/visualizations/reader-youtube-timeline.html) is folded into the YouTube capture view here; the standalone HTML remains a small static demo.

## Requirements

- Node 20+
- `pnpm` (from repo root or here)

## Setup

```bash
cd reader-web
pnpm install
# optional: touch .env and set READER_VAULT_ROOT / READER_BRAIN_ROOT (see Environment below)
```

## Commands

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Vite dev server (default port **5174**) + `/api/*` vault middleware |
| `pnpm build` | Production client bundle → `dist/` |
| `pnpm preview` | Build then Express: static `dist/` + same `/api/*` (port **4173** or `READER_PORT`) |
| `pnpm typecheck` | `tsc --noEmit` for `src/`, `vault/`, Vite config, `serve.ts` |

Open `http://127.0.0.1:5174` (dev) or the preview URL. Routes use the hash: `#/`, `#/captures`, `#/capture/:id`, `#/digests`, `#/digest/:week`.

**Fresh UI while coding:** dev server sends `Cache-Control: no-store` so the browser should not reuse old JS. If something still looks stale, open DevTools → **Network** → enable **Disable cache** (while DevTools is open), then reload. After code changes, save the file and do a normal reload; restart `pnpm dev` if you had switched branches or killed the server.

## Environment

| Variable | Purpose |
|----------|---------|
| `READER_VAULT_ROOT` | Vault path (preferred for this app) |
| `VAULT_ROOT` | Same as CLI; used if `READER_VAULT_ROOT` unset |
| `READER_BRAIN_ROOT` | Brain CLI repo (contains `src/cli.ts`); default parent of `reader-web/` |
| `READER_ALLOW_INGEST` | `0` / `false` disables `POST /api/ingest` |
| `READER_PORT` | Preview server port (default `4173`) |

If neither vault env is set, the app resolves `../vault` from the `reader-web/` working directory.

## API (local middleware)

- `GET /api/health` — `vaultRoot`, `brainRoot`, `ingestAvailable` (CLI found + ingest not disabled)
- `POST /api/ingest` — JSON `{ "url": "https://…", "noLlm"?: boolean, "translateTranscript"?: boolean }` → runs `pnpm ingest` in `READER_BRAIN_ROOT` with `VAULT_ROOT` set to the reader vault. **Local-only**; set `READER_ALLOW_INGEST=0` to turn off. The **web UI** always uses LLM enrichment (never `noLlm`) and turns on transcript translation automatically for YouTube URLs only; other clients may still send the optional flags.
- `GET /api/captures` — list captures
- `GET /api/captures/:id` — capture payload (markdown, frontmatter, YouTube, transcripts, milestones)
- `GET /api/captures/:id/assets/*` — image files from `assets/`
- `GET /api/digests`, `GET /api/digests/:week`
- `GET /api/challenges/:week` — markdown from `Challenges/YYYY-Www.md` (404 if missing; digest detail UI loads this in parallel)

## Obsidian CLI (optional batch)

If you use the official Obsidian CLI for batch tagging, keep commands in your private notes. A short note lives at [`docs/integrations/obsidian-cli-batch.md`](../docs/integrations/obsidian-cli-batch.md).
