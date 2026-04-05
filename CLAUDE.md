# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A **Python FastAPI** ingest service under `api/` plus a **reader** package in `reader/` (Vite + Node middleware). URLs are routed via YAML, fetched through adapters, normalised, written to an Obsidian vault, and optionally enriched with OpenAI. The reader proxies ingest to **`POST /v1/ingest`** when **`PYTHON_INGEST_URL`** is set.

## Commands

All **pnpm** commands run from **`reader/`** (after `cd reader && pnpm install`):

```bash
cd reader && pnpm install
pnpm dev                              # Vite + vault API (port 5174)
pnpm test                             # Vitest — tests/
pnpm test:watch                       # Watch mode
pnpm typecheck                        # tsc: app + ../scripts/*.ts
pnpm api:test                         # pytest in ../api
pnpm api:dev                          # FastAPI (port 8765)
pnpm verify-keys                      # from repo root cwd (cd .. && tsx scripts/…)
pnpm verify-apify-youtube
pnpm verify-x-tweet
```

**Single test file:** `cd reader && pnpm exec vitest run tests/path/to/file.test.ts`

**Python:** `cd api && uv run pytest` (or `pnpm api:test` from `reader/`).

## Architecture

**Pipeline (Python):** `api/src/brain_api/` — adapters, normaliser, vault writer, LLM, `routes/ingest.py`, `progress.py` (v1 NDJSON for SSE).

**Reader:** `reader/src/main.ts`, `reader/vault/apiMiddleware.ts`, `reader/vault/pythonIngest.ts`.

**Repo scripts (TypeScript):** `scripts/*.ts` — run via pnpm scripts in `reader/package.json` (`cd .. && tsx scripts/…`). Minimal `scripts/package.json` with `"type":"module"` for `tsc`.

## Project Conventions

- **ESM** in TS; **Node >=20**
- **Python** in `api/` — `uv run` / `pytest`
- **Conventional commits**: `fix:`, `feat:`, `docs:`, `chore:`
- **Config:** `.env` and `config/routing.yaml` gitignored; templates under `config/*.example.yaml`
- **Vault** (`vault/`) gitignored

## Environment Variables

See `README.md` and `api/README.md`. Reader: `reader/.env` for `PYTHON_INGEST_URL`, `INGEST_API_KEY`, vault paths.
