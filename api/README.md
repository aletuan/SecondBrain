# Second Brain API

Python FastAPI service for ingest (scaffold).

## Setup

```bash
cd api && uv sync
```

## Tests

```bash
cd api && uv run pytest
```

Run a single file:

```bash
cd api && uv run pytest tests/test_progress.py -v
```

## Run locally

```bash
cd api && uv run uvicorn brain_api.main:app --reload --port 8765
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
