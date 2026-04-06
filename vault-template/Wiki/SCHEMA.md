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

## Post-ingest checklist (agent)

After a new capture is written under `Captures/`:

1. Append an entry to `Wiki/log.md` (see format in that file).
2. Update `Wiki/index.md` if new or renamed important pages.
3. Update **1–3** relevant `Wiki/topics/*` (and `entities/*` if applicable) with a short synthesis bullet and a link to the capture.
4. Stay within a **reasonable file touch budget** (avoid rewriting the whole tree).

## Topic IDs

Initial topic files mirror default Brain categories: `machine-learning`, `data-engineering`, `security`, `management`, `uncategorized`. Override locally if your `categories.yaml` differs.
