# Second Brain API

Python **FastAPI** service for the Brain ingest pipeline: routing YAML → adapters → vault writer → optional OpenAI (enrich, tags, categories, YouTube transcript translation).

## Setup

```bash
cd api && uv sync
```

The API reads **`.env`** from the **current working directory** when you start uvicorn (often repo root or `api/`). Required for a real server: **`VAULT_ROOT`**. Optional: `OPENAI_API_KEY`, `APIFY_TOKEN`, `X_BEARER_TOKEN`, `INGEST_API_KEY`, `ROUTING_CONFIG_PATH`, `CATEGORIES_CONFIG_PATH`, and the same enrich/translate env vars as the CLI (see root `README.md`).

## Tests

```bash
cd api && uv run pytest
# or from repo root:
pnpm api:test
```

Run a single file:

```bash
cd api && uv run pytest tests/test_x_api.py -v
```

## Run locally

```bash
cd api && uv run uvicorn brain_api.main:app --reload --host 127.0.0.1 --port 8765
```

Health check:

```bash
curl -s http://127.0.0.1:8765/health
```

Expected: `{"ok":true}`

## Ingest API (`POST /v1/ingest`)

When **`INGEST_API_KEY`** is unset or empty, ingest authentication is **disabled** (convenient for local development): requests do not need the `X-Ingest-Key` header.

When **`INGEST_API_KEY`** is set to a non-empty value, every ingest request must send that value in the **`X-Ingest-Key`** header; otherwise the API responds with **401** and a JSON body `{"message": "..."}`.

The response body is newline-delimited JSON (NDJSON) progress events (`application/x-ndjson`), matching the CLI `--progress-json` shape (see `brain_api.progress`).

### Routing and X

- Default routing file: **`api/config/routing.default.yaml`**. Override with **`ROUTING_CONFIG_PATH`** (absolute or relative path).
- **`x_api`** strategy needs **`X_BEARER_TOKEN`** (or `x_bearer_token` in settings). Full **X Article** bodies use the same optional path as the CLI: `uv run --with twitter-cli python3 scripts/fetch-x-article.py <tweet_id>` from the **repo root**, with **`TWITTER_AUTH_TOKEN`** and **`TWITTER_CT0`** set.

## Taxonomy

`GET /v1/taxonomy/categories` — category ids/labels from YAML (default `api/config/categories.default.yaml`, override with **`CATEGORIES_CONFIG_PATH`**).
