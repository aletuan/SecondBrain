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
