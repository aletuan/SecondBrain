# Theme Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3-theme switcher (Dark / Light-Parchment / Solarized) to reader with CSS variable swapping, localStorage persistence, and no flash on reload.

**Architecture:** `data-theme` attribute on `<html>` drives CSS variable overrides. A flash-prevention inline script in `<head>` applies the saved theme before CSS loads. Switcher UI (3 SVG icon buttons in a pill) renders in the masthead (desktop) and mobile-topbar (mobile). All theme colors live in CSS variables; hardcoded rgba accent/signal values get new variables.

**Tech Stack:** Vanilla CSS variables, vanilla JS/TS, inline SVG icons, localStorage

**Spec:** `docs/superpowers/specs/2026-03-22-theme-switcher-design.md`

---

### Task 1: Flash-prevention script in index.html

**Files:**
- Modify: `reader/index.html:2,15-16`

- [ ] **Step 1: Add data-theme attribute and inline script**

In `reader/index.html`, add `data-theme="dark"` to the `<html>` tag and insert a flash-prevention script before the font `<link>`:

```html
<html lang="vi" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <title>Second brain · Reader</title>
    <script>
      (function(){var t=localStorage.getItem('theme');if(t&&t!=='dark')document.documentElement.setAttribute('data-theme',t)})();
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
```

The script runs synchronously before CSS loads, preventing a flash of wrong theme. Default is `dark` (already set on `<html>`), so the script only acts when the user previously selected a different theme.

- [ ] **Step 2: Verify no flash**

Open the app in browser, set theme to `light` via console (`localStorage.setItem('theme','light'); location.reload()`), confirm no dark flash before light theme appears.

- [ ] **Step 3: Commit**

```bash
git add reader/index.html
git commit -m "feat(reader): add theme flash-prevention script in head"
```

---

### Task 2: CSS theme variable blocks + new utility variables

**Files:**
- Modify: `reader/src/style.css:1-24` (`:root` block)

- [ ] **Step 1: Add new utility variables to `:root`**

After line 13 (`--warn`), add these new variables that currently have hardcoded rgba values elsewhere:

```css
  --accent-faint: rgba(232, 93, 76, 0.04);
  --accent-mid: rgba(232, 93, 76, 0.08);
  --signal-faint: rgba(126, 184, 168, 0.08);
  --overlay: rgba(0, 0, 0, 0.5);
```

- [ ] **Step 2: Add `[data-theme="light"]` block**

After the `:root` closing brace (line 24), add:

```css
[data-theme="light"] {
  --ink: #f7f4ee;
  --panel: #ffffff;
  --elevated: #f0ece4;
  --line: #d5cfc4;
  --muted: #706a5e;
  --paper: #2c2a26;
  --paper-read: #1a1916;
  --accent: #c0453a;
  --accent-dim: rgba(192, 69, 58, 0.12);
  --accent-faint: rgba(192, 69, 58, 0.04);
  --accent-mid: rgba(192, 69, 58, 0.08);
  --signal: #2e8a65;
  --signal-dim: rgba(46, 138, 101, 0.10);
  --signal-faint: rgba(46, 138, 101, 0.06);
  --warn: #b8922a;
  --nav-settings: #6e7fa8;
  --nav-digest-detail: #9a6ab8;
  --overlay: rgba(0, 0, 0, 0.3);
}
```

- [ ] **Step 3: Add `[data-theme="solarized"]` block**

Immediately after the light block:

```css
[data-theme="solarized"] {
  --ink: #002b36;
  --panel: #073642;
  --elevated: #0a3f4c;
  --line: #586e75;
  --muted: #839496;
  --paper: #eee8d5;
  --paper-read: #fdf6e3;
  --accent: #cb4b16;
  --accent-dim: rgba(203, 75, 22, 0.15);
  --accent-faint: rgba(203, 75, 22, 0.04);
  --accent-mid: rgba(203, 75, 22, 0.08);
  --signal: #2aa198;
  --signal-dim: rgba(42, 161, 152, 0.12);
  --signal-faint: rgba(42, 161, 152, 0.06);
  --warn: #b58900;
  --nav-settings: #6c71c4;
  --nav-digest-detail: #d33682;
  --overlay: rgba(0, 0, 0, 0.45);
}
```

- [ ] **Step 4: Verify dark theme unchanged**

Open the app — should look exactly the same as before (dark is default). No visual regression.

- [ ] **Step 5: Commit**

```bash
git add reader/src/style.css
git commit -m "feat(reader): add light and solarized CSS variable blocks"
```

---

### Task 3: Replace hardcoded rgba values with variables

**Files:**
- Modify: `reader/src/style.css` at lines 1336, 2475, 2555, 156

- [ ] **Step 1: Replace accent hover rgba at line 1336**

Find in `.mock-table tr:hover td`:
```css
/* old */ background: rgba(232, 93, 76, 0.04);
/* new */ background: var(--accent-faint);
```

- [ ] **Step 2: Replace accent highlight at line 2475**

Find in `.yt-sub-row.is-current`:
```css
/* old */ background: rgba(232, 93, 76, 0.08);
/* new */ background: var(--accent-mid);
```

- [ ] **Step 3: Replace signal highlight at line 2555**

Find in `.tr-tab.active`:
```css
/* old */ background: rgba(126, 184, 168, 0.08);
/* new */ background: var(--signal-faint);
```

- [ ] **Step 4: Replace nav backdrop at line 156**

Find in `.nav-drawer-backdrop`:
```css
/* old */ background: rgba(0, 0, 0, 0.5);
/* new */ background: var(--overlay);
```

- [ ] **Step 5: Verify dark theme still looks identical**

Check the captures table hover, YouTube subtitle current-row highlight, transcript tab active state, and mobile nav backdrop. All should look the same on dark theme.

- [ ] **Step 6: Commit**

```bash
git add reader/src/style.css
git commit -m "refactor(reader): replace hardcoded rgba colors with CSS variables"
```

---

### Task 4: Noise and grid-bg theme adaptation

**Files:**
- Modify: `reader/src/style.css:49-68` (`.noise` and `.grid-bg`)

- [ ] **Step 1: Adjust noise opacity for light theme**

The noise overlay is subtle (`opacity: 0.028`) on dark. On light backgrounds it needs to be even subtler. Add after the `.grid-bg` block:

```css
[data-theme="light"] .noise {
  opacity: 0.015;
}
[data-theme="light"] .grid-bg {
  opacity: 0.055;
}
```

- [ ] **Step 2: Verify noise/grid are visible but subtle on all themes**

Toggle themes via console (`document.documentElement.setAttribute('data-theme','light')`) and check noise/grid appearance.

- [ ] **Step 3: Commit**

```bash
git add reader/src/style.css
git commit -m "fix(reader): adjust noise and grid opacity for light theme"
```

---

### Task 5: Theme transition CSS

**Files:**
- Modify: `reader/src/style.css` (after the `html, body` block around line 47)

- [ ] **Step 1: Add transition for smooth theme switching**

Add after the `html, body` block:

```css
html[data-theme] body,
html[data-theme] .app,
html[data-theme] .rail,
html[data-theme] .masthead,
html[data-theme] .mobile-topbar,
html[data-theme] .side,
html[data-theme] .nav-drawer,
html[data-theme] .card,
html[data-theme] .chip,
html[data-theme] .mock-table,
html[data-theme] .ingest-shell,
html[data-theme] .status-strip {
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
```

- [ ] **Step 2: Verify transition is smooth**

Toggle theme via console — should animate smoothly over 200ms, no jarring flash.

- [ ] **Step 3: Commit**

```bash
git add reader/src/style.css
git commit -m "feat(reader): add smooth CSS transitions for theme switching"
```

---

### Task 6: Theme switcher UI — CSS styles

**Files:**
- Modify: `reader/src/style.css` (add new block near the masthead styles)

- [ ] **Step 1: Add theme-switcher CSS**

Add the following CSS block after the `.status-strip` styles:

```css
/* ── Theme switcher ─────────────────────────────────────── */
.theme-switcher {
  display: flex;
  gap: 2px;
  background: rgba(128, 128, 128, 0.10);
  border-radius: 6px;
  padding: 3px;
}
.theme-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--muted);
  transition: background 0.15s ease, color 0.15s ease;
}
.theme-btn:hover {
  background: rgba(128, 128, 128, 0.15);
  color: var(--paper);
}
.theme-btn.active {
  background: rgba(128, 128, 128, 0.22);
  color: var(--paper);
}
.theme-btn svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Desktop: inside masthead, top-right */
.masthead {
  position: relative;
}
.masthead .theme-switcher {
  position: absolute;
  top: 1.2rem;
  right: 0;
}

/* Mobile: inside topbar, right side */
.mobile-topbar .theme-switcher {
  margin-left: auto;
}
```

- [ ] **Step 2: Commit**

```bash
git add reader/src/style.css
git commit -m "feat(reader): add theme switcher button styles"
```

---

### Task 7: Theme switcher UI — HTML + JS in main.ts

**Files:**
- Modify: `reader/src/main.ts`

- [ ] **Step 1: Add SVG icon constants and switcher HTML function**

After the `esc()` function (around line 50), add:

```typescript
/* ── Theme switcher ──────────────────────────────────────── */
const THEME_ICONS = {
  dark: '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>',
  light: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  solarized: '<svg viewBox="0 0 24 24"><path d="M10 2v7.527a2 2 0 0 1-1 1.732L6 13v1h12v-1l-3-1.741A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/><path d="M9 20a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-1H9z"/></svg>',
} as const;

type ThemeName = 'dark' | 'light' | 'solarized';
const THEMES: ThemeName[] = ['dark', 'light', 'solarized'];

function currentTheme(): ThemeName {
  return (document.documentElement.getAttribute('data-theme') as ThemeName) || 'dark';
}

function setTheme(t: ThemeName): void {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('theme', t);
  // Update all switcher active states
  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.theme === t);
  });
}

function themeSwitcherHtml(): string {
  const cur = currentTheme();
  return `<div class="theme-switcher">${THEMES.map(
    (t) =>
      `<button type="button" class="theme-btn${t === cur ? ' active' : ''}" data-theme="${t}" aria-label="Theme: ${t}" title="${t[0].toUpperCase() + t.slice(1)}">${THEME_ICONS[t]}</button>`,
  ).join('')}</div>`;
}
```

- [ ] **Step 2: Insert switcher into all mastheads**

At each `<header class="masthead">` (lines 830, 878, 1270, 1313), insert the switcher after the opening tag. For each masthead, change:

```typescript
// before
<header class="masthead">
// after
<header class="masthead">
  ${themeSwitcherHtml()}
```

Do this at all 4 masthead locations.

- [ ] **Step 3: Insert switcher into mobile-topbar**

At line 328, update the mobile-topbar to include the switcher:

```typescript
// before
<span class="mobile-brand">Second brain</span>
// after
<span class="mobile-brand">Second brain</span>
${themeSwitcherHtml()}
```

- [ ] **Step 4: Add click event delegation**

Find the place where event listeners are bound (after `app.innerHTML = layoutShell()` or in the route handler). Add a delegated click listener for theme buttons. Add this near the top-level event binding area:

```typescript
document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.theme-btn');
  if (btn?.dataset.theme) {
    setTheme(btn.dataset.theme as ThemeName);
  }
});
```

- [ ] **Step 5: Verify switcher renders and works**

Open the app. Check:
- Switcher visible in top-right of masthead on desktop
- Switcher visible in mobile-topbar on mobile (resize to <960px)
- Clicking each icon changes the theme
- Active state highlights the current theme icon
- Theme persists after page reload

- [ ] **Step 6: Commit**

```bash
git add reader/src/main.ts
git commit -m "feat(reader): add theme switcher component with persistence"
```

---

### Task 8: Light theme shadow adjustments

**Files:**
- Modify: `reader/src/style.css`

- [ ] **Step 1: Lighten shadows for light theme**

The dark theme uses heavy `rgba(0,0,0,...)` shadows. On the light theme these are too harsh. Add overrides:

```css
[data-theme="light"] .modal,
[data-theme="light"] .ingest-agent-panel,
[data-theme="light"] .capture-detail-modal {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}
[data-theme="light"] .nav-drawer {
  box-shadow: 8px 0 40px rgba(0, 0, 0, 0.1);
}
```

- [ ] **Step 2: Verify modals and drawers look good on light theme**

Open a capture detail on light theme. Check modal shadow looks subtle but visible. Check mobile nav drawer shadow.

- [ ] **Step 3: Commit**

```bash
git add reader/src/style.css
git commit -m "fix(reader): soften shadows for light theme"
```

---

### Task 9: Visual verification across all views and themes

**Files:** None (verification only)

- [ ] **Step 1: Dark theme — check all views**

Navigate through: Home, Captures list, Capture detail, Digests list, Digest detail. Verify everything looks exactly like it did before (zero regression).

- [ ] **Step 2: Light theme — check all views**

Switch to Light. Walk through every view. Check:
- Text readability (contrast)
- Chip/tag visibility
- Ingest form input contrast
- Capture cards
- YouTube player area
- Transcript tabs and rows
- Code blocks

- [ ] **Step 3: Solarized theme — check all views**

Switch to Solarized. Same walkthrough. Check:
- Elevated surfaces are distinguishable from panel
- Accent colors pop against the blue-green background
- Transcript bilingual/en/vi tabs look correct

- [ ] **Step 4: Mobile — all three themes**

Resize to <960px. Verify:
- Switcher visible in topbar
- Nav drawer looks right on all themes
- Content is readable

- [ ] **Step 5: Persistence test**

Set light theme, reload — should stay light. Set solarized, reload — should stay solarized. Clear localStorage, reload — should default to dark.

- [ ] **Step 6: Fix any issues found**

If any contrast, spacing, or visual issues are discovered, fix them before the final commit.

- [ ] **Step 7: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix(reader): address visual issues from theme QA"
```
