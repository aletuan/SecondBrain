## Learned User Preferences

- Prefer stable fetch strategies for URL-backed sources; Apify and X API (per routing) matter for reliability, and captures should retain rich content (full text, images, code blocks) when adapters allow.
- Vietnamese-facing copy and date/time labels should follow Vietnamese conventions; avoid redundant phrasing in time strings (for example drop unnecessary words like "lúc" when the format is already clear).
- Use a fixed set of high-level capture categories with a fallback such as "Khác / Chưa phân loại" when unsure where a capture belongs.
- For post-capture prompts in notes, prefer short multiple-choice or comprehension-style questions over a single open-ended “opening question.”
- When adding missing critical tests, prefer test-driven development.
- For the reader ingest panel, per-stage progress should be visible while the pipeline runs (active/current stage), not only an all-complete state at the end.
- For reader chrome (menus, buttons, placeholders, aria-labels), keep static UI copy in one language consistently; English was preferred where mixed EN/VI had crept in—this is separate from Vietnamese-facing vault or capture body text.

## Learned Workspace Facts

- **Ingest** is implemented in **`api/src/brain_api/`** (Python FastAPI). The **reader** (`reader/`) calls **`PYTHON_INGEST_URL`** for ingest and taxonomy; there is **no TypeScript CLI** in this repo.
- If the reader app's path relative to the Brain repo root changes, revisit default `READER_BRAIN_ROOT` / vault resolution—logic that assumes a fixed parent directory of the reader package can mis-resolve.
- The reader package is not static-only: it includes **Node middleware** under `reader/vault/` that exposes **`/api/*`** in dev and preview builds.
- **Routing / categories:** optional repo-root `config/routing.yaml` and `config/categories.yaml` are useful for **operators** and **`scripts/verify-apify-youtube.ts`**. The Python API defaults to **`api/config/*.default.yaml`** with optional **`ROUTING_CONFIG_PATH`** / **`CATEGORIES_CONFIG_PATH`** (see `brain_api.settings`).
- Ingest-related secrets used by the Python API (for example **`APIFY_TOKEN`**) need a matching field on Pydantic **`Settings`** in `brain_api.settings` so values from project **`.env`** are actually loaded; reading **`os.environ`** alone can miss variables that are only injected via settings.
- **`POST /v1/ingest`** progress is delivered as **NDJSON** lines; the API should **stream** each event as it is produced (rather than running the full pipeline in a thread and only then writing the response) so the reader can update phase highlights in real time. Responses that buffer the whole body also hide intermediate stages in the UI.
- Local **`.superpowers/brainstorm/`** (and similar plugin runtime files such as `.server.log`, `.server.pid`, `.server-stopped`) are workspace noise—do not commit them unless you mean to track them.
