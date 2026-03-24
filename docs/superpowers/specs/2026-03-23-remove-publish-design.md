# Remove `publish` from capture schema — Design Spec

**Date**: 2026-03-23  
**Scope**: Brain CLI (`src/vault/writer`), reader-web (API + UI), tests, docs; optional vault cleanup tooling.

## Context

The vault frontmatter field `publish` was intended for a future “public index” vs private captures. The product direction is now: **all captured content may be published to the web** without per-note gating inside this repo. Keeping `publish` adds noise (Obsidian, API, UI) without enforced behavior.

**User choice:** **Option B** — same as a code-only removal (**Option A**), plus **optional** documentation and/or a script to bulk-remove `publish` from existing vault files so the on-disk schema stays clean.

## Goals

1. **New captures** must not include `publish` in `note.md` or `source.md` frontmatter.
2. **Reader web** must not expose or render `publish` (list API, detail UI, home cards, hints).
3. **Tests** must match the new writer output and fixtures.
4. **Documentation** must describe the vault contract without `publish` as a first-class field.
5. **Optional cleanup:** operators can run a documented, safe script (or follow manual steps) to strip `publish` from existing `Captures/**` markdown files.

## Non-goals

- Enforcing copyright / ToS via this repo (out of scope; handled by external publishing workflow).
- Migrating or editing `Digests/` / `Challenges/` unless those files are found to contain `publish:` in real usage (current CLI digest path does not write `publish`; script scope is **Captures only** unless extended later).
- Stripping `publish` from API `noteFm` / `sourceFm` blobs (optional future tightening); **default:** remove UI and list field only; raw frontmatter in JSON may still contain `publish` on old notes until the user runs cleanup.

## Design — Code changes (same as Option A)

### Vault writer (`src/vault/writer.ts`)

- Remove `publish: false` from `baseFm` and `noteFm` in `writeCapture`.
- `formatFrontmatter` stays unchanged.

### Reader web

- **`reader-web/vault/service.ts`:** Remove `publish` from `CaptureListItem`; stop reading `fm.publish` in `listCaptures`.
- **`reader-web/src/types.ts`:** Remove `publish` from the client `CaptureListItem` type if mirrored there.
- **`reader-web/src/main.ts`:** Remove library column, home card tag, detail pill, and ingest hints that mention `publish`. Adjust table header column count and any `colspan` as needed.

### Tests

- **`tests/vault/writer.test.ts`:** Stop expecting `publish: false` in written markdown.
- **`tests/digest.test.ts`:** Adjust fixtures if they embed capture frontmatter containing `publish` (remove the key if present so tests stay aligned with the new contract).

### Documentation

- **`docs/reader-web.md`:** Remove `publish` from the frontmatter contract and the “public index” paragraph, or replace with a short note that visibility is **not** modeled in the vault and is the responsibility of the public site.
- **Historical plans** under `docs/plans/` may retain old text; optional follow-up to add a one-line “superseded” note — not blocking.

### Mock HTML (`docs/visualizations/`)

- Optional alignment with the live reader; can be a separate chore.

## Design — Option B: optional bulk cleanup

### Purpose

After deployment, existing vaults may still contain lines like `publish: false` or `publish: true` under `---` in `note.md` / `source.md`. The cleanup path **normalizes** those files without requiring Obsidian manual edits at scale.

### Safety requirements

1. **Default dry-run:** First invocation reports how many files would change and sample paths; **no writes** unless an explicit `--apply` (or equivalent) flag is passed.
2. **Scope:** Only files matching `Captures/*/note.md` and `Captures/*/source.md` under `VAULT_ROOT` (or `--vault <path>`). No other paths unless spec is revised.
3. **Edit rule:** Within the first YAML frontmatter block (delimited by leading `---` and the next `---`), remove lines that match `publish:` as a top-level key (boolean only: `true` / `false`), with flexible whitespace. Do not touch body markdown.
4. **Idempotency:** Re-running on a clean vault is a no-op (zero files changed).
5. **Backup:** Document that users should commit or backup the vault before `--apply` (git or copy). The script does not require automatic backups (keeps implementation small).

### Implementation sketch

- **Location:** `scripts/strip-publish-frontmatter.ts` (or similar), run via `pnpm exec tsx scripts/strip-publish-frontmatter.ts`.
- **Package.json:** Optional script alias e.g. `strip-publish` for discoverability.
- **Output:** Human-readable summary: scanned count, modified count, list of relative paths (cap long lists).

### Edge cases

- **No frontmatter:** Skip file.
- **Malformed YAML / multi-line values:** If the simple line-based removal is unsafe for a file, skip and log a warning (or only support lines that match `^\s*publish:\s*(true|false)\s*$` after the opening `---`).
- **Quoted booleans:** Accept `publish: "false"` only if trivial to support; otherwise document “supported forms: `publish: true` / `publish: false`”.

### Documentation for operators

- Short section in **`README.md`** (Environment / ops) or **`docs/reader-web.md`** under vault maintenance: when to run, dry-run vs apply, requirement for `VAULT_ROOT`, example commands.

## Testing (implementation phase)

- Writer test asserts absence of `publish` in new captures.
- Manual or scripted test: create temp vault with a capture containing `publish: false`, dry-run shows 2 files, apply removes lines, second apply changes 0 files.

## Rollout

1. Land code + docs + script together or script immediately after writer change (script remains useful for old vaults).
2. Operators with existing vaults: run dry-run, review, backup, `--apply`.

## Approval

- **Option B** confirmed by stakeholder: code removal (**A**) plus optional bulk strip + operator docs.
