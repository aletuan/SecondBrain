## Learned User Preferences

- Prefer stable fetch strategies for URL-backed sources; Apify and X API (per routing) matter for reliability, and captures should retain rich content (full text, images, code blocks) when adapters allow.
- Vietnamese-facing copy and date/time labels should follow Vietnamese conventions; avoid redundant phrasing in time strings (for example drop unnecessary words like "lúc" when the format is already clear).
- Use a fixed set of high-level capture categories with a fallback such as "Khác / Chưa phân loại" when unsure where a capture belongs.
- For post-capture prompts in notes, prefer short multiple-choice or comprehension-style questions over a single open-ended “opening question.”
- When restructuring code or expanding tests, treat `cli/src/vault/` as the Obsidian writer boundary—avoid invasive refactors there unless explicitly in scope.
- When adding missing critical tests, prefer test-driven development.
- Open to light layout or documentation changes that make the split obvious: `cli/src/` is the CLI ingest app; `reader/` is the separate reader UI package—without requiring a full monorepo rework.

## Learned Workspace Facts

- The repository is one project with two deliverables: the ingest CLI (root package + `cli/src/`) and the reader web app (`reader/`), which shells the CLI for ingest.
- If the reader app's path relative to the Brain repo root changes, revisit default `READER_BRAIN_ROOT` / vault resolution—logic that assumes a fixed parent directory of the reader package can mis-resolve.
