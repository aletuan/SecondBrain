# Remove digests and challenges — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove digest and challenge CLI commands, all reader digest/challenge UI and APIs, related tests and styles, and update docs; redirect legacy `#/digests` / `#/digest/…` hashes to `#/captures`.

**Architecture:** Delete `cli/src/digest*`, `cli/src/challenge/fromDigest.ts`, reader digest server helpers and routes, client-only digest rendering (`main.ts`, `digestWikilinks.ts`, CSS). No replacement feature. Vault file deletion stays an operator runbook (Obsidian CLI), not repo code.

**Tech Stack:** TypeScript (ESM), Commander (`cli/src/cli.ts`), Vite reader, Vitest.

**Spec:** [`docs/superpowers/specs/2026-04-04-remove-digests-and-challenges-design.md`](../specs/2026-04-04-remove-digests-and-challenges-design.md)

---

## File map

| Action | Path |
|--------|------|
| Delete | `cli/src/digest.ts`, `cli/src/digest/isoWeek.ts`, `cli/src/challenge/fromDigest.ts` |
| Delete | `cli/tests/digest.test.ts`, `cli/tests/digest/chunk.test.ts`, `cli/tests/digest/isoWeek.test.ts`, `cli/tests/challenge/fromDigest.test.ts` |
| Delete | `reader/vault/runDigestCli.ts`, `reader/src/digestWikilinks.ts`, `reader/tests/digestWikilinks.test.ts` |
| Modify | `package.json`, `cli/src/cli.ts` |
| Modify | `reader/vault/service.ts`, `reader/vault/apiMiddleware.ts`, `reader/vault/brainDotenv.ts` |
| Modify | `reader/src/main.ts`, `reader/src/style.css` |
| Modify | `CLAUDE.md`, `README.md`, `docs/reader.md`, `reader/README.md` |
| Optional doc | GitHub profile repo (`username/username`) — only if the profile README still claims “digests” as a shipped feature |
| Optional asset | `docs/screenshots/reader-digests.png` — delete if present after removing README reference |

---

## Task 1: Root CLI and core removal

**Files:** delete listed `cli/src/digest*` + `cli/tests/digest*` + `cli/tests/challenge/fromDigest.test.ts`; modify `cli/src/cli.ts`, `package.json`

- [ ] **Step 1:** Delete files: `cli/src/digest.ts`, `cli/src/digest/isoWeek.ts`, `cli/src/challenge/fromDigest.ts`, `cli/tests/digest.test.ts`, `cli/tests/digest/chunk.test.ts`, `cli/tests/digest/isoWeek.test.ts`, `cli/tests/challenge/fromDigest.test.ts`. Remove empty `cli/tests/digest/` directory if Vitest/config does not require it.

- [ ] **Step 2:** In `package.json`, remove script entries `"digest"` and `"challenge"`.

- [ ] **Step 3:** In `cli/src/cli.ts`, remove imports from `./challenge/fromDigest.js` and `./digest.js`. Remove `.command('digest')` and `.command('challenge')` blocks entirely. Set root program `.description()` to something accurate, e.g. `Obsidian vault URL ingest CLI` (no “digest”).

- [ ] **Step 4:** Run from repo root:

```bash
pnpm typecheck
pnpm test
```

Expected: PASS (no remaining imports of deleted modules).

- [ ] **Step 5:** Commit

```bash
git add -A
git commit -m "chore: remove digest and challenge CLI commands"
```

---

## Task 2: Reader web — server and deleted helpers

**Files:** delete `reader/vault/runDigestCli.ts`; modify `reader/vault/service.ts`, `reader/vault/apiMiddleware.ts`, `reader/vault/brainDotenv.ts`

- [ ] **Step 1:** Delete `reader/vault/runDigestCli.ts`.

- [ ] **Step 2:** In `reader/vault/service.ts`, remove `listDigests` and `getDigest` exports and implementations (only used by digest API).

- [ ] **Step 3:** In `reader/vault/apiMiddleware.ts`, remove imports of `getDigest`, `listDigests`, and `runDigestCli`. Remove route handlers for:
  - `POST /api/digest`
  - `GET /api/digests`
  - `GET /api/digests/:week` (regex branch)
  - `GET /api/challenges/:week`
  Remove `digestAvailable` from the `GET /api/health` JSON payload construction.

- [ ] **Step 4:** In `reader/vault/brainDotenv.ts`, adjust the file comment so it no longer implies digest children need the same dotenv as digest CLI (accurate one-line comment).

- [ ] **Step 4b:** Confirm no stale imports:

```bash
rg -n "runDigestCli|listDigests|getDigest" reader/
```

Expected: no matches.

- [ ] **Step 5:** From repo root:

```bash
pnpm typecheck
cd reader && pnpm exec tsc --noEmit
```

Expected: no TS errors.

- [ ] **Step 6:** Commit

```bash
git add -A
git commit -m "chore(reader): remove digest and challenge API routes"
```

---

## Task 3: Reader web — client (`main.ts`) and wikilinks helper

**Files:** delete `reader/src/digestWikilinks.ts`, `reader/tests/digestWikilinks.test.ts`; modify `reader/src/main.ts`

- [ ] **Step 1:** Delete `reader/src/digestWikilinks.ts` and `reader/tests/digestWikilinks.test.ts`.

- [ ] **Step 2:** In `reader/src/main.ts`:
  - Remove `import { transformDigestCapturesWikilinks } from './digestWikilinks.js'`.
  - Remove `fetchChallengeMarkdown` and all digest-only render helpers: e.g. `stripDigestBodyLeadingH1`, `slugifyDigestHeading`, `DigestHeadingRenderer`, `DigestProseRenderer`, `markdownToDigestProseHtml`, `renderDigestMetaPanel`, `renderDigestToc`, `sideDigests`, `sideDigestDetail`, `renderDigestsList`, `renderDigestDetail`. (**Challenge UI** lives only inside digest detail — there is no separate `#/challenge` route.)
  - Remove nav UI: drawer and desktop buttons with `data-route="digests"` / label “Digests”.
  - In `bindRail` (and mobile nav equivalents), remove branches that call `setHash('digests')` or listen for `digests` route.
  - Remove `digest` / `digests` cases from `activeRailFromView` (or equivalent) so rail state stays consistent.
  - In ingest / home sidebar HTML, remove blocks that mention `Digests/YYYY-Www`, “Generate digest”, or `pnpm digest` / `pnpm challenge`.
  - Extend **`Health` type**: drop `digestAvailable`.
  - At the **start** of `route()` (or immediately after parsing hash): if `view === 'digests' || view === 'digest'`, call `setHash('captures')` and `return` so the next `hashchange`/`route` renders captures; alternatively use `history.replaceState` + single `route()` — avoid infinite loop.

- [ ] **Step 3:** Remove the entire `if (view === 'digests') { ... }` and `if (view === 'digest' && id) { ... }` blocks from `route()`.

- [ ] **Step 4:** From repo root:

```bash
cd reader && pnpm exec tsc --noEmit
pnpm test
```

Expected: PASS.

- [ ] **Step 5:** Commit

```bash
git add -A
git commit -m "chore(reader): remove digest UI and redirect legacy routes"
```

---

## Task 4: Styles

**Files:** `reader/src/style.css`

- [ ] **Step 1:** Remove CSS variables `--nav-digest-detail` (all theme blocks) if unused after Task 3.

- [ ] **Step 2:** Remove rules whose selectors are digest/challenge-only (e.g. `.digest-*`, `.digest-challenge*`, digest toolbar/timeline/card/run-hint). Update comments that only described digest layout.

- [ ] **Step 3:** Grep to ensure no orphaned references:

```bash
rg -n "digest|nav-digest" reader/src/style.css
```

Expected: no matches (or only unrelated words like “digest” inside unrelated comments — prefer zero false positives; rename comment if needed).

- [ ] **Step 4:** `cd reader && pnpm exec tsc --noEmit`

- [ ] **Step 5:** Commit

```bash
git add reader/src/style.css
git commit -m "chore(reader): drop digest and challenge styles"
```

---

## Task 5: Documentation sweep and final verification

**Files:** `CLAUDE.md`, `README.md`, `docs/reader.md`, `reader/README.md`; optional GitHub profile repo README if it mentions digests

- [ ] **Step 1:** Update `CLAUDE.md`: remove digest/challenge from intro, command list, architecture bullets, `DIGEST_LLM_MAX_CHARS` env row.

- [ ] **Step 2:** Update `README.md`: opening paragraph (no weekly digests); remove digest/challenge command table rows; trim `OPENAI_API_KEY` line if it cites digest overview; remove `DIGEST_LLM_MAX_CHARS` row; remove workflow steps that say `pnpm digest`; remove or replace the “Digests” / `docs/screenshots/reader-digests.png` section (if image file exists, delete it; if missing, still remove the markdown line).

- [ ] **Step 3:** Update `docs/reader.md` and `reader/README.md`: routes without `#/digests` / `#/digest`; API list without digest/challenge endpoints; health without `digestAvailable`; ingest section without digest button prose.

- [ ] **Step 4:** Repo-wide sanity grep (ignore `docs/superpowers/specs/2026-04-04-*` and historical plans if spec says optional):

```bash
rg -i "digests/|challenges/|pnpm digest|pnpm challenge|/api/digest|digestAvailable|DIGEST_LLM" --glob '!docs/superpowers/specs/2026-04-04-*'
```

Fix any stale **user-facing** hits in current docs/README/CLAUDE/reader. Ignore `crypto.createHash(...).digest(` in `cli/src/vault/writer.ts`.

- [ ] **Step 4b:** Broader prose pass (opening blurbs, “weekly digest”, standalone word **Digests**):

```bash
rg -i "\bdigest\b|\bchallenge\b|Digests|Challenges" --glob '*.md' --glob '!docs/superpowers/specs/2026-04-04-*' --glob '!docs/plans/*' --glob '!docs/superpowers/plans/2026-04-04-*'
```

Triage: update **current** product docs (`README.md`, `CLAUDE.md`, `docs/reader.md`, `reader/README.md`, optional profile README on GitHub); skip historical `docs/plans/` unless misleading as current architecture.

- [ ] **Step 5:** Final gates from repo root:

```bash
pnpm typecheck
pnpm test
pnpm reader:build
```

Expected: all succeed.

- [ ] **Step 6:** Commit

```bash
git add -A
git commit -m "docs: remove digest and challenge references"
```

---

## Operator runbook (not a code task)

After merge, the human deletes vault files per spec §4 (Obsidian CLI `delete` with `path=Digests/…` and `Challenges/…`, or filesystem with Obsidian closed). Document is already in the design spec; no new repo file required unless you choose to add a short `docs/vault-cleanup-digests.md` later (YAGNI: skip unless asked).

---

## Done when

- No `digest` / `challenge` commands in `cli/src/cli.ts` or `package.json`.
- No digest/challenge API routes; health has no `digestAvailable`.
- Reader has no Digests nav; `#/digests` and `#/digest/x` land on `#/captures`.
- `pnpm typecheck`, `pnpm test`, `pnpm reader:build` pass.
- Primary docs updated; ripgrep sweep clean for user-facing stale strings.
