# Reader web

Vite SPA over your **local** Obsidian vault (same contract as [`docs/reader.md`](../docs/reader.md)): **ingest URL** (via Python API), captures list, capture detail with rendered `note.md`, YouTube embed + transcript tabs (EN / VI / both), and milestone seek.

Layout and tokens follow [`docs/visualizations/second-brain-mock-ui.html`](../docs/visualizations/second-brain-mock-ui.html).

## Requirements

- Node 20+
- `pnpm` (from repo root or here)
- **Python ingest API** running and **`PYTHON_INGEST_URL`** set (e.g. `http://127.0.0.1:8765`) — ingest is not available without it.

## Setup

```bash
cd reader
pnpm install
# Create reader/.env with at least PYTHON_INGEST_URL (and optional INGEST_API_KEY to match the API)
```

## Commands

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Vite dev server (default port **5174**) + `/api/*` vault middleware |
| `pnpm build` | Production client bundle → `dist/` |
| `pnpm preview` | Build then Express: static `dist/` + same `/api/*` (port **4173** or `READER_PORT`) |
| `pnpm typecheck` | `tsc --noEmit` for `src/`, `vault/`, Vite config, `serve.ts` |

Open **`http://127.0.0.1:5174`** for dev. From the Brain repo root: `pnpm reader:dev`.

**Live reload vs restart**

| What you change | What to do |
|-----------------|------------|
| `reader/src/*` (UI, `main.ts`, `style.css`) | Save — Vite hot-reloads. |
| `reader/vault/*.ts` (Connect `/api/*` middleware) | **Restart** `pnpm dev`. |
| `reader/vite.config.ts` | **Restart** `pnpm dev`. |

## Environment

| Variable | Purpose |
|----------|---------|
| `READER_VAULT_ROOT` | Vault path (preferred for this app) |
| `VAULT_ROOT` | Fallback if `READER_VAULT_ROOT` unset |
| `READER_BRAIN_ROOT` | Brain monorepo root (default parent of `reader/`) — used for on-disk `config/` when taxonomy is not proxied |
| `READER_ALLOW_INGEST` | `0` / `false` disables ingest routes |
| `READER_PORT` | Preview server port (default `4173`) |
| `READER_DEV_HOST` | Dev + HMR bind host (default `127.0.0.1`) |
| `READER_VITE_POLL` | `1` / `true` for Vite polling watcher |
| **`PYTHON_INGEST_URL`** | **Required** for ingest — FastAPI base URL (e.g. `http://127.0.0.1:8765`) |
| `INGEST_API_KEY` | When the API sets `INGEST_API_KEY`, forward the same value so the reader sends `X-Ingest-Key` |

If neither vault env is set, the app resolves `../vault` from the `reader/` working directory.

## API (local middleware)

- `GET /api/health` — `vaultRoot`, `brainRoot`, `ingestAvailable`, `ingestSse`, `ingestBackend`: `python` \| `null`
- `POST /api/ingest` — JSON `{ "url": "https://…" }` → proxies Python `POST /v1/ingest` (NDJSON). Local-only; `READER_ALLOW_INGEST=0` disables.
- `POST /api/ingest/start` + `GET /api/ingest/stream?jobId=…` — SSE progress for the web UI.
- `GET /api/taxonomy/categories` — proxies Python when `PYTHON_INGEST_URL` is set; otherwise reads `config/categories*.yaml` under `READER_BRAIN_ROOT`.
- `GET /api/captures`, `GET /api/captures/:id`, reactions routes, `GET /api/captures/:id/assets/*` — vault on disk.

## Obsidian CLI (optional batch)

If you use the official Obsidian CLI for batch tagging, keep commands in your private notes. See [`docs/integrations/obsidian-cli-batch.md`](../docs/integrations/obsidian-cli-batch.md).
