# Theme Switcher — Design Spec

**Date**: 2026-03-22
**Branch**: `feature/light`
**Scope**: reader only (vanilla JS SPA)

## Overview

Add a theme switcher to reader supporting three themes: Dark (current), Light (Warm Parchment), and Solarized Dark. The switcher lives in the top-right of the masthead header, persists to localStorage, and swaps CSS variables without page reload.

## Themes

### Dark (current — unchanged)

| Variable | Value |
|----------|-------|
| `--ink` | `#070809` |
| `--panel` | `#0e1014` |
| `--elevated` | `#151820` |
| `--line` | `#2a303c` |
| `--muted` | `#6b7287` |
| `--paper` | `#e8e4dc` |
| `--paper-read` | `#f2efe6` |
| `--accent` | `#e85d4c` |
| `--accent-dim` | `rgba(232, 93, 76, 0.15)` |
| `--signal` | `#3d9a7a` |
| `--signal-dim` | `rgba(61, 154, 122, 0.12)` |
| `--warn` | `#c9a227` |
| `--nav-settings` | `#8b9dc9` |
| `--nav-digest-detail` | `#b87fd9` |

### Light — Warm Parchment

| Variable | Value |
|----------|-------|
| `--ink` | `#f7f4ee` |
| `--panel` | `#ffffff` |
| `--elevated` | `#f0ece4` |
| `--line` | `#d5cfc4` |
| `--muted` | `#706a5e` |
| `--paper` | `#2c2a26` |
| `--paper-read` | `#1a1916` |
| `--accent` | `#c0453a` |
| `--accent-dim` | `rgba(192, 69, 58, 0.12)` |
| `--signal` | `#2e8a65` |
| `--signal-dim` | `rgba(46, 138, 101, 0.10)` |
| `--warn` | `#b8922a` |
| `--nav-settings` | `#6e7fa8` |
| `--nav-digest-detail` | `#9a6ab8` |

Design rationale: Creamy off-white (`#f7f4ee`) evokes aged paper, keeping the editorial/bookish feel. Accents are deepened for WCAG AA contrast on light backgrounds.

### Solarized Dark

| Variable | Value |
|----------|-------|
| `--ink` | `#002b36` |
| `--panel` | `#073642` |
| `--elevated` | `#0a3f4c` |
| `--line` | `#586e75` |
| `--muted` | `#839496` |
| `--paper` | `#eee8d5` |
| `--paper-read` | `#fdf6e3` |
| `--accent` | `#cb4b16` |
| `--accent-dim` | `rgba(203, 75, 22, 0.15)` |
| `--signal` | `#2aa198` |
| `--signal-dim` | `rgba(42, 161, 152, 0.12)` |
| `--warn` | `#b58900` |
| `--nav-settings` | `#6c71c4` |
| `--nav-digest-detail` | `#d33682` |

Design rationale: Ethan Schoonover's Solarized palette. Uses base03 for ink, base02 for panels, a slightly lighter `#0a3f4c` for elevated surfaces (card distinction), and base0 (`#839496`) for muted text (proper contrast). Canonical accent colors mapped to the app's semantic roles.

## Typography

Fonts stay consistent across all three themes — no font changes per theme:
- **Display**: `DM Serif Display` (headings)
- **Body**: `Literata` (reading text)
- **Mono**: `JetBrains Mono` (code, metadata)

## Implementation Approach

### Mechanism: `data-theme` attribute on `<html>`

```html
<html data-theme="dark">
```

CSS structure:

```css
/* Dark is default (current :root values stay) */
:root { --ink: #070809; --panel: #0e1014; /* ... */ }

[data-theme="light"] { --ink: #f7f4ee; --panel: #ffffff; /* ... */ }
[data-theme="solarized"] { --ink: #002b36; --panel: #073642; /* ... */ }
```

### Flash prevention

Inline `<script>` in `index.html` `<head>`, before CSS loads:

```js
(function() {
  var t = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', t);
})();
```

### Switcher UI

- **Location**: Top-right of `.masthead` header (absolute positioned)
- **Shape**: Pill container with 3 icon buttons (32x32px each)
- **Icons**: Inline SVG icons for cross-platform consistency — moon (dark), sun (light), beaker/flask (solarized)
- **Active state**: Subtle background highlight on the selected theme
- **Transition**: 200ms ease on `background-color`, `color`, `border-color`, `box-shadow` properties on themed elements
- **Mobile**: Switcher also appears in `.mobile-topbar` (right side) since `.masthead` is not visible at `max-width: 960px`

### Persistence

- `localStorage.setItem('theme', themeName)` on switch
- Read on page load via the inline head script
- Default: `'dark'` (current behavior, zero regression)

### Variable naming note

Variable names (`--ink`, `--paper`, etc.) refer to their semantic role in the dark theme. In the light theme, `--ink` becomes a light background and `--paper` becomes dark text — the values invert but the variable names stay the same. This is intentional: CSS already uses `--ink` for backgrounds and `--paper` for text, so swapping the values is all that's needed.

### Hardcoded color audit

All hardcoded hex/rgba colors in `style.css` and `main.ts` that match theme semantics must be replaced with CSS variable references.

**Known hardcoded colors in `style.css`:**
- `rgba(232, 93, 76, 0.04)` — accent-based hover (add `--accent-faint` variable)
- `rgba(232, 93, 76, 0.08)` — accent highlight on `.yt-sub-row.is-current`
- `rgba(126, 184, 168, 0.08)` — signal-based highlight on `.tr-tab.active`
- `background: #000` on video/media containers — keep as-is (intentionally black regardless of theme)

**New variables needed:**
- `--accent-faint` — very low-opacity accent for hover states
- `--signal-faint` — very low-opacity signal for active tab states

Additionally, audit `main.ts` inline style colors (e.g., `style="color:var(--warn)"` patterns are already correct, but any literal hex values need variable references).

Non-color variables (`--radius`, `--ease-out`, `--font-display`, `--font-body`, `--font-mono`) remain unchanged across all themes.

## Files Changed

| File | Change |
|------|--------|
| `reader/src/style.css` | Add `[data-theme="light"]` and `[data-theme="solarized"]` variable blocks; add `.theme-switcher` styles; add transition properties; audit/replace hardcoded colors |
| `reader/src/main.ts` | Add `themeSwitcherHtml()` function; insert switcher into masthead templates; add click handler + localStorage logic; audit inline style colors |
| `reader/index.html` | Add flash-prevention inline script in `<head>` |

## Testing

- Visual verification: toggle each theme, check all views (home, captures, capture detail, digests, digest detail)
- localStorage persistence: set theme, reload page, verify it persists
- Default behavior: clear localStorage, verify dark theme loads (no regression)
- Mobile: verify switcher is accessible on mobile layout
- Contrast: spot-check text readability on all three themes

## Out of Scope

- System `prefers-color-scheme` detection
- Per-component theme overrides
- Additional themes beyond the three specified
- Theme for the vault CLI or non-web components
