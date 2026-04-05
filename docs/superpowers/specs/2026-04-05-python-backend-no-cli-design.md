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
5. **Routing config at repo / brain root:** Service resolves **`config/routing.yaml`** from the **brain repo root** (`READER_BRAIN_ROOT` / `BRAIN_ROOT`) — URL → adapter mapping stays **operator-owned** beside the repo (committed template: `config/routing.example.yaml`). Optional later: colocate routing under `api/`; not required for v1.
6. **Category taxonomy owned by the backend:** The **allowed category list** (`id` + `label`) is **not** maintained under monorepo root `config/` as the source of truth. The Python service ships a **default taxonomy** inside **`api/`** (bundled YAML). Optional **`CATEGORIES_CONFIG_PATH`** points to an absolute override file on the machine. **`GET …/taxonomy/categories`** returns the same ordered list the ingest LLM uses for validation. The **reader loads the list only via API** (direct fetch + CORS, or **Connect proxy** to Python — preferred for single origin).
7. **Deprecate root category config files:** Stop treating **`config/categories.example.yaml`** / gitignored **`config/categories.yaml`** as the primary workflow; migrate the example content into **`api/`**, update `.gitignore` / docs accordingly.

**Non-goals (v1):**

- Rewriting the reader UI in Python.
- Moving vault to object storage or multi-tenant SaaS (may be future phases).
- **Consolidating every reader `/api/*` route into Python** — list/detail vault reads may stay on Connect middleware; **exception:** **taxonomy/categories** is served from Python (reader proxies or calls it) so the UI and ingest share one source of truth.

---

## 2. Architecture (v1)

```text
┌─────────────────┐     HTTP (ingest + stream)      ┌──────────────────────┐
│  Reader (Vite)  │ ───────────────────────────────►│  Python API service  │
│  + Connect      │                                 │  (FastAPI / …)       │
│  middleware     │◄── same machine, same VAULT ───►│  reads/writes vault  │
└─────────────────┘     (optional: other /api/*)   └──────────────────────┘
```

- **Same machine:** Python service and reader dev server both run locally; both use the **same `VAULT_ROOT`** value pointing at the existing vault directory.
- **Brain repo root:** Python process cwd or explicit env (e.g. `READER_BRAIN_ROOT` / `BRAIN_ROOT`) points at the SecondBrain repo so **`config/routing.yaml`** (and similar operator config) resolves as today for **URL routing**.
- **Categories:** Default taxonomy file lives **inside `api/`** (e.g. `api/config/categories.default.yaml` or packaged under `brain_api/data/`). Optional **`CATEGORIES_CONFIG_PATH`** (absolute path) overrides for a local deployment without forking the repo. Root-level **`config/categories.example.yaml` / `config/categories.yaml`** are **deprecated** for product use once the Python API ships: remove or repoint docs to the `api/` default; stop gitignoring a root `config/categories.yaml` as the primary workflow.
- **TS `cli/`:** Removed from the product; ingest logic **only** in Python (new package directory, e.g. `api/` or `brain_py/` — exact name is an implementation detail).

---

## 3. API contract (indicative)

Exact paths and field names are for implementers to align with OpenAPI; behaviour must match:

| Concern | Requirement |
|--------|-------------|
| **Start ingest** | `POST` JSON body: at least `url`; optional flags equivalent to current CLI options (e.g. re-ingest `capture_dir`) where still needed. |
| **Progress** | **Stream** progress to the client using **SSE** or **chunked NDJSON**, compatible with the reader’s need for **incremental events** (same conceptual schema as today’s `--progress-json` lines: phase, errors, done). |
| **Errors** | Non-stream failures: `4xx`/`5xx` with JSON `{ "message", "code"? }`. Stream terminal event for ingest failure. |
| **Health** | `GET` health route for ops (optional in v1 but recommended). |
| **Category taxonomy** | `GET` JSON: ordered list of `{ id, label }` (same shape as today’s parsed YAML). **Public read** for the reader UI (still protect with same-origin / optional auth if exposed beyond localhost). Ingest uses this list server-side only. |

**Reader integration (v1):** Replace spawn + stderr parsing with **HTTP client + stream reader** to the Python service. **Category picker:** reader calls the Python taxonomy endpoint (directly from browser with CORS, or via **Connect proxy** `GET /api/taxonomy/categories` → forward to Python — preferred so the browser does not need a second origin or extra CORS rules). **Vault listing, file read** may continue on existing middleware until merged later.

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
- **Docs:** Update `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/reader.md`, `reader/README.md` — no CLI-first workflow; document **starting the Python API** + **reader dev**, env vars for vault + brain root, and how ingest is triggered from the UI.
- **Categories:** Move default taxonomy into **`api/`**; remove or slim **`config/categories.example.yaml`** (or replace with a one-line pointer to `api/…`). Adjust **`.gitignore`**: drop dedicated `config/categories.yaml` if no longer used, or keep briefly with a **deprecated** comment in `README` for operators migrating existing files.
- **CI:** Replace TS CLI test jobs with **pytest** (or chosen runner) for Python; keep reader Vitest as needed.

---

## 6. Environment variables

- Reuse existing names where possible: **`VAULT_ROOT`**, **`READER_BRAIN_ROOT`** (or document alias **`BRAIN_ROOT`** = same semantics).
- **`OPENAI_*`**, **`APIFY_TOKEN`**, **`X_BEARER_TOKEN`**, enrich limits, etc. move to **server-side only** — never exposed to the browser.
- New: **`INGEST_API_KEY`** (or similar) for reader → Python auth on mutating routes; **`PYTHON_INGEST_ORIGIN`** or fixed port documented for reader dev proxy if used.
- Optional: **`CATEGORIES_CONFIG_PATH`** — absolute path to a YAML file overriding the bundled default taxonomy (operator / deployment use).

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

---

## 9. Next steps (process)

1. **Human review** of this file (edit in-repo if needed).
2. **`writing-plans`:** Refresh plan tasks for **taxonomy `GET`**, **`api/` default YAML**, reader **proxy** for `/api/taxonomy/categories`, and **root `config/categories*` deprecation** alongside ingest migration.
