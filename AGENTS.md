## Learned User Preferences

- Prefer stable fetch strategies for URL-backed sources; Apify and X API (per routing) matter for reliability, and captures should retain rich content (full text, images, code blocks) when adapters allow.
- Vietnamese-facing copy and date/time labels should follow Vietnamese conventions; avoid redundant phrasing in time strings (for example drop unnecessary words like "lúc" when the format is already clear).
- Use a fixed set of high-level capture categories with a fallback such as "Khác / Chưa phân loại" when unsure where a capture belongs.
- For post-capture prompts in notes, prefer short multiple-choice or comprehension-style questions over a single open-ended “opening question.”
- When restructuring code or expanding tests, treat `cli/src/vault/` as the Obsidian writer boundary—avoid invasive refactors there unless explicitly in scope.
- When adding missing critical tests, prefer test-driven development.
- Open to light layout or documentation changes that make the split obvious: `cli/src/` is the CLI ingest app; `reader/` is the separate reader UI package—without requiring a full monorepo rework.
- Ingest can run in **two ways**: the TypeScript CLI (`cli/src/`) or the **Python FastAPI app** under `api/` (same routing strategies: `http_readability`, `apify`, `youtube` via Apify, `x_api`). When the reader sets **`PYTHON_INGEST_URL`**, it proxies ingest and taxonomy to the Python service instead of spawning the CLI.

## Learned Workspace Facts

- The repository is one project with **three main surfaces**: the ingest CLI (`cli/src/`), the **Python ingest API** (`api/src/brain_api/`), and the reader web app (`reader/`). Without `PYTHON_INGEST_URL`, the reader shells the CLI for ingest; with it, the reader calls `POST /v1/ingest` and `GET /v1/taxonomy/categories` on that base URL.
- If the reader app's path relative to the Brain repo root changes, revisit default `READER_BRAIN_ROOT` / vault resolution—logic that assumes a fixed parent directory of the reader package can mis-resolve.
- The reader package is not static-only: it includes **Node middleware** under `reader/vault/` that exposes **`/api/*`** in dev and preview builds.
- The `config/` directory holds committed **`*.example.yaml`** defaults for routing and categories; optional local `config/routing.yaml` and `config/categories.yaml` override when present for the **CLI**. The Python API loads **`api/config/routing.default.yaml`** and **`api/config/categories.default.yaml`** by default, with optional overrides via **`ROUTING_CONFIG_PATH`** / **`CATEGORIES_CONFIG_PATH`** (see `brain_api.settings`).
