# Python ingest backend & CLI removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use @superpowers:subagent-driven-development (recommended) or @superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the TypeScript `cli/` ingest stack with a **Python FastAPI service** on the same machine, keep the **vault path unchanged**, and remove **all** CLI entrypoints; the reader keeps its **SSE ingest UX** by having **Connect middleware** call the Python API (server-side) instead of spawning `tsx`.

**Architecture:** **`api/`** holds **all** ingest intelligence: **default `api/config/routing.default.yaml` + `categories.default.yaml`**, optional **`ROUTING_CONFIG_PATH`** / **`CATEGORIES_CONFIG_PATH`**, plus ported **router, adapters, normaliser, vault, LLM** from `cli/src/*`. FastAPI: **`POST` ingest** (stream, same v1 progress JSON as TS), **`GET` taxonomy**, future analysis routes. Reader **proxies** to Python (`PYTHON_INGEST_URL`); **no** ingest YAML under monorepo root `config/`. Delete `cli/` and root ingest `config/` templates; **Vitest** reader-only; **pytest** for `api/`.

**Tech Stack:** Python 3.11+, FastAPI, Uvicorn, Pydantic v2, PyYAML, httpx, pytest; HTML extraction via **readability-lxml** and/or **trafilatura** (evaluate parity vs `@mozilla/readability`+jsdom); OpenAI **official Python SDK**; Apify **Python client**; X API via httpx.

**Spec:** `docs/superpowers/specs/2026-04-05-python-backend-no-cli-design.md`

---

## File map (target)

| Area | Create / keep | Remove / stop using |
|------|----------------|---------------------|
| Python service | `api/config/routing.default.yaml` (migrate from `config/routing.example.yaml`), `api/config/categories.default.yaml`, `api/src/brain_api/…`, routes **ingest / taxonomy / health**, all analysis logic | Root **`config/routing.example.yaml`**, **`config/categories.example.yaml`**, gitignored root `config/*.yaml` |
| Tests | `api/tests/conftest.py`, `api/tests/test_progress.py`, `api/tests/test_ingest_e2e.py`, … | `cli/tests/**` |
| Reader | `reader/vault/ingestBackend.ts` or inline in `apiMiddleware.ts` — **ingest stream** + **proxy `GET /api/taxonomy/categories` → Python** | `reader/vault/runIngestCli.ts`; middleware path that reads `config/categories*.yaml` from disk |
| Reader | `reader/vault/paths.ts`, `brainDotenv.ts` — adjust `assertIngestEnvironment` | Check for `cli/src/cli.ts` |
| Root | `.env.example` rows for `PYTHON_INGEST_URL`, `INGEST_API_KEY`, `UVICORN_PORT` | `package.json` scripts: `ingest`, `translate-transcript`, `suggest-milestones`, TS verify scripts that import `cli/` |
| Root | Optional: `pnpm api:dev` → `cd api && uv run uvicorn …` | Entire `cli/` tree |
| Docs | `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/reader.md`, `reader/README.md` | CLI-first instructions |

---

## Phase 0 — Scaffold & contract lock

### Task 0: Python package skeleton

**Files:**
- Create: `api/pyproject.toml` (name `second-brain-api`, deps: fastapi, uvicorn[standard], pydantic-settings, pyyaml, httpx, pytest)
- Create: `api/src/brain_api/main.py` (FastAPI app factory)
- Create: `api/README.md` (how to run uvicorn locally)

- [ ] **Step 1:** Add `pyproject.toml` with `[project]` and `[tool.pytest.ini_options]` `pythonpath = ["src"]`.

- [ ] **Step 2:** Implement minimal app:

```python
# api/src/brain_api/main.py
from fastapi import FastAPI

def create_app() -> FastAPI:
    app = FastAPI(title="Second Brain API", version="0.1.0")
    @app.get("/health")
    def health():
        return {"ok": True}
    return app

app = create_app()
```

- [ ] **Step 3:** Run `cd api && uv sync` (or `pip install -e .`) and `uv run uvicorn brain_api.main:app --reload --port 8765`.

- [ ] **Step 4:** `curl -s http://127.0.0.1:8765/health` → `{"ok":true}`

- [ ] **Step 5:** Commit `feat(api): scaffold FastAPI service`

---

### Task 1: Progress schema (shared contract)

**Files:**
- Create: `api/src/brain_api/progress.py`
- Create: `api/tests/test_progress.py`

- [ ] **Step 1:** Port types and `format_line` / `try_parse` from `cli/src/ingest/ingestProgress.ts` (v1, kinds `phase`/`done`/`error`, phases `fetch|translate|vault|llm`). Use Pydantic models or TypedDict + validators.

```python
# api/tests/test_progress.py
from brain_api.progress import format_line, try_parse_line

def test_roundtrip_phase():
    line = format_line({"v": 1, "kind": "phase", "phase": "fetch", "state": "active"})
    assert try_parse_line(line) == {"v": 1, "kind": "phase", "phase": "fetch", "state": "active"}
```

- [ ] **Step 2:** `pytest api/tests/test_progress.py -v` → PASS

- [ ] **Step 3:** Commit `test(api): lock ingest progress v1 schema`

---

### Task 2: Settings & env

**Files:**
- Create: `api/src/brain_api/settings.py` (pydantic-settings: **`vault_root`**, `openai_api_key`, `ingest_api_key`, optional **`routing_config_path`**, **`categories_config_path`**, package root for bundled defaults)

- [ ] **Step 1:** Resolve **`VAULT_ROOT`** from env (required for ingest). Resolve bundled YAML paths relative to **`api/`** package / `api/config/` — **do not** use `READER_BRAIN_ROOT` for routing/taxonomy files.

- [ ] **Step 2:** Test: `monkeypatch.setenv` for `VAULT_ROOT` and optional override paths.

- [ ] **Step 3:** Commit `feat(api): settings from env`

---

## Phase 1 — Ingest HTTP surface (stub pipeline)

### Task 3: Authenticated ingest route (stub stream)

**Files:**
- Create: `api/src/brain_api/routes/ingest.py`
- Modify: `api/src/brain_api/main.py` — include router, CORS for `http://127.0.0.1:5174`

- [ ] **Step 1:** `POST /internal/ingest` or `POST /v1/ingest` requiring header `X-Ingest-Key: <INGEST_API_KEY>` (compare to settings).

- [ ] **Step 2:** Body JSON `{"url": "https://example.com"}`. For stub: return streaming response (SSE or `text/plain` newline JSON) emitting one `phase` active/done sequence and a **fake** `done` with placeholder `captureDir`/`captureId` **or** raise `501` until pipeline exists — prefer **real stream shape** with stub events so reader can integrate early.

- [ ] **Step 3:** pytest `TestClient` + stream read asserts lines parse as `IngestProgressEvent`.

- [ ] **Step 4:** Commit `feat(api): authenticated ingest stream stub`

---

## Phase 2 — Port core pipeline (mirror `cli/src`)

Work **bottom-up**: types → vault writer → normaliser → router → adapters → `run_ingest` orchestration. After each slice, pytest + optional golden folder diff.

### Task 4: `CaptureBundle` and types

**Files:**
- Create: `api/src/brain_api/types/capture.py` (mirror `cli/src/types/capture.ts`)

- [ ] **Step 1:** Pydantic models for fields used by writer/normaliser.

- [ ] **Step 2:** Commit `feat(api): capture types`

---

### Task 5: Vault writer parity

**Files:**
- Create: `api/src/brain_api/vault/writer.py` (+ helpers split like TS)
- Create: `api/tests/vault/test_writer.py`
- Reference: `cli/src/vault/writer.ts`, `cli/tests/vault/writer.test.ts`

- [ ] **Step 1:** Port slug/hash/folder naming; run TS tests’ scenarios as pytest fixtures (copy expected strings from TS tests).

- [ ] **Step 2:** `pytest api/tests/vault/test_writer.py -v` → PASS

- [ ] **Step 3:** Commit `feat(api): vault writer parity`

---

### Task 6: Normaliser (HTML → bundle)

**Files:**
- Create: `api/src/brain_api/normaliser.py`
- Create: `api/tests/test_normaliser.py`
- Reference: `cli/src/normaliser.ts`, `cli/tests/normaliser.test.ts`

- [ ] **Step 1:** Choose readability stack; document deltas in `api/README.md` if output differs from jsdom.

- [ ] **Step 2:** Golden HTML snippets from TS tests.

- [ ] **Step 3:** Commit `feat(api): normaliser`

---

### Task 7: Router + routing YAML

**Files:**
- Create: `api/src/brain_api/router.py`, `api/src/brain_api/config/load_routing.py`
- Create: `api/config/routing.default.yaml` (copy/adapt from repo `config/routing.example.yaml` before root removal)
- Reference: `cli/src/router.ts`, `cli/src/config/loadRouting.ts`

- [ ] **Step 1:** Load **default** from `api/config/routing.default.yaml`; if **`ROUTING_CONFIG_PATH`** set, use that file (replace or merge — document choice in `api/README.md`).

- [ ] **Step 2:** pytest with fixture YAML.

- [ ] **Step 3:** Commit `feat(api): URL routing config in api package`

---

### Task 8: Adapters

**Files:**
- Create: `api/src/brain_api/adapters/http_readability.py`, `apify.py`, `youtube.py`, `x_api.py`
- Create: `api/tests/adapters/test_*.py`
- Reference: `cli/src/adapters/*.ts`, `cli/tests/adapters/*.ts`

- [ ] **Step 1:** Port **httpReadability** first (highest traffic).

- [ ] **Step 2:** Port **youtube**, **apify**, **xApi** with same env vars (`APIFY_TOKEN`, `X_BEARER_TOKEN`).

- [ ] **Step 3:** Mock HTTP/Apify in tests; keep one optional integration test marked `@pytest.mark.integration` skipped in CI.

- [ ] **Step 4:** Commit per adapter or one `feat(api): ingest adapters`

---

### Task 8b: Category taxonomy (bundled YAML + `GET`)

**Files:**
- Create: `api/config/categories.default.yaml` (migrate from root `config/categories.example.yaml` before deleting root copy)
- Create: `api/src/brain_api/taxonomy.py` — load default + optional `CATEGORIES_CONFIG_PATH`, export ordered `{ id, label }[]` and `allowed_ids` set
- Create: `api/src/brain_api/routes/taxonomy.py` — `GET /v1/taxonomy/categories` → JSON list
- Create: `api/tests/test_taxonomy.py`

- [ ] **Step 1:** pytest: payload matches file contents; override path env merges/replaces per spec.

- [ ] **Step 2:** Wire router in `main.py`.

- [ ] **Step 3:** Commit `feat(api): taxonomy endpoint and bundled categories`

---

### Task 9: `run_ingest` orchestration + real progress events

**Files:**
- Create: `api/src/brain_api/ingest/run_ingest.py`
- Reference: `cli/src/ingest/runIngest.ts`, `cli/src/cli/ingestCommands.ts`

- [ ] **Step 1:** Emit `phase` events in same order as TS (`fetch` → `translate` → `vault` → `llm`).

- [ ] **Step 2:** Wire `POST /v1/ingest` to call orchestration and stream real events.

- [ ] **Step 3:** Manual: ingest a known URL → folder under vault matches previous layout.

- [ ] **Step 4:** Commit `feat(api): full ingest orchestration`

---

### Task 10: LLM enrich + categories + transcript

**Files:**
- Create: `api/src/brain_api/llm/enrich.py`, `extract_categories.py`, `translate_transcript.py`, `youtube/suggest_milestones.py` as needed
- Reference: `cli/src/llm/*.ts`, `cli/src/youtube/*.ts`

- [ ] **Step 1:** OpenAI SDK calls mirror TS prompts (Vietnamese headings, env `ENRICH_*`).

- [ ] **Step 2:** **`extract_categories`** uses **`taxonomy.allowed_ids`** from Task 8b (same source as `GET`).

- [ ] **Step 3:** pytest with mocked OpenAI client.

- [ ] **Step 4:** Commit `feat(api): LLM and YouTube helpers`

---

### Task 11: Re-ingest endpoint parity

**Files:**
- Modify: `api/src/brain_api/routes/ingest.py`
- Reference: `cli/src/cli.ts` `reingest` command

- [ ] **Step 1:** Support body field `reingest_capture_dir` (absolute path) exclusive with `url`, matching reader’s `runIngestCli` options.

- [ ] **Step 2:** Test with temp vault fixture.

- [ ] **Step 3:** Commit `feat(api): reingest support`

---

## Phase 3 — Reader cutover

### Task 12: Replace CLI spawn with HTTP client in middleware

**Files:**
- Modify: `reader/vault/apiMiddleware.ts` — instead of `runIngestCli`, `fetch(`${process.env.PYTHON_INGEST_URL}/v1/ingest`, { headers: { 'X-Ingest-Key': … }, body, duplex for stream })` or use `undici`/stream handling; forward bytes to SSE `data: …` same as today.
- Modify: `reader/vault/paths.ts` or new helper — `assertIngestEnvironment`: require `PYTHON_INGEST_URL` + reachable health, **remove** `cli/src/cli.ts` check.
- Delete: `reader/vault/runIngestCli.ts` when unused.
- Modify: `reader/vault/brainDotenv.ts` if it injects CLI-specific env.

- [ ] **Step 1:** With Python API running, reader SSE ingest completes and UI shows steps.

- [ ] **Step 1b:** Proxy **`GET /api/taxonomy/categories`** to Python **`GET /v1/taxonomy/categories`**; remove disk read of `config/categories.yaml` in middleware.

- [ ] **Step 2:** `pnpm vitest run reader/tests/readerApiNoDigest.test.ts` (update mocks to hit FastAPI test app or mock `fetch`).

- [ ] **Step 3:** Commit `feat(reader): ingest via Python API`

---

### Task 13: Reader copy and env docs

**Files:**
- Modify: `reader/src/main.ts` — replace “pnpm ingest” hints with “start Python API” / link to `api/README.md`.
- Modify: `reader/README.md`, `docs/reader.md`

- [ ] **Step 1:** Document `PYTHON_INGEST_URL`, `INGEST_API_KEY` for middleware.

- [ ] **Step 2:** Commit `docs(reader): ingest via backend`

---

## Phase 4 — Remove TS CLI

### Task 14: Delete `cli/` and root CLI scripts

**Files:**
- Delete: `cli/` (entire tree)
- Modify: `package.json` — remove `ingest`, `translate-transcript`, `suggest-milestones`, and any `tsx cli/...` scripts; add `api:dev` / `api:test`
- Modify: `vitest.config.ts` — remove `cli/tests` patterns
- Modify: `tsconfig.json` — remove `cli` includes
- Delete or rewrite: `scripts/verify-*.ts` if they depend on `cli/` (port to Python or remove)

- [ ] **Step 1:** `pnpm test` (reader only) passes; `pytest api` passes.

- [ ] **Step 2:** `pnpm typecheck` passes.

- [ ] **Step 2b:** Remove monorepo root **`config/routing.example.yaml`**, **`config/categories.example.yaml`**, and gitignore rules for **`config/routing.yaml`** / **`config/categories.yaml`** — or add **`config/README.md`** pointing to **`api/config/`** only.

- [ ] **Step 3:** Commit `chore!: remove TypeScript CLI and root ingest config`

---

### Task 15: Top-level docs and agents

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `AGENTS.md`

- [ ] **Step 1:** Single story: run `api` + `reader`; env table; no `pnpm ingest`.

- [ ] **Step 2:** Commit `docs: align with API-only ingest`

---

### Task 16: CI

**Files:**
- Modify: `.github/workflows/*.yml` if present (or add workflow): Python matrix for `api/`, Node for `reader` tests.

- [ ] **Step 1:** CI green.

- [ ] **Step 2:** Commit `ci: pytest api + vitest reader`

---

## Verification checklist (human)

- [ ] Ingest URL from reader UI → new capture under same `VAULT_ROOT` as Obsidian.
- [ ] Re-ingest from capture detail works.
- [ ] No `cli/` in tree; `rg 'cli/src/cli'` returns no product code.
- [ ] Secrets only in `.env` for Python process; browser never sees `OPENAI_API_KEY`.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-04-05-python-backend-no-cli.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks (@superpowers:subagent-driven-development).

2. **Inline execution** — run tasks in this session with checkpoints (@superpowers:executing-plans).

**Which approach do you want?**
