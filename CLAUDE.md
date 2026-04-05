# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A **Python FastAPI** ingest service under `api/` plus an optional **reader** (Vite + Node middleware in `reader/`). URLs are routed via YAML, fetched through adapters (HTTP/Readability, Apify, YouTube via Apify, X API v2), normalised, written to an Obsidian vault, and optionally enriched with OpenAI. The reader proxies ingest to **`POST /v1/ingest`** when **`PYTHON_INGEST_URL`** is set.

## Commands

```bash
pnpm install                          # Root: scripts + vitest deps
pnpm -C reader install                # Reader package
pnpm test                             # Vitest — reader/tests only
pnpm test:watch                       # Watch mode
pnpm typecheck                        # Root tsc (scripts + reader tests) + reader package tsc
pnpm api:test                         # Python API tests (pytest in api/)
pnpm api:dev                          # FastAPI ingest API (default port 8765)
pnpm reader:dev                       # Reader dev server (needs PYTHON_INGEST_URL in reader/.env)
```

**Single test file:** `pnpm vitest run reader/tests/path/to/file.test.ts`

**Python single test:** `cd api && uv run pytest tests/test_foo.py`

## Architecture

**Pipeline (Python):** URL → Router → Adapter → Normaliser → Vault Writer → LLM / translate phases

- **Code:** `api/src/brain_api/` — `adapters/`, `normaliser.py`, `vault/writer.py`, `llm/`, `ingest/run_ingest.py`, `routes/ingest.py`, `progress.py` (v1 NDJSON for SSE).
- **Config defaults:** `api/config/routing.default.yaml`, `api/config/categories.default.yaml`; overrides via **`ROUTING_CONFIG_PATH`** / **`CATEGORIES_CONFIG_PATH`**.
- **Core model:** `CaptureBundle` in `api/src/brain_api/types/capture.py`.

**Reader:** `reader/src/main.ts` (UI), `reader/vault/apiMiddleware.ts` (Connect `/api/*`), `reader/vault/pythonIngest.ts` (HTTP client to Python API).

## Project Conventions

- **ESM** in TS (`"type": "module"`), **Node >=20**
- **Python** in `api/` — `uv run` / `pytest` (see `api/README.md`)
- **Conventional commits**: `fix:`, `feat:`, `docs:`, `chore:` prefixes
- **LLM prompts** for note content often use **Vietnamese** headings (Tóm tắt, Insight, …)
- **Config:** `.env` and `config/routing.yaml` gitignored; committed templates under `config/*.example.yaml`
- **Vault** (`vault/`) gitignored

## Environment Variables

Set in `.env` at repo root and/or `api/.env` (see `brain_api.settings` load order). Reader: `reader/.env` for `PYTHON_INGEST_URL`, `INGEST_API_KEY`, vault paths.

| Variable | Purpose |
|----------|---------|
| `VAULT_ROOT` | Obsidian vault path |
| `PYTHON_INGEST_URL` | Reader → Python API base URL |
| `OPENAI_API_KEY` | Enrichment + default YouTube Vi transcript batch |
| `APIFY_TOKEN` | Apify actors |
| `X_BEARER_TOKEN` | X API v2 |
| `INGEST_API_KEY` | Optional shared secret for `POST /v1/ingest` |

See `README.md` and `api/README.md` for the full tables.
