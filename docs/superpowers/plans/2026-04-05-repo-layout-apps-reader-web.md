# Repo layout: `apps/reader-web` — Implementation plan

> **For agentic workers:** Use superpowers **subagent-driven-development** or **executing-plans** to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the reader web package from `reader-web/` to `apps/reader-web/`, update root `pnpm reader:*` scripts, fix default Brain repo and vault resolution so ingest and the UI behave like today on a standard clone, and refresh current product docs. **No** CLI ingest logic changes, **no** `src/vault/` writer refactors, **no** pnpm workspace.

**Architecture:** Single repo, two apps — **CLI** remains root `package.json` + `src/`; **reader** lives under `apps/reader-web/`. `resolveBrainRepoRoot` walks up from `cwd` until `src/cli.ts` exists; default vault is `path.join(brainRoot, 'vault')` when env vars are unset.

**Tech stack:** TypeScript (ESM), Vite, Vitest at repo root, Node 20+.

**Spec:** [`docs/superpowers/specs/2026-04-05-repo-layout-apps-reader-web-design.md`](../specs/2026-04-05-repo-layout-apps-reader-web-design.md)

---

## File map (after move)

| Action | Path |
|--------|------|
| Move | `reader-web/` → `apps/reader-web/` (`git mv`) |
| Modify | `package.json` — `reader:dev`, `reader:build`, `reader:preview` → `pnpm -C apps/reader-web …` |
| Modify | `apps/reader-web/vault/paths.ts` — walk-up brain root; vault default via `brainRoot` |
| Modify | `apps/reader-web/serve.ts` — preview log line: stop implying `../vault` only; align with env / brain-root vault |
| Modify | `apps/reader-web/src/main.ts` — any user-facing `cd reader-web` copy |
| Modify | `apps/reader-web/vault/parseListField.ts` — comment path to `main.ts` |
| Optional | `src/vault/writer.ts` — comment if it mentions `reader-web` path |
| Create | `tests/reader-web/paths.test.ts` — brain + vault resolution (env overrides + fixture or real repo paths) |
| Modify | `tests/reader-web/*.test.ts` — imports `../../reader-web/` → `../../apps/reader-web/` |
| Modify | `README.md`, `CLAUDE.md`, `docs/reader-web.md`, `apps/reader-web/README.md`, `AGENTS.md` |

**Out of scope for this plan:** Historical paths inside `docs/superpowers/plans/*` and older `docs/superpowers/specs/*` (archive); optional follow-up to grep-replace those for consistency.

---

## Task 1: Move tree and root scripts

**Files:** `reader-web/` → `apps/reader-web/`; `package.json`

- [ ] **Step 1:** Ensure `apps/` exists, then move preserving history:

```bash
mkdir -p apps
git mv reader-web apps/reader-web
```

- [ ] **Step 2:** In root `package.json`, set:

  - `"reader:dev": "pnpm -C apps/reader-web dev"`
  - `"reader:build": "pnpm -C apps/reader-web build"`
  - `"reader:preview": "pnpm -C apps/reader-web preview"`

- [ ] **Step 3:** From repo root, install reader deps if your workflow requires it:

```bash
pnpm -C apps/reader-web install
```

- [ ] **Step 4:** Commit (or continue into Task 2 in the same commit if you prefer one atomic change):

```bash
git add -A
git commit -m "chore: move reader-web to apps/reader-web"
```

---

## Task 2: Path resolution (`paths.ts`) and preview log

**Files:** `apps/reader-web/vault/paths.ts`, `apps/reader-web/serve.ts`

- [ ] **Step 1:** Implement `resolveBrainRepoRoot(cwd)` when `READER_BRAIN_ROOT` is unset:

  - Walk from `path.resolve(cwd)` upward (via `path.dirname`) until `path.join(dir, 'src', 'cli.ts')` exists, or stop at filesystem root.
  - If no marker found, pick a behaviour consistent with call sites: either return the last tried parent (avoid breaking unrelated imports) or document that callers must set `READER_BRAIN_ROOT` — **prefer** returning the directory where `src/cli.ts` was found only when found; if not found, `runIngestCli` / `assertIngestEnvironment` should still fail in a clear way (match existing error patterns).

- [ ] **Step 2:** Implement `resolveVaultRoot(cwd)` when `READER_VAULT_ROOT` and `VAULT_ROOT` are unset:

  - `return path.join(resolveBrainRepoRoot(cwd), 'vault')` (after env branch), **not** `path.resolve(cwd, '..', 'vault')`.

- [ ] **Step 3:** Keep `READER_BRAIN_ROOT` / `READER_VAULT_ROOT` / `VAULT_ROOT` semantics identical to today when set (absolute vs relative to `cwd`).

- [ ] **Step 4:** Update `apps/reader-web/serve.ts` console message so it does not claim only `../vault` (e.g. mention `READER_VAULT_ROOT` / `VAULT_ROOT` or “default vault next to Brain CLI”).

- [ ] **Step 5:** `pnpm -C apps/reader-web typecheck` — expect PASS.

---

## Task 3: Unit tests for paths + fix reader test imports

**Files:** `tests/reader-web/paths.test.ts` (new); `tests/reader-web/readerApiNoDigest.test.ts`, `hashRoute.test.ts`, `captureFilters.test.ts`, `parseListField.test.ts`, `reactionsMarkdown.test.ts`

- [ ] **Step 1:** Add `tests/reader-web/paths.test.ts`:

  - With **env cleared** for these vars (save/restore in test), from a `cwd` of `apps/reader-web` in this repo, assert `resolveBrainRepoRoot` equals repo root (directory containing `src/cli.ts`).
  - Assert default `resolveVaultRoot` equals `path.join(repoRoot, 'vault')`.
  - Assert `READER_BRAIN_ROOT` / `READER_VAULT_ROOT` override paths when set (use temp dirs if needed).

- [ ] **Step 2:** Replace `../../reader-web/` with `../../apps/reader-web/` in all five existing reader test files’ imports.

- [ ] **Step 3:** From repo root:

```bash
pnpm vitest run tests/reader-web/
pnpm typecheck
```

Expected: PASS.

---

## Task 4: Documentation and in-repo strings

**Files:** `README.md`, `CLAUDE.md`, `docs/reader-web.md`, `apps/reader-web/README.md`, `AGENTS.md`, `apps/reader-web/src/main.ts`, `apps/reader-web/vault/parseListField.ts`, optionally `src/vault/writer.ts`

- [ ] **Step 1:** `README.md` — reader location: `apps/reader-web/`; link and install/dev instructions (`pnpm reader:dev` unchanged at root).

- [ ] **Step 2:** `CLAUDE.md` — `cd apps/reader-web && pnpm install && pnpm dev`; pointer to `apps/reader-web/README.md`.

- [ ] **Step 3:** `docs/reader-web.md` — link `../apps/reader-web/`; prose: default Brain root is discovered via `src/cli.ts` walk-up; vault default is `{brainRoot}/vault` when env unset.

- [ ] **Step 4:** `apps/reader-web/README.md` — replace `reader-web/` path references; env table: `READER_BRAIN_ROOT` optional, default = ancestor with `src/cli.ts`; vault default = `{that root}/vault`.

- [ ] **Step 5:** `AGENTS.md` — workspace facts: reader lives at `apps/reader-web/`; remove stale “move under apps/” future tense if the move is done.

- [ ] **Step 6:** `apps/reader-web/src/main.ts` — ingest hint strings: `cd apps/reader-web` or “from repo root: `pnpm reader:dev`”.

- [ ] **Step 7:** `apps/reader-web/vault/parseListField.ts` — comment: `apps/reader-web/src/main.ts`.

- [ ] **Step 8 (optional):** `src/vault/writer.ts` — if comment references `reader-web`, update to `apps/reader-web`.

---

## Task 5: Sweep and final verification

- [ ] **Step 1:** From repo root, find **current** code and docs hits (exclude archive if desired):

```bash
rg -n "reader-web" --glob '!docs/superpowers/plans/**' --glob '!docs/superpowers/specs/2026-0[1-4]*'
```

Triage: every hit should be intentional (historical spec, or updated path, or the string “reader-web” in package name / prose).

- [ ] **Step 2:** Full verification:

```bash
pnpm typecheck
pnpm -C apps/reader-web typecheck
pnpm test
pnpm reader:build
```

- [ ] **Step 3 (optional manual):** `pnpm reader:dev`, load health + ingest-capable UI without setting `READER_BRAIN_ROOT` on a normal clone.

- [ ] **Step 4:** Commit:

```bash
git add -A
git commit -m "docs: align reader paths and path resolution with apps/reader-web"
```

(Adjust message if split across commits: e.g. separate `test:` / `fix(reader):` commits.)

---

## Success criteria

- `pnpm test`, `pnpm typecheck`, `pnpm -C apps/reader-web typecheck`, `pnpm reader:build` all pass.
- No remaining stale `../../reader-web/` imports in `tests/`.
- Default Brain + vault resolution matches spec §5 for cwd under `apps/reader-web`.
