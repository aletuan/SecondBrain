# Design: Remove digest and challenge features

**Date:** 2026-04-04  
**Status:** Design approved — implementation plan is the next artifact (`writing-plans` after human review of this file).

**Context:** Remove weekly digest generation (`pnpm digest`), reading challenges (`pnpm challenge`), and all reader-web surfaces that list or render digests/challenges. Vault cleanup for existing `Digests/` and `Challenges/` notes is a **manual** step using the **Obsidian CLI** (vault is gitignored).

---

## 1. Goals

1. **CLI:** Remove `digest` and `challenge` commands and their implementation; remove `pnpm digest` and `pnpm challenge` from root `package.json`.
2. **Reader web:** Remove Digests navigation, routes `#/digests` and `#/digest/:week`, “Generate digest” UI, and challenge rendering; remove related API routes and server helpers.
3. **Documentation:** Update `CLAUDE.md`, `README.md`, `docs/reader-web.md`, `reader-web/README.md`; remove `DIGEST_LLM_MAX_CHARS` from env tables where listed. Do a **repo-wide pass** on user-facing docs (e.g. ripgrep `digest`, `challenge`, `Digests`, `Challenges`, case-insensitive) so opening blurbs, `OPENAI_API_KEY` copy, workflow steps, and screenshot blocks (e.g. reader digests image) are not left stale.
4. **Stale links:** Hash routes `#/digests` and `#/digest/…` should **normalize to `#/captures`** (replace state + render captures) so bookmarks do not call removed APIs.

**Non-goals:** Replacing digest/challenge with another workflow; automating vault deletion from the Brain repo; keeping deprecated CLI stubs.

---

## 2. Repository changes (by area)

### 2.1 Root CLI and core

| Action | Path / note |
|--------|-------------|
| Delete | `cli/src/digest.ts` |
| Delete | `cli/src/digest/isoWeek.ts` |
| Delete | `cli/src/challenge/fromDigest.ts` |
| Delete tests | `cli/tests/digest.test.ts`, `cli/tests/digest/chunk.test.ts`, `cli/tests/digest/isoWeek.test.ts`, `cli/tests/challenge/fromDigest.test.ts` |
| Edit | `cli/src/cli.ts` — remove `digest` and `challenge` command registrations and imports from deleted modules; update the root Commander **`.description()`** (currently mentions digest) to match ingest-only scope |
| Edit | `package.json` — remove `"digest"` and `"challenge"` scripts |

### 2.2 Reader web — server

| Action | Path / note |
|--------|-------------|
| Delete | `reader-web/vault/runDigestCli.ts` |
| Edit | `reader-web/vault/service.ts` — remove `listDigests`, `getDigest` |
| Edit | `reader-web/vault/apiMiddleware.ts` — remove handlers for `POST /api/digest`, `GET /api/digests`, `GET /api/digests/:week`, `GET /api/challenges/:week`; remove imports of digest helpers and `runDigestCli` |
| Edit | `reader-web/vault/brainDotenv.ts` — adjust comment if it only mentions digest alongside ingest (keep accurate) |

### 2.3 Reader web — client

| Action | Path / note |
|--------|-------------|
| Delete | `reader-web/src/digestWikilinks.ts` |
| Delete test | `reader-web/tests/digestWikilinks.test.ts` |
| Edit | `reader-web/src/main.ts` — remove digest/challenge-specific imports, hash branches, `fetchChallengeMarkdown`, `renderDigestsList`, `renderDigestDetail`, digest-only markdown renderers (`DigestHeadingRenderer`, `DigestProseRenderer`, etc.), nav buttons for Digests, ingest sidebar copy referencing `Digests/YYYY-Www`; add early redirect from `digests` / `digest` views to captures |
| Edit | `reader-web/src/style.css` — remove digest/challenge-only rules and `--nav-digest-detail` if nothing else uses it; fix comments referencing digests only |

### 2.4 Health / API contract

- Remove **`digestAvailable`** from `GET /api/health` JSON and from client `Health` type usage in `main.ts`.
- Any code that inferred digest button availability from `digestAvailable ?? ingestAvailable` should disappear with the digest UI.

### 2.5 Documentation

- **`CLAUDE.md`:** Remove digest/challenge from overview, commands, architecture bullets, env table row for `DIGEST_LLM_MAX_CHARS`.
- **`README.md`:** Remove digest/challenge command rows and digest env row.
- **`docs/reader-web.md`:** Remove digest/challenge API and UI sections; adjust ingest/health prose if it references digest.
- **`reader-web/README.md`:** Update route list and API list; remove digest endpoints and `digestAvailable`.

**Historical specs/plans** under `docs/plans/` or older `docs/superpowers/specs/` that mention digest: **no mandatory edit** unless they are actively misleading as current architecture; optional one-line “superseded” only if touched for another reason.

---

## 3. Routing behaviour (staleness)

- **`parseHash()`** may still recognize `digests` / `digest` + id, or **`route()`** may intercept before fetch: if view is `digests` or `digest`, set `location.hash` to `#/captures` (and optionally `history.replaceState` to avoid back-stack noise — implementer’s choice; default: simple `setHash('captures')` or equivalent).
- Ensure **`bindRail` / mobile nav** no longer exposes a Digests target; no dead `data-route="digests"` handlers.

---

## 4. Vault cleanup runbook (Obsidian CLI — operator-run)

The Brain repo **does not** delete vault files. After deploying code removal, clean your vault once per machine:

1. Open **Obsidian** with the vault that Brain uses (`VAULT_ROOT` / reader `READER_BRAIN_ROOT` vault) as the **focused** vault, or pass `vault="Vault Name"` as the first parameter to CLI commands per [Obsidian CLI](https://help.obsidian.md/cli).
2. Run **`obsidian help delete`** (and any `files` / `folder` subcommands your version documents) to confirm exact flags (`path=`, `silent`, trash behaviour).
3. Delete all notes under **`Digests/`** (e.g. per-file `obsidian delete path=Digests/2026-W12.md silent` or documented bulk pattern).
4. Delete **`Challenges/*.md`** files generated by the old `pnpm challenge` flow the same way, so orphan challenges are not left behind.
5. **Filesystem fallback (optional):** With Obsidian closed, remove `Digests/` and `Challenges/` contents under the vault root — respects OS trash only if your tools do; user accepts risk of permanent delete if configured that way.

---

## 5. Verification

- `pnpm typecheck` — root and ensure `reader-web` still builds if part of CI (`pnpm reader:build` from repo root).
- `pnpm test` — all Vitest suites green after deleting tests and updating any shared fixtures.

---

## 6. Risk notes

- **External bookmarks** to `#/digests` → redirected to captures; no digest content shown.
- **Wikilinks** in other notes pointing to `[[Digests/…]]` remain in vault markdown; Obsidian may show broken links until files are deleted or links edited — out of scope for this repo change.

---

## 7. Next step

After the **human** has skimmed this committed spec and confirmed no further edits: invoke **`writing-plans`** to produce `docs/superpowers/plans/2026-04-04-remove-digests-and-challenges.md` (or equivalent dated plan) with ordered implementation tasks.
