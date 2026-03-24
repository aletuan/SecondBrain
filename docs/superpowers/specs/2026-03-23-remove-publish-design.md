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

### API contract note (stale keys)

- **`CaptureListItem` and reader UI** will not include `publish` after implementation.
- **`noteFm` / `sourceFm` in capture detail** remain **opaque frontmatter maps** parsed from disk. They **may still contain `publish: true|false`** until the operator runs the optional cleanup script. API clients **must not** depend on `publish` for behavior; treat it as deprecated junk if present.

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
2. **Scope:** Only files matching `Captures/*/note.md` and `Captures/*/source.md` under `VAULT_ROOT` (or `--vault <path>`). Resolve paths under the vault root only; **do not follow symlinks** out of the vault (or resolve `realpath` and ensure it stays under `VAULT_ROOT`).
3. **Encoding:** **UTF-8** input/output. If a BOM or non–UTF-8 is detected, **skip** the file and log a warning (avoid corrupting notes).
4. **Atomic writes:** On `--apply`, write to a temp file in the same directory then **rename** into place, so a crash mid-write does not truncate the original.
5. **Exit codes:** `0` when every scanned file was either unchanged, successfully updated, or cleanly skipped (e.g. no frontmatter). Use a **non-zero** exit (e.g. `2`) if any file was **skipped as unsafe** (ambiguous frontmatter, encoding), so operators and CI can detect partial failure.
6. **Concurrency:** Document that operators should close Obsidian or avoid editing the same files during `--apply` (no file locking in v1).
7. **Idempotency:** Re-running on a clean vault is a no-op (zero files changed).
8. **Backup:** Document that users should commit or backup the vault before `--apply` (git or copy). The script does not create automatic backups.

### Edit rule (precise)

- Only the **first** frontmatter block (`---` … `---`).
- Remove **top-level** lines where the key is **exactly** `publish` (ASCII, case-sensitive: `publish`, not `Publish` or `foo_publish`).
- **Supported values to strip:** `true` and `false` only (after optional whitespace). **Out of scope for v1:** YAML 1.1 aliases (`yes`/`no`/`on`/`off`), `null`, or quoted variants — skip the **whole file** if any line inside the frontmatter block looks like `publish:` but does not match `^publish:\s*(true|false)\s*$`.
- **Duplicate `publish` lines:** remove **every** line that matches the pattern (all occurrences).
- Do not touch body markdown below the closing `---`.

### Implementation sketch

- **Location:** `scripts/strip-publish-frontmatter.ts` (or similar), run via `pnpm exec tsx scripts/strip-publish-frontmatter.ts`.
- **Package.json:** Optional script alias e.g. `strip-publish` for discoverability.
- **Output:** Human-readable summary: scanned count, modified count, list of relative paths (cap long lists).

### Edge cases

- **No frontmatter:** Skip file.
- **Unsafe frontmatter:** If the frontmatter region contains block scalars (`|` / `>`) or line continuations that make line-based editing risky, **skip the entire file** and warn (conservative default).
- **Nested `publish:`** (indented under a mapping): do **not** remove — only column-0 `publish:` lines (top-level keys as written by this CLI). If the script uses “no leading whitespace before `publish:`”, nested keys are naturally ignored.
- **Quoted booleans:** **Out of scope** for v1 unless trivial; `publish: "false"` → skip file or leave unchanged per implementation choice; document clearly.

### Documentation for operators

- Short section in **`README.md`** (Environment / ops) or **`docs/reader-web.md`** under vault maintenance: when to run, dry-run vs apply, requirement for `VAULT_ROOT`, example commands.

## Testing (implementation phase)

- Writer test asserts absence of `publish` in new captures.
- Manual or scripted test: create temp vault with a capture containing `publish: false`, dry-run shows 2 files, apply removes lines, second apply changes 0 files.

## Rollout

1. Land code + docs + script together or script immediately after writer change (script remains useful for old vaults).
2. Operators with existing vaults: run dry-run, review, backup, `--apply`.
3. **Optional discovery:** Before closing scope on non-Captures paths, operators may run e.g. `rg 'publish:' Digests Challenges` (or search the whole vault) to see if `publish:` appears outside `Captures/` and clean manually if needed.

## Approval

- **Option B** confirmed by stakeholder: code removal (**A**) plus optional bulk strip + operator docs.
