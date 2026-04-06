# Second brain

Ingest URLs into an **Obsidian vault** (`Captures/…`) with optional **OpenAI** enrichment. The **ingest pipeline lives in Python** under [`api/`](api/) (FastAPI). The optional **reader** UI in [`reader/`](reader/) talks to that API via **`PYTHON_INGEST_URL`** (e.g. `http://127.0.0.1:8765`).

Routing is YAML: HTTP + Readability, Apify actors, YouTube via Apify, or X API v2. Committed templates: [`config/routing.example.yaml`](config/routing.example.yaml). The API uses [`api/config/routing.default.yaml`](api/config/routing.default.yaml) by default, with optional **`ROUTING_CONFIG_PATH`** / **`CATEGORIES_CONFIG_PATH`** (see [`api/README.md`](api/README.md)).

## Setup

**Node / reader** (one package for the web app, Vitest, and repo helper scripts):

```bash
cd reader && pnpm install
cp config/routing.example.yaml config/routing.yaml   # optional: for verify script + operator reference
touch .env   # repo root; add keys from the Environment table (never commit .env)
```

**Python API:** see [`api/README.md`](api/README.md) (`uv sync` / `uv run` from `api/`).

- **Vault:** `VAULT_ROOT` (API and reader; default `./vault` relative to how you start each process).
- **Secrets:** put real keys only in **`.env`** at repo root (gitignored). The Python API also reads **`api/.env`** if present (see `brain_api.settings`).
- **`vault/`** is gitignored (local Obsidian data).
- **Wiki layer (optional):** seed `Wiki/` beside `Captures/` from [`vault-template/Wiki/`](vault-template/Wiki/) — see [`vault-template/README.md`](vault-template/README.md) and [`PLAN.md`](PLAN.md) §1.

## Commands

Run from **`reader/`** (`cd reader` first), except raw `uv`/`pytest` in `api/`:

| Command | Description |
|--------|-------------|
| `pnpm dev` | Reader Vite dev server (set **`PYTHON_INGEST_URL`** in `reader/.env`). |
| `pnpm api:dev` | FastAPI ingest API (default **8765**). |
| `pnpm api:test` | Python tests (`pytest` in `api/`). |
| `pnpm test` / `pnpm test:watch` | Vitest — `reader/tests/`. |
| `pnpm typecheck` | `tsc` for reader + `scripts/*.ts` at repo root. |
| `pnpm verify-keys` | Smoke-check **OpenAI** / **Apify** / **X** from `.env` (cwd = repo root). |
| `pnpm verify-apify-youtube` | **`APIFY_TOKEN`** + YouTube actor from `config/routing.yaml` (or example). |
| `pnpm verify-x-tweet [id]` | X API v2 tweet lookup (app-only bearer). |

**Ingest từ HTTP:** `POST /v1/ingest` trên API Python (JSON body `url` hoặc `reingest_capture_dir`) — xem [`api/README.md`](api/README.md). Reader dùng SSE qua `/api/ingest/start` + `/api/ingest/stream`.

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENAI_API_KEY` | For LLM | Summaries on `note.md`; YouTube EN→VI when segments exist. |
| `OPENAI_MODEL` | No | Default `gpt-4o-mini`. |
| `ENRICH_*`, `YT_TRANSLATE_*` | No | Same semantics as API docs / `brain_api.settings`. |
| `APIFY_TOKEN` | For Apify routes | Actor runs. |
| `X_BEARER_TOKEN` | For `x_api` | X API v2 app-only bearer. Optional **`twitter-cli`** + cookies for full X Article bodies (`scripts/fetch-x-article.py`). |
| `VAULT_ROOT` | No | Vault directory. |
| `PYTHON_INGEST_URL` | **Yes for reader ingest** | Base URL of the FastAPI app (e.g. `http://127.0.0.1:8765`). |
| `INGEST_API_KEY` | No | Shared secret: API expects `X-Ingest-Key` when set; reader sends it if `reader/.env` matches. |

## Testing integrations

1. **`cd reader && pnpm verify-keys`** — OpenAI / Apify / X reachability.
2. **`cd reader && pnpm verify-apify-youtube`** — routing YAML + YouTube Apify actor (costs compute unless `--token-only`).
3. **`cd reader && pnpm api:test`** — unit/integration tests for the Python pipeline.

## Apify + YouTube

When routing uses strategy **`apify`** for `youtube.com` / `youtu.be`, the **Python** adapter runs your pinned actor. Field **`youtubeInput`** in YAML chooses input shape (`urls` vs `start_urls`) — see comments in [`config/routing.example.yaml`](config/routing.example.yaml).

## Reader web

[`reader/README.md`](reader/README.md) and [`docs/reader.md`](docs/reader.md). Ingest trong UI **bắt buộc** Python API (`PYTHON_INGEST_URL`).

### Screenshots

![Reader web — home](docs/screenshots/reader-home.png)

![Reader web — captures library](docs/screenshots/reader-captures.png)

## MVP limits

- **X:** API v2 + optional article helper script.
- **YouTube:** transcript qua Apify; dịch Vi trong pipeline ingest Python.
- **Meta Threads:** không hỗ trợ ingest.
