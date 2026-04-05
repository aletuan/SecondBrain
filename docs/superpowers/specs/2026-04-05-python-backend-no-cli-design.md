# Design: Python ingest backend, API-only (no CLI)

**Date:** 2026-04-05  
**Status:** Design approved — implementation plan: `docs/superpowers/plans/2026-04-05-python-backend-no-cli.md`.

**Context:** Ingest and enrichment today live in the TypeScript `cli/` tree and are invoked locally via Commander (`pnpm ingest`, …) and from the reader by **spawning** `tsx cli/src/cli.ts ingest` with `--progress-json` on stderr. The desired direction is **Python-first**: a **backend HTTP service** callable from the web app, **no local CLI** in this repository. The **Obsidian vault stays on the same machine** with **unchanged absolute/relative path semantics** (`VAULT_ROOT` / `READER_VAULT_ROOT` as today — same files Obsidian sees).

---

## 1. Goals

1. **Single runtime for ingest:** Implement the ingest + enrich pipeline (router, adapters, normaliser, vault writer, LLM steps) as a **Python** service, not as a Node/TS CLI.
2. **API for web app:** Expose **HTTP endpoints** (e.g. FastAPI) so the reader can **ingest via `fetch` + streaming** instead of subprocess + stderr JSON.
3. **Remove CLI from the repo:** **Delete** the TS CLI surface: no `pnpm ingest`, no `cli/src/cli.ts` entry, no Commander commands for Brain ingest. Tests and docs must not assume a CLI.
4. **Vault location unchanged:** Backend reads/writes the **same vault path** as today; no migration of capture folder layout or frontmatter contract unless explicitly scoped later.
5. **All ingest config and analysis logic live under `api/`:** URL **routing** (host/path → adapter), **category taxonomy**, **LLM extract/enrich**, **normalisation**, adapters, and any future **data analysis** steps are implemented and versioned **only** in the Python package. Default YAML (e.g. **`api/config/routing.default.yaml`**, **`api/config/categories.default.yaml`**) ships in-repo; optional env **`ROUTING_CONFIG_PATH`** / **`CATEGORIES_CONFIG_PATH`** (absolute paths) override for operators without forking.
6. **Deprecate monorepo root `config/` for ingest:** Remove or replace **`config/routing.example.yaml`**, **`config/categories.example.yaml`**, and gitignored **`config/routing.yaml`** / **`config/categories.yaml`** as the product workflow — migrate templates into **`api/config/*.default.yaml`** and document “edit `api/` or set `*_CONFIG_PATH`”. Root `config/` may be deleted entirely or hold a short **README** pointing to `api/config/` for discoverability only.
7. **Reader is not a second brain for ingest rules:** The web app does **not** parse routing or taxonomy from disk; it obtains **taxonomy (and any future analysis metadata exposed as API)** from Python. **Vault file listing / reading** may remain on Connect middleware temporarily, but **no** ingest or classification rules live in the reader.

**Non-goals (v1):**

- Rewriting the reader UI in Python.
- Moving vault to object storage or multi-tenant SaaS (may be future phases).
- **Mandatory** migration of **all** reader vault-read routes to Python in the first cut — acceptable to keep list/detail on Node middleware **only** for filesystem I/O, while **every rule and config** for ingest and structured analysis stays in **`api/`**.

---

## 2. Architecture (v1)

```text
  Reader (Vite + Connect proxy)  ──HTTP──►  `api/` FastAPI service
        │                                        │
        │   ingest stream, taxonomy GET,       │  routing + categories YAML
        │   future analysis endpoints          │  adapters, normaliser, vault I/O,
        │                                        │  LLM extract/enrich (all logic)
        └──────────── same VAULT_ROOT ──────────┘
        optional: reader still serves vault file list/read via middleware (no rules)
```

- **Same machine:** Python and reader dev server share the **same `VAULT_ROOT`** (path Obsidian uses).
- **`api/` owns config:** **Routing** and **categories** load from **`api/config/*.default.yaml`** (or package data) with optional **`ROUTING_CONFIG_PATH`** / **`CATEGORIES_CONFIG_PATH`**. No dependency on **`READER_BRAIN_ROOT`** for YAML — that env may remain for **reader-only** path resolution until vault routes move to Python.
- **Single place for ingest intelligence:** All branching (which adapter, how to parse HTML, LLM prompts, category allow-list, milestones, transcript batching, etc.) lives under **`api/src/brain_api/`** (namespaced modules). **Root `config/` is not** the operational source of truth.
- **TS `cli/`:** Removed; ingest **only** in Python.

---

## 3. API contract (indicative)

Exact paths and field names are for implementers to align with OpenAPI; behaviour must match:

| Concern | Requirement |
|--------|-------------|
| **Start ingest** | `POST` JSON body: at least `url`; optional flags equivalent to current CLI options (e.g. re-ingest `capture_dir`) where still needed. |
| **Progress** | **Stream** progress to the client using **SSE** or **chunked NDJSON**, compatible with the reader’s need for **incremental events** (same conceptual schema as today’s `--progress-json` lines: phase, errors, done). |
| **Errors** | Non-stream failures: `4xx`/`5xx` with JSON `{ "message", "code"? }`. Stream terminal event for ingest failure. |
| **Health** | `GET` health route for ops (optional in v1 but recommended). |
| **Category taxonomy** | `GET` JSON: ordered list of `{ id, label }`. Same-origin **proxy** from reader preferred. Ingest validates against the same server-side list. |
| **Routing (operator)** | Not required as a separate HTTP route for v1; **internal** load from `api/config/routing.default.yaml` (+ optional `ROUTING_CONFIG_PATH`). Future: `GET` reload or admin API if needed. |

**Reader integration (v1):** **Proxy** ingest streams and taxonomy to Python. **No** reading `config/*.yaml` from monorepo root for ingest. **Vault listing / file read** may stay on Connect middleware as **dumb I/O** only (no routing/category rules).

---

## 4. Security (even on localhost)

- **Shared secret or API key** header for ingest (and any mutating routes) so accidental exposure of the dev port on LAN does not allow unauthenticated ingest.
- **Category taxonomy `GET`:** Low sensitivity (ids + labels). Prefer **same-origin** via reader **proxy** so the browser never talks to a second port; if the UI calls Python directly, enable **CORS** for the reader origin only.
- **CORS:** Allow only the reader origin (e.g. `http://127.0.0.1:5174`) in development; production origins TBD when deployed.

---

## 5. Repository cleanup (CLI removal)

When implementation lands:

- **Remove** `cli/` (or replace with empty placeholder only if legally required — default: **delete** tree).
- **Root `package.json`:** Remove scripts that invoke `cli/src/cli.ts` (`ingest`, `translate-transcript`, `suggest-milestones`, verify scripts that depend on TS ingest if applicable). Add scripts to **run the Python service** (e.g. `uv run` / `poetry run`) as the primary dev entry for ingest.
- **`vitest.config.ts` / `tsconfig.json`:** Drop `cli/tests` includes; remaining TS tests are **reader-only** unless new shared TS tests are added.
- **Docs:** Update `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/reader.md`, `reader/README.md` — **single story:** run **`api/`** + reader; config lives under **`api/config/`**; env for **`VAULT_ROOT`**, API keys, optional **`ROUTING_CONFIG_PATH`** / **`CATEGORIES_CONFIG_PATH`**.
- **Root `config/`:** Remove ingest templates from root or replace with **`config/README.md`** linking to **`api/config/`**; remove **`.gitignore`** entries for `config/routing.yaml` and `config/categories.yaml` if those paths are gone.
- **CI:** Replace TS CLI test jobs with **pytest** for `api/`; keep reader Vitest as needed.

---

## 6. Environment variables

- **`VAULT_ROOT`** (required for Python ingest): same vault Obsidian uses.
- **`OPENAI_*`**, **`APIFY_TOKEN`**, **`X_BEARER_TOKEN`**, enrich limits, etc. — **server-side only** in the Python process.
- **`INGEST_API_KEY`** + **`PYTHON_INGEST_ORIGIN`** (or port) for reader middleware → Python.
- Optional overrides: **`ROUTING_CONFIG_PATH`**, **`CATEGORIES_CONFIG_PATH`** — absolute paths to YAML **replacing or merging** with `api/config/*.default.yaml` (implementer defines merge vs replace).
- **`READER_BRAIN_ROOT`**: optional for **reader** vault path helpers until all vault I/O moves to Python; **not** used by Python to find routing/taxonomy YAML once consolidation is complete.

---

## 7. Migration / parity

- **Golden tests:** Maintain a small set of **fixture URLs or recorded responses** so Python output matches current vault layout (folder naming, `source.md` / `note.md`, frontmatter).
- **Readability / HTML:** Python stack must approximate **Mozilla Readability + jsdom** behaviour closely enough for acceptable regressions; document known deltas if any.

---

## 8. Risks

| Risk | Mitigation |
|------|------------|
| HTML extraction drift vs TS | Golden captures + manual spot checks on diverse sites |
| Two servers in dev (reader + Python) | Document start order; optional `pnpm` script to run both |
| Secret handling | Keys only in Python process env; reader sends only API key header |
| UI shows categories out of sync with ingest | Single loader module on server; pytest asserts API payload matches ingest allow-list |
| Operators had custom root `config/*.yaml` | Document one-time copy into `api/config/` or set `ROUTING_CONFIG_PATH` / `CATEGORIES_CONFIG_PATH` |

---

## 9. Next steps (process)

1. **Human review** of this file (edit in-repo if needed).
2. **`writing-plans`:** Keep plan aligned: **routing + categories YAML under `api/config/`**, **remove root `config/` ingest files**, settings **without** brain-root YAML resolution for routing.
