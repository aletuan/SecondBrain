## Learned User Preferences

- Prefer stable fetch strategies for URL-backed sources; Apify and X API (per routing) matter for reliability, and captures should retain rich content (full text, images, code blocks) when adapters allow.
- Vietnamese-facing copy and date/time labels should follow Vietnamese conventions; avoid redundant phrasing in time strings (for example drop unnecessary words like "lúc" when the format is already clear).
- Use a fixed set of high-level capture categories with a fallback such as "Khác / Chưa phân loại" when unsure where a capture belongs.
- For post-capture prompts in notes, prefer short multiple-choice or comprehension-style questions over a single open-ended “opening question.”
- When adding missing critical tests, prefer test-driven development.

## Learned Workspace Facts

- **Ingest** is implemented in **`api/src/brain_api/`** (Python FastAPI). The **reader** (`reader/`) calls **`PYTHON_INGEST_URL`** for ingest and taxonomy; there is **no TypeScript CLI** in this repo.
- If the reader app's path relative to the Brain repo root changes, revisit default `READER_BRAIN_ROOT` / vault resolution—logic that assumes a fixed parent directory of the reader package can mis-resolve.
- The reader package is not static-only: it includes **Node middleware** under `reader/vault/` that exposes **`/api/*`** in dev and preview builds.
- **Routing / categories:** optional repo-root `config/routing.yaml` and `config/categories.yaml` are useful for **operators** and **`scripts/verify-apify-youtube.ts`**. The Python API defaults to **`api/config/*.default.yaml`** with optional **`ROUTING_CONFIG_PATH`** / **`CATEGORIES_CONFIG_PATH`** (see `brain_api.settings`).
