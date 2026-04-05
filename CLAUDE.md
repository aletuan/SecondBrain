# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A TypeScript CLI that ingests URLs into an Obsidian vault with AI enrichment. URLs are routed to adapters (HTTP/Readability, Apify, X API v2), normalised into a `CaptureBundle`, written to the vault, and optionally enriched via OpenAI. A **Python FastAPI** service under `api/` implements the same ingest pipeline for the reader when **`PYTHON_INGEST_URL`** is set.

## Commands

```bash
pnpm install                          # Install dependencies
pnpm test                             # Run all tests (vitest)
pnpm test:watch                       # Watch mode
pnpm typecheck                        # TypeScript strict check (no emit)
pnpm api:test                         # Python API tests (pytest in api/)
pnpm api:dev                          # FastAPI ingest API (default port 8765)
pnpm ingest <url>                     # Ingest (LLM on note.md + YouTube Vi transcript when OPENAI_API_KEY + segments)
pnpm exec tsx cli/src/cli.ts ingest [options] <url>          # Prefer for options, e.g. --progress-json (avoids stray `--` in argv)
pnpm translate-transcript -- --capture path/to/Captures/…   # Add/replace ## Transcript (vi) on disk
pnpm suggest-milestones -- --capture path/to/Captures/… --max-sec 600
```

**Reader web** (optional, separate package): `cd reader && pnpm install && pnpm dev` (or repo root `pnpm reader:dev`) — local UI over the vault; ingest from the UI either shells the CLI in `READER_BRAIN_ROOT` or proxies to the Python API when **`PYTHON_INGEST_URL`** is set. See `reader/README.md` and `docs/reader.md`.

Run a single test file: `pnpm vitest run cli/tests/path/to/file.test.ts` (CLI) or `pnpm vitest run reader/tests/…` (reader).

## Architecture

**Pipeline**: URL → Router → Adapter → Normaliser → Vault Writer → LLM Enrichment

- **Router** (`cli/src/router.ts`): YAML config (`config/routing.yaml`) maps host/path patterns to adapter strategies
- **Adapters** (`cli/src/adapters/`): Fetch content per strategy — `httpReadability.ts` (default, Mozilla Readability + jsdom), `apify.ts` (Apify actors), `youtube.ts` (transcripts via Apify), `xApi.ts` (X API v2 with article/long-post support). **Python parity**: `api/src/brain_api/adapters/` (`http_readability`, `apify_generic`, `youtube`, `x_api`).
- **Normaliser** (`cli/src/normaliser.ts`): Raw HTML → `CaptureBundle` (title, text, images, code blocks)
- **Vault Writer** (`cli/src/vault/writer.ts`): Writes `Captures/YYYY-MM-DD--slug--hash/` with `source.md`, `note.md`, `assets/`
- **LLM Enrichment** (`cli/src/llm/enrich.ts`): Appends Vietnamese-language sections (Tóm tắt, Insight) to the capture note via OpenAI
- **Translate transcript** (`cli/src/llm/translateTranscript.ts`): Batch EN→VI for YouTube segments (aligned with `youtube-crawl-translate` JSON-array pattern)
- **Milestones** (`cli/src/youtube/milestones.ts`, `suggestMilestones.ts`): `milestones.yaml` + optional LLM suggestions

**Core type**: `CaptureBundle` in `cli/src/types/capture.ts` — the normalised data structure that flows through the pipeline.

## Project Conventions

- **ESM-only** (`"type": "module"`) — no CommonJS, uses `tsx` for runtime execution
- **Node >=20** required
- **Strict TypeScript** — no emit, type-checking only via `pnpm typecheck`
- **Conventional commits**: `fix:`, `feat:`, `docs:`, `chore:` prefixes
- **LLM prompts are in Vietnamese** — summaries, insights, questions all use Vietnamese headings
- **Mock interfaces** for testing: adapters expose `*ClientLike` interfaces (e.g., `ApifyClientLike`, `OpenAIClientLike`) for dependency injection in tests
- **Config files**: `.env` and `config/routing.yaml` are gitignored; `config/routing.example.yaml` is the committed routing template — create `.env` locally (see README Environment table; no committed `.env.example`)
- **Vault directory** (`vault/`) is gitignored — local Obsidian data stays local

## Environment Variables

Set in `.env` at repo root (create the file; variables below):

| Variable | Purpose |
|----------|---------|
| `VAULT_ROOT` | Path to Obsidian vault (default: `./vault`) |
| `OPENAI_API_KEY` | OpenAI API key for LLM enrichment and default YouTube Vi transcript batch (when segments exist) |
| `OPENAI_MODEL` | Model name (default: `gpt-4o-mini`) |
| `ENRICH_MODEL` | Optional model **only** for ingest `enrichNote` (falls back to `OPENAI_MODEL`) |
| `ENRICH_MAX_CHARS` | Max chars of `source.md` body sent to enrich (default 12000; long input uses head+tail) |
| `ENRICH_TEMPERATURE` | Optional. Temperature for ingest `enrichNote` (0–2). If unset or invalid, defaults to `0.3`. |
| `ENRICH_MAX_COMPLETION_TOKENS` | Optional. `max_tokens` for enrich completion only (256–32000). Default `4096` when unset/invalid. |
| `APIFY_TOKEN` | Apify API token for web/YouTube crawling |
| `X_BEARER_TOKEN` | X API v2 bearer token |
| `CAPTURE_IMAGE_MAX_BYTES` | Per-image download size limit |
| `YT_TRANSLATE_BATCH` | Lines per batch for transcript translation (default 20) |
| `YT_TRANSLATE_MODEL` | Optional model override for translation |
