# Wiki layer — structure and rules

This file is the **source of truth** for how the `Wiki/` tree is organized and who may edit what. It supports the “compounding wiki” pattern ([Karpathy — LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)) alongside Brain’s per-URL **`Captures/`** folders.

## Directory layout (fixed)

| Path | Role |
|------|------|
| `Wiki/index.md` | Content catalog: links + one-line summaries by area. |
| `Wiki/log.md` | Append-only timeline (ingests, wiki maintenance, major queries). |
| `Wiki/topics/` | Topic pages aligned with capture **taxonomy** (see repo `api/config/categories.default.yaml`). |
| `Wiki/entities/` | People, products, repos, named concepts (add pages as needed). |
| `Wiki/synthesis/` | Multi-source write-ups; each should cite capture paths or URLs. |

## Editing authority

- **`Captures/**`**: Pipeline-owned **raw** side — do **not** mass-edit `*.source.md`. Treat it as immutable source material. Light edits to `*.note.md` are OK (takeaways, links to `Wiki/`).
- **`Wiki/**`**: Maintainer-owned (LLM + you). Update on ingest, after deep Q&A, or during lint passes.

## Linking captures

From a wiki page, link to a capture folder or note using Obsidian wikilinks or relative paths, e.g. `[[../Captures/YYYY-MM-DD--slug--id/note]]` (adjust to your note filename).

From a capture `.note.md`, optional backlink: `[[../../Wiki/topics/machine-learning]]` (adjust path).

**Concrete paths (this vault):** vault root = folder that contains both `Captures/` and `Wiki/`. A capture folder looks like `Captures/YYYY-MM-DD--slug--shortid/` with `*.note.md` and `*.source.md` inside.

## Taxonomy → topic page (Brain defaults)

When the capture category/taxonomy is known, prefer updating this topic file first:

| Category id (Brain default) | Wiki file |
|-------------------------------|-----------|
| `machine-learning` | `Wiki/topics/machine-learning.md` |
| `data-engineering` | `Wiki/topics/data-engineering.md` |
| `security` | `Wiki/topics/security.md` |
| `management` | `Wiki/topics/management.md` |
| `uncategorized` (or unknown) | `Wiki/topics/uncategorized.md` |

If your operator uses a custom `categories.yaml`, follow those labels but keep the same *shape*: one primary topic page per high-level category.

## Phase 1 — Post-ingest checklist (agent-driven)

**Trigger:** Human finished a successful ingest; a new folder exists under `Captures/…`.

**Hard rules**

- Do **not** edit `*.source.md` except fixing obvious broken links you introduced elsewhere (rare).
- You **may** edit `*.note.md` to add 1–3 takeaway bullets and/or a wikilink to the primary topic page.
- Touch **at most 6 Markdown files** under `Wiki/` in one pass (including `log.md` and `index.md`). Prefer 3–5.

**Steps (do in order)**

1. **Read** the new capture: open `*.note.md` (title, tags) and skim the start of `*.source.md` or excerpt only — do not paste the full source into wiki pages.
2. **`Wiki/log.md`** — Append one new `## [YYYY-MM-DD] ingest | <short title>` block. Include:
   - capture folder path (relative to vault root),
   - canonical URL from frontmatter if present,
   - which `Wiki/topics/*` files you will touch (preview list).
3. **`Wiki/topics/<primary>.md`** — Add under **Highlights** one bullet: the main claim or takeaway in your own words (one sentence). Under **Sources in vault**, add a wikilink line to the capture note or folder.
4. **Optional second topic** — If the content clearly spans another category, add one bullet + link there too (still within file budget).
5. **`Wiki/entities/*`** — Only if a **named** person/product/repo is central; create or update **one** entity note. Otherwise skip.
6. **`Wiki/index.md`** — Update only if you added a **new** wiki page (e.g. new entity) or a section needs a new row in the table. Skip if only existing topic pages changed.
7. **Summarize** for the human: list files changed and one-sentence “what moved in the wiki”.

## After a query (optional, same phase)

When the human asks a substantive question and you produce an answer: either update an existing `Wiki/topics/*` / `Wiki/synthesis/*` page with the conclusion **or** add a synthesis file, then append a `## [date] query | …` entry to `log.md`. Do not leave the insight only in chat.

## Lint (later)

Periodic pass: orphans, stale claims vs newer captures, broken wikilinks — see `PLAN.md` in the Brain repo. Not required on every ingest.

## Topic IDs

Initial topic files mirror default Brain categories: `machine-learning`, `data-engineering`, `security`, `management`, `uncategorized`. Override locally if your `categories.yaml` differs.

## Copy-paste prompt

For a ready-made user message to the coding agent after ingest, see **`WIKI_POST_INGEST_PROMPT.md`** next to this file (same `Wiki/` folder in template; copy into vault if missing).
