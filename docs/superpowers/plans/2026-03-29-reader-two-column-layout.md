# Reader-web two-column layout + client filters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three-column shell (`rail` + `main` + `side`) with **two columns** (`nav` + `main`); move sidebar content into `main`; add **client-side** category + source filters on the Captures list; keep **metric tiles** on full-library data while the **table** shows filtered rows.

**Architecture:** Single `layoutShell()` builds `<nav class="app-nav">` with sections (views, categories, sources) and `<main>`. Remove `#side-inner` / `setSideInner`. Extract pure `filterCaptures(items, state)` (+ tests). Extend `GET /api/captures` payload with `categories: string[]` parsed from note frontmatter so filters work without extra round-trips. Mobile: duplicate nav structure inside existing `nav-drawer` and reuse the same `bindAppNav` handlers. Filter state lives in module scope (optional `sessionStorage` persistence in a follow-up commit).

**Tech Stack:** TypeScript, Vite, existing reader-web API (`reader-web/vault/service.ts`, `apiMiddleware.ts`), Vitest at repo root (`tests/**/*.test.ts`).

**Spec:** [`docs/superpowers/specs/2026-03-29-reader-two-column-layout-design.md`](../specs/2026-03-29-reader-two-column-layout-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `reader-web/vault/service.ts` | Add `categories: string[]` to list items (parse from `fm` via same rules as `parseCategoryList` in main — extract shared parser or duplicate minimal parse in service). |
| `reader-web/src/types.ts` | `CaptureListItem.categories?: string[]` (or required `[]`). |
| `reader-web/src/captureFilters.ts` (new) | Pure `filterCaptures`, `SourceFilter` type, helpers re-export or move `isYoutubeCapture`/`isXCapture`/`isThreadsCapture` from `main.ts` to avoid duplication. |
| `reader-web/src/main.ts` | `layoutShell`, remove `aside.side`; `bindRail` → `bindAppNav`; remove `setSideInner` + inline side HTML into `renderHome` / `renderCapturesTable` / `renderCaptureDetail` / digest renders; wire filter UI + re-render table; `route()` updates. |
| `reader-web/src/style.css` | `.app` 2-col grid; `.app-nav` sections; remove/adjust `.side`, `.rail` → nav styles; drawer nav mirror; responsive breakpoints. |
| `tests/reader-web/captureFilters.test.ts` (new) | Unit tests for `filterCaptures` AND/OR source classification helpers. |

---

### Task 1: List API + types — `categories` on each capture row

**Files:**
- Modify: `reader-web/vault/service.ts` — `CaptureListItem` type + `listCaptures()` push `categories`
- Modify: `reader-web/src/types.ts` — mirror field for client
- Reference: `reader-web/src/main.ts` `parseCategoryList` — **either** import a tiny shared util into vault (**avoid** importing `main` from service) **or** copy the 10-line parse logic into `service.ts` / `reader-web/vault/noteFm.ts` (new) used by both

- [ ] **Step 1:** Add `categories: string[]` to vault `CaptureListItem` in `service.ts`, populated from `fm.categories` using YAML-safe parsing consistent with `parseCategoryList` behavior (empty → `[]`).
- [ ] **Step 2:** Update `reader-web/src/types.ts` to include `categories?: string[]` (or `categories: string[]` default `[]`).
- [ ] **Step 3:** Run `pnpm -C reader-web typecheck` from repo root — expect PASS.
- [ ] **Step 4:** Manual smoke: `GET /api/captures` JSON includes `categories` arrays — **or** add a tiny vitest that imports service (if test harness exists); if not, skip automated API test and verify manually.
- [ ] **Step 5:** Commit — `feat(reader-web): include categories in capture list payload`

---

### Task 2: Pure filter module + Vitest (TDD)

**Files:**
- Create: `reader-web/src/captureFilters.ts`
- Create: `tests/reader-web/captureFilters.test.ts`
- Modify: `reader-web/src/main.ts` — remove duplicate helpers once moved (in Task 2 or 3)

- [ ] **Step 1: Write failing tests** — cases: no filter returns all; category id filters multi-label; `null`/all category clears; source youtube only; `other` excludes yt/x/threads; AND of category + source.
- [ ] **Step 2:** Run `pnpm vitest run tests/reader-web/captureFilters.test.ts` — FAIL (module empty).
- [ ] **Step 3:** Implement `filterCaptures(rows, { categoryId: string | null, source: 'all' | 'youtube' | 'x' | 'threads' | 'other' })` and move `isYoutubeCapture` / `isXCapture` / `isThreadsCapture` here (accept `CaptureListItem`-shaped object).
- [ ] **Step 4:** Run `pnpm vitest run tests/reader-web/captureFilters.test.ts` — PASS.
- [ ] **Step 5:** Commit — `feat(reader-web): add captureFilters for client-side list filtering`

---

### Task 3: Shell HTML + CSS — two columns, remove `aside.side`

**Files:**
- Modify: `reader-web/src/main.ts` — `layoutShell()`
- Modify: `reader-web/src/style.css` — `.app`, new `.app-nav`, remove `.side` column rules; adjust `#side-inner` usages (delete)

- [ ] **Step 1:** Replace `aside.rail` + `aside.side` with `nav.app-nav` placeholder structure: sections **Views** (Ingest, Captures, Digests), **Categories** (empty `ul` or “Đang tải…”), **Nguồn** (buttons). Keep `aria-label` / headings (`h2.visually-hidden` or `.app-nav__section-title`).
- [ ] **Step 2:** Set `.app { grid-template-columns: minmax(220px, 280px) minmax(0, 1fr); }` (tune tokens); remove rules that assume 3 columns.
- [ ] **Step 3:** Delete or repurpose `.side`, `#side-inner`, `.rail` → `.app-nav` styles (spacing, borders). Preserve theme transitions on `html[data-theme]` for new selectors.
- [ ] **Step 4:** `pnpm -C reader-web build` — PASS.
- [ ] **Step 5:** Commit — `feat(reader-web): two-column shell with app-nav placeholder`

---

### Task 4: Populate nav + `bindAppNav` + mobile drawer

**Files:**
- Modify: `reader-web/src/main.ts`
- Modify: `reader-web/src/style.css` — drawer content
- Modify: `layoutShell` / `nav-drawer` inner HTML if needed

- [ ] **Step 1:** On `initApp` / after route, `fetch('/api/taxonomy/categories')` and fill Category `ul` (id + label); on failure show muted error + only “Tất cả”.
- [ ] **Step 2:** Implement `bindAppNav()`: (a) view buttons → `setHash` + `closeMobileNav`; (b) category clicks set `selectedCategoryId` and if `view===captures` re-call table render; (c) source buttons set `selectedSource` similarly; update `aria-current` / `aria-pressed`.
- [ ] **Step 3:** **Duplicate** the same nav markup (or clone via JS) inside `nav-drawer` **or** use one hidden template — goal: mobile drawer lists same controls. Reuse one `bindAppNav` by `querySelectorAll('[data-nav-route]')` with delegation on `document` or bind both containers.
- [ ] **Step 4:** Manual: desktop + narrow viewport — drawer opens, filters work.
- [ ] **Step 5:** Commit — `feat(reader-web): app nav sections and bindAppNav`

---

### Task 5: Captures view — metrics in `main`, filtered table, empty state

**Files:**
- Modify: `reader-web/src/main.ts` — `renderCapturesTable`, `route()` captures branch

- [ ] **Step 1:** Inline HTML from `sideCaptures` **above** the table inside `renderCapturesTable` output (or split `capturesMetricsRowHtml(rows)` + `capturesHintsHtml()`). Tiles computed from **full** `rows` argument (always pass unfiltered `capturesAll` for metrics; pass filtered for table only).
- [ ] **Step 2:** After fetch in `route`, store `capturesAll` in module-level `let`; compute `filtered = filterCaptures(capturesAll, state)`; render table body from `filtered`.
- [ ] **Step 3:** If `filtered.length === 0` and `capturesAll.length > 0`, show empty state row + “Xóa bộ lọc” button that resets `selectedCategoryId`/`selectedSource` and re-renders.
- [ ] **Step 4:** Remove `setSideInner(sideCaptures(...))` call.
- [ ] **Step 5:** Commit — `feat(reader-web): captures metrics in main and client filters`

---

### Task 6: Migrate remaining `side*` content into `main`

**Files:**
- Modify: `reader-web/src/main.ts` — remove `sideHome`, `sideCapture`, `sideDigests`, `sideDigestDetail` (or keep as string helpers renamed to `mainHomeAsideHtml` etc.)

- [ ] **Step 1:** `sideHome` → append blocks below ingest/cards in `renderHome` output.
- [ ] **Step 2:** `sideCapture` → callout under `detail-toolbar` in `renderCaptureDetail`.
- [ ] **Step 3:** `sideDigests` / `sideDigestDetail` → blocks in `renderDigestsList` / `renderDigestDetail` templates.
- [ ] **Step 4:** Remove `setSideInner` function and all calls; delete dead `side*` functions.
- [ ] **Step 5:** Grep `side-inner` / `setSideInner` — zero results.
- [ ] **Step 6:** Commit — `refactor(reader-web): move former sidebar panels into main`

---

### Task 7: Cleanup + docs + final verify

**Files:**
- Modify: `docs/reader-web.md` if it documents 3-column layout
- Run: `pnpm typecheck`, `pnpm -C reader-web typecheck`, `pnpm vitest run`, `pnpm -C reader-web build`

- [ ] **Step 1:** Update `docs/reader-web.md` (short paragraph: 2-col + filters).
- [ ] **Step 2:** Run full verify commands; fix regressions (masthead, theme switcher, capture detail).
- [ ] **Step 3:** Commit — `docs: reader-web two-column layout note`

---

## Plan review checklist (self)

- [ ] Each task leaves repo buildable.
- [ ] Category filter depends on Task 1 — order respected.
- [ ] No bookmark URL in v1 (per spec).

---

## Execution handoff

**Plan complete and saved to** `docs/superpowers/plans/2026-03-29-reader-two-column-layout.md`.

**Two execution options:**

1. **Subagent-driven (recommended)** — dispatch a fresh subagent per task; review between tasks (@superpowers:subagent-driven-development).
2. **Inline execution** — run tasks in one session with checkpoints (@superpowers:executing-plans).

**Which approach do you want?** (Reply `1` or `2`, or start implementation in Agent mode with “execute plan”.)
