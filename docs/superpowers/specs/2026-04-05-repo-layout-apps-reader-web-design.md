# Design: Move reader web under `apps/reader-web` (layout + path resolution)

**Date:** 2026-04-05  
**Status:** Draft for implementation  
**Scope:** Repository layout clarity only — no change to ingest pipeline logic, vault note format, or `src/vault/` writer behaviour beyond what is required for correct default paths.

## 1. Problem

The repository ships **two applications** in one git repo:

| Application | Role | Location today |
|-------------|------|----------------|
| **CLI** | URL → adapters → normalise → `Captures/…` (+ optional LLM) | Root `package.json` + `src/` |
| **Reader web** | Vite UI + Express/Connect API; shells CLI for ingest | `reader-web/` |

Developers confuse **root `src/`** (CLI) with “the whole repo” because the folder name does not say “CLI”, while **`reader-web/`** reads as a peer app without an explicit **apps** grouping.

## 2. Goal

- Make the **two-app** layout obvious: **CLI stays at repo root**; **reader web lives under `apps/reader-web/`**.
- **Preserve behaviour** of ingest, API contracts, and CLI flags — only **paths**, **default resolution**, **scripts**, and **documentation** change.
- **No** pnpm workspace split, **no** new `packages/*` shared library in this change.

## 3. Non-goals

- Refactoring duplicated logic between CLI and reader into a shared package.
- Renaming root `src/` to `cli/src/` (optional future work).
- Editing `src/vault/writer.ts` or other vault internals except unrelated comments (avoid unless necessary).
- Updating historical specs/plans under `docs/superpowers/plans/` and older `docs/superpowers/specs/*` unless a maintainer explicitly wants them refreshed (they reference old paths for archive value).

## 4. Target layout

```text
Brain/                          # CLI package root (unchanged)
  package.json
  src/                          # CLI source (unchanged)
  apps/
    reader-web/                 # moved from ./reader-web
      package.json
      src/
      vault/
      vite.config.ts
      ...
  tests/reader-web/             # stays at repo root; imports updated
  docs/reader-web.md
```

**Package identity:** Keep npm `name` in `apps/reader-web/package.json` as `second-brain-reader` (or current value); only directory path changes.

## 5. Behavioural requirements

### 5.1 `READER_BRAIN_ROOT` (unchanged semantics)

- When set: resolve Brain repo root exactly as today (absolute or relative to `cwd`).
- When unset: resolve to the directory that contains **`src/cli.ts`** by **walking up** from `cwd` until that file exists, or until filesystem root (then fail clearly if used in code paths that require it).

This replaces the current default `path.resolve(cwd, '..')`, which is **wrong** once the reader package is no longer an immediate child of the repo root.

### 5.2 Default vault root (must change with move)

Today, with no `READER_VAULT_ROOT` / `VAULT_ROOT`:

```ts
path.resolve(cwd, '..', 'vault')
```

From `…/reader-web` this is `…/vault` (repo vault). From `…/apps/reader-web` this becomes `…/apps/vault` — **incorrect**.

**Spec:** When env vault vars are unset, default vault root MUST be:

```text
path.join(resolveBrainRepoRoot(cwd), 'vault')
```

So default vault is always **the `vault/` directory next to `src/cli.ts`**, regardless of reader package depth.

### 5.3 `assertIngestEnvironment` / CLI spawn

`reader-web/vault/runIngestCli.ts` (path after move: `apps/reader-web/vault/runIngestCli.ts`) already checks `path.join(brainRoot, 'src', 'cli.ts')`. No semantic change beyond receiving a correct `brainRoot` from updated `resolveBrainRepoRoot`.

## 6. Implementation checklist (files)

### 6.1 Move tree

- `git mv reader-web apps/reader-web` (preserve history).

### 6.2 Root `package.json`

- `reader:dev` / `reader:build` / `reader:preview`: `pnpm -C apps/reader-web …`.

### 6.3 Code — `apps/reader-web/vault/paths.ts`

- Implement **walk-up** discovery for Brain root (marker: `src/cli.ts` exists).
- Implement default vault as `path.join(brainRoot, 'vault')` when env not set.
- Use `node:fs` or `fs/promises` for existence checks; keep ESM and existing export names (`resolveVaultRoot`, `resolveBrainRepoRoot`).
- Add **unit tests** at repo root, e.g. `tests/reader-web/paths.test.ts`, covering:
  - cwd = `apps/reader-web` → brain root = repo root containing this repo’s `src/cli.ts` (use a temp fixture tree or path math from `import.meta.url` / `fileURLToPath` to avoid depending on real vault).
  - cwd = hypothetical shallow layout (if test doubles are used): ensure walk-up stops at correct directory.
  - When `READER_BRAIN_ROOT` / `READER_VAULT_ROOT` set, env wins.

### 6.4 Tests — import paths

Update `../../reader-web/` → `../../apps/reader-web/` in:

- `tests/reader-web/readerApiNoDigest.test.ts`
- `tests/reader-web/hashRoute.test.ts`
- `tests/reader-web/captureFilters.test.ts`
- `tests/reader-web/parseListField.test.ts`
- `tests/reader-web/reactionsMarkdown.test.ts`

### 6.5 Docs (current product surface)

Update paths and “cd” instructions:

- `README.md` — reader location link and prose.
- `CLAUDE.md` — `cd apps/reader-web`, `reader-web/README.md` → `apps/reader-web/README.md`.
- `docs/reader-web.md` — links and default `READER_BRAIN_ROOT` / vault prose.
- `apps/reader-web/README.md` — all `reader-web/` path references, env table (“default parent of reader-web” → “resolved via repo root containing `src/cli.ts`” or equivalent).
- `AGENTS.md` — bullets that say `reader-web/` at repo root → `apps/reader-web/`.

### 6.6 Comments in repo code

- `src/vault/writer.ts` — optional one-line comment if it references `reader-web` path (update to `apps/reader-web` for accuracy).
- `apps/reader-web/vault/parseListField.ts` — comment path to `main.ts`.

### 6.7 User-facing strings

- `apps/reader-web/src/main.ts` — any hint text that says `cd reader-web` should say `cd apps/reader-web` or “from repo root: `pnpm reader:dev`”.

## 7. Verification

From repo root after changes:

```bash
pnpm install
pnpm -C apps/reader-web install   # if not hoisted; follow existing pnpm habits
pnpm typecheck
pnpm -C apps/reader-web typecheck
pnpm test
pnpm reader:build
```

Manual smoke (optional): `pnpm reader:dev`, open app, confirm health/ingest still resolve Brain + vault without setting `READER_BRAIN_ROOT` when run from `apps/reader-web`.

## 8. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Forks/scripts hardcoding `reader-web/` | Document in README changelog-style one-liner; grep in repo is part of implementation. |
| Walk-up picks wrong directory (nested clones) | Marker `src/cli.ts` is the contract; document `READER_BRAIN_ROOT` for exotic layouts. |
| Default vault no longer `../vault` from package dir | Intentional fix; aligns vault with Brain repo root, not reader package parent. |

## 9. Success criteria

- All tests pass; both packages typecheck.
- Running reader dev server from `apps/reader-web` with **no** `READER_BRAIN_ROOT` / vault env finds the same Brain repo and `vault/` as before the move on a standard clone layout.
- Documentation consistently describes **CLI at root `src/`**, **reader at `apps/reader-web/`**.

## 10. Follow-up (out of scope)

- Optional: rename root package or add `docs/architecture.md` diagram.
- Optional: pnpm workspace at repo root for unified `pnpm install`.
- Optional: move CLI under `cli/` for symmetry.
