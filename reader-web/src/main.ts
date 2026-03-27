import './style.css';
import { marked, Renderer } from 'marked';
import type { Tokens } from 'marked';
import type { CaptureDetail, CaptureListItem, ReactionEntry } from './types.js';
import { ratingStarsOnly } from '../vault/reactionsMarkdown.js';
import {
  findActiveSegmentIndex,
  mergeTranscriptsForUi,
  type MergedTranscriptLine,
} from './transcriptParse.js';

/** Minimal surface used from YouTube IFrame API (avoids @types/youtube). */
type YtPlayerApi = {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  getCurrentTime(): number;
  destroy(): void;
};

let ytCaptureCleanup: (() => void) | null = null;
let filmstripLightboxCleanup: (() => void) | null = null;

function loadYoutubeIframeApi(): Promise<void> {
  const w = window as unknown as {
    YT?: { Player?: new (id: string, opts: object) => YtPlayerApi };
    onYouTubeIframeAPIReady?: () => void;
  };
  if (w.YT?.Player) return Promise.resolve();

  return new Promise((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      document.head.appendChild(s);
    }
  });
}

const app = document.querySelector<HTMLDivElement>('#app')!;

marked.setOptions({ gfm: true, breaks: true });

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/* ── Theme switcher ──────────────────────────────────────── */
const THEME_ICONS = {
  dark: '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>',
  light: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  solarized: '<svg viewBox="0 0 24 24"><path d="M10 2v7.527a2 2 0 0 1-1 1.732L6 13v1h12v-1l-3-1.741A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/><path d="M9 20a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-1H9z"/></svg>',
} as const;

/** Library row “open” affordance (row click opens detail; icon is decorative). */
const LIB_OPEN_CHEVRON_SVG =
  '<svg class="mock-table-open__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10 6 6 6-6 6"/></svg>';

type ThemeName = 'dark' | 'light' | 'solarized';
const THEMES: ThemeName[] = ['dark', 'light', 'solarized'];

function currentTheme(): ThemeName {
  return (document.documentElement.getAttribute('data-theme') as ThemeName) || 'dark';
}

function setTheme(t: ThemeName): void {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('theme', t);
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

/** Staggered step highlights while waiting on `postIngest` (cosmetic; API is single round-trip). */
const INGEST_AGENT_STEP_MS = 1050;

function ingestAgentVisibleSteps(panel: HTMLElement): HTMLElement[] {
  const noYt = panel.classList.contains('ingest-agent-status--no-yt');
  return [...panel.querySelectorAll<HTMLElement>('.ingest-agent-step')].filter(
    (el) => !noYt || !el.classList.contains('ingest-agent-step--yt-only'),
  );
}

function ingestAgentResetSteps(panel: HTMLElement) {
  panel.querySelectorAll('.ingest-agent-step').forEach((el) => {
    el.classList.remove('is-active', 'is-done', 'is-error');
    el.classList.add('is-pending');
  });
}

function ingestAgentSetStep(step: HTMLElement, state: 'pending' | 'active' | 'done' | 'error') {
  step.classList.remove('is-pending', 'is-active', 'is-done', 'is-error');
  step.classList.add(`is-${state}`);
}

function ingestAgentMarkAllDone(panel: HTMLElement) {
  ingestAgentVisibleSteps(panel).forEach((el) => ingestAgentSetStep(el, 'done'));
}

function ingestAgentMarkActiveError(panel: HTMLElement) {
  const vis = ingestAgentVisibleSteps(panel);
  const active = vis.find((el) => el.classList.contains('is-active'));
  const target = active ?? vis[vis.length - 1];
  if (target) ingestAgentSetStep(target, 'error');
}

function startIngestAgentStepTicker(panel: HTMLElement): () => void {
  const steps = ingestAgentVisibleSteps(panel);
  ingestAgentResetSteps(panel);
  if (steps.length === 0) return () => {};
  let idx = 0;
  ingestAgentSetStep(steps[0]!, 'active');
  const id = window.setInterval(() => {
    if (idx >= steps.length - 1) {
      window.clearInterval(id);
      return;
    }
    ingestAgentSetStep(steps[idx]!, 'done');
    idx += 1;
    ingestAgentSetStep(steps[idx]!, 'active');
  }, INGEST_AGENT_STEP_MS);
  return () => window.clearInterval(id);
}

type NoteToHtmlOpts = { omitImages?: boolean };

/**
 * Reader-only rendering. `omitImages` drops figures from markdown/HTML output (vault files unchanged).
 */
function noteToHtml(markdown: string, captureId: string, opts?: NoteToHtmlOpts): string {
  let md = markdown;
  const omit = Boolean(opts?.omitImages);

  if (omit) {
    md = md.replace(/!\[\[assets\/[^|\]]+(?:\|[^\]]*)?\]\]\s*/g, '');
    md = md.replace(/!\[[^\]]*\]\([^)]+\)\s*/g, '');
    md = md.replace(/<img\b[^>]*>\s*/gi, '');
    md = stripImageSectionHeadings(md);
  } else {
    md = md.replace(
      /!\[\[assets\/([^|\]]+)(?:\|[^\]]*)?\]\]/g,
      (_, name: string) =>
        `![](/api/captures/${encodeURIComponent(captureId)}/assets/${encodeURIComponent(name.trim())})`,
    );
  }

  // Convert Obsidian wikilinks [[Captures/<id>/note|Title]] → in-app links
  md = md.replace(
    /\[\[Captures\/(.+?)\/note\|([^\]]+)\]\]/g,
    (_, folder: string, alias: string) => {
      const id = folder.trim();
      const label = alias.trim().replace(/\[/g, '\\[').replace(/\]/g, '\\]');
      return `[${label}](#/capture/${encodeURIComponent(id)})`;
    },
  );
  md = md.replace(
    /\[\[Captures\/(.+?)\/note\]\]/g,
    (_, folder: string) => {
      const id = folder.trim();
      return `[${id}](#/capture/${encodeURIComponent(id)})`;
    },
  );

  let html = marked.parse(md) as string;
  if (omit) {
    html = html.replace(/<img\b[^>]*>/gi, '');
    html = html.replace(/<picture\b[^>]*>[\s\S]*?<\/picture>/gi, '');
  }
  return html;
}

/**
 * Paragraphs that are only bare `<img>` or `<a><img></a>` (whitespace between allowed).
 * Used to group consecutive image blocks into a horizontal filmstrip in capture notes.
 */
function collectSlideImagesFromP(p: HTMLParagraphElement): HTMLImageElement[] | null {
  const imgs: HTMLImageElement[] = [];
  for (const child of Array.from(p.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent?.trim()) return null;
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return null;
    const el = child as HTMLElement;
    /* marked `breaks: true` joins consecutive `![](…)` lines into one <p> with <br> between imgs */
    if (el.tagName === 'BR') continue;
    if (el.tagName === 'IMG') {
      imgs.push(el as HTMLImageElement);
      continue;
    }
    if (el.tagName === 'A') {
      if (el.childElementCount !== 1 || el.firstElementChild?.tagName !== 'IMG') return null;
      imgs.push(el.firstElementChild as HTMLImageElement);
      continue;
    }
    return null;
  }
  return imgs.length > 0 ? imgs : null;
}

function bindFilmstripKeyboard(track: HTMLElement): void {
  track.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    ev.preventDefault();
    const step = Math.min(Math.round(track.clientWidth * 0.72), 420);
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollBy({
      left: ev.key === 'ArrowRight' ? step : -step,
      behavior: smooth ? 'smooth' : 'auto',
    });
  });
}

function bindFilmstripChrome(track: HTMLElement, idxEl: HTMLElement, slides: HTMLElement[]): void {
  const total = slides.length;
  if (total === 0) return;

  const pad = (n: number) => String(n).padStart(2, '0');
  const setIdx = (i: number) => {
    idxEl.textContent = `${pad(Math.min(i + 1, total))} / ${pad(total)}`;
  };

  if (typeof IntersectionObserver === 'undefined') {
    setIdx(0);
    return;
  }

  const ratios = new Map<Element, number>();
  slides.forEach((s) => ratios.set(s, 0));
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        ratios.set(e.target, e.intersectionRatio);
      }
      let pick = 0;
      let maxR = -1;
      slides.forEach((s, i) => {
        const r = ratios.get(s) ?? 0;
        if (r > maxR) {
          maxR = r;
          pick = i;
        }
      });
      if (maxR < 0.08) return;
      setIdx(pick);
    },
    { root: track, threshold: [0.15, 0.35, 0.55, 0.75, 0.95] },
  );
  slides.forEach((s) => io.observe(s));
  setIdx(0);
}

function closeFilmstripImageLightbox(): void {
  filmstripLightboxCleanup?.();
  filmstripLightboxCleanup = null;
}

/** Full-size viewer for filmstrip images (dialog on `document.body`). */
function openFilmstripImageLightbox(source: HTMLImageElement): void {
  closeFilmstripImageLightbox();

  const prevHtmlOverflow = document.documentElement.style.overflow;
  const prevBodyOverflow = document.body.style.overflow;
  const prevActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const root = document.createElement('div');
  root.className = 'cap-img-lightbox';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Ảnh phóng to');

  const scrim = document.createElement('button');
  scrim.type = 'button';
  scrim.className = 'cap-img-lightbox__scrim';
  scrim.setAttribute('aria-label', 'Đóng xem ảnh');

  const stage = document.createElement('div');
  stage.className = 'cap-img-lightbox__stage';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'cap-img-lightbox__close';
  closeBtn.setAttribute('aria-label', 'Đóng (Escape)');
  const closeMark = document.createElement('span');
  closeMark.className = 'cap-img-lightbox__close-mark';
  closeMark.setAttribute('aria-hidden', 'true');
  const closeSr = document.createElement('span');
  closeSr.className = 'visually-hidden';
  closeSr.textContent = 'Đóng';
  closeBtn.append(closeMark, closeSr);

  const figure = document.createElement('figure');
  figure.className = 'cap-img-lightbox__figure';

  const big = document.createElement('img');
  big.className = 'cap-img-lightbox__img';
  big.decoding = 'async';
  big.src = source.currentSrc || source.src;
  const alt = source.getAttribute('alt');
  if (alt != null) big.setAttribute('alt', alt);

  const cap = document.createElement('figcaption');
  cap.className = 'cap-img-lightbox__caption';

  const onImgLoad = (): void => {
    const w = big.naturalWidth;
    const h = big.naturalHeight;
    if (w > 0 && h > 0) {
      cap.textContent = `${w.toLocaleString('vi-VN')} × ${h.toLocaleString('vi-VN')} px`;
    }
  };
  if (big.complete) onImgLoad();
  else big.addEventListener('load', onImgLoad, { once: true });

  figure.append(big, cap);
  stage.append(closeBtn, figure);
  root.append(scrim, stage);
  document.body.appendChild(root);

  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      teardown();
    }
  };

  const teardown = (): void => {
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    document.documentElement.style.overflow = prevHtmlOverflow;
    document.body.style.overflow = prevBodyOverflow;
    filmstripLightboxCleanup = null;
    prevActive?.focus({ preventScroll: true });
  };

  filmstripLightboxCleanup = teardown;

  scrim.addEventListener('click', () => teardown());
  closeBtn.addEventListener('click', () => teardown());
  stage.addEventListener('click', (ev) => {
    if (ev.target === stage) teardown();
  });

  document.addEventListener('keydown', onKey, true);
  closeBtn.focus({ preventScroll: true });
}

function bindFilmstripImageLightbox(prose: HTMLElement): void {
  prose.addEventListener('click', (ev: Event) => {
    const t = ev.target;
    if (!(t instanceof HTMLImageElement)) return;
    if (!t.closest('.prose-filmstrip__slide')) return;
    ev.preventDefault();
    openFilmstripImageLightbox(t);
  });
}

/** Wrap runs of 2+ consecutive image-only paragraphs in `#note-prose` into a horizontal scroll strip. */
function wrapConsecutiveProseImagesInFilmstrips(prose: Element): void {
  let changed = true;
  while (changed) {
    changed = false;
    const blocks = Array.from(prose.children);
    for (let i = 0; i < blocks.length; i += 1) {
      const el = blocks[i]!;
      const imgs0 = el instanceof HTMLParagraphElement ? collectSlideImagesFromP(el) : null;
      if (!imgs0) continue;
      let j = i + 1;
      while (j < blocks.length) {
        const b = blocks[j]!;
        if (!(b instanceof HTMLParagraphElement)) break;
        const im = collectSlideImagesFromP(b);
        if (!im) break;
        j += 1;
      }
      const runEls = blocks.slice(i, j) as HTMLParagraphElement[];
      const flatImgs = runEls.flatMap((para) => collectSlideImagesFromP(para)!);
      if (flatImgs.length < 2) continue;

      const strip = document.createElement('div');
      strip.className = 'prose-filmstrip';
      strip.setAttribute('role', 'region');
      strip.setAttribute('aria-label', 'Ảnh liên tiếp — cuộn ngang để xem');

      const head = document.createElement('div');
      head.className = 'prose-filmstrip__head';

      const eyebrow = document.createElement('span');
      eyebrow.className = 'prose-filmstrip__eyebrow';
      eyebrow.textContent = 'Dải ảnh';

      const idx = document.createElement('span');
      idx.className = 'prose-filmstrip__idx';
      idx.setAttribute('aria-live', 'polite');
      const total = flatImgs.length;
      idx.textContent = `01 / ${String(total).padStart(2, '0')}`;

      const hint = document.createElement('span');
      hint.className = 'prose-filmstrip__hint';
      hint.textContent = '← cuộn →';

      head.append(eyebrow, idx, hint);

      const track = document.createElement('div');
      track.className = 'prose-filmstrip__track';
      track.setAttribute('tabindex', '0');
      track.setAttribute(
        'aria-label',
        'Cuộn ngang xem từng ảnh; phím mũi tên trái phải khi vùng này đang được focus',
      );

      const slides: HTMLElement[] = [];
      for (const img of flatImgs) {
        const slide = document.createElement('div');
        slide.className = 'prose-filmstrip__slide';
        slide.appendChild(img);
        track.appendChild(slide);
        slides.push(slide);
      }

      strip.append(head, track);
      bindFilmstripChrome(track, idx, slides);
      bindFilmstripKeyboard(track);

      prose.insertBefore(strip, runEls[0]!);
      runEls.forEach((para) => para.remove());
      changed = true;
      break;
    }
  }
}

/** Drop “images” section + body until next ATX heading (YouTube: redundant vs embed). */
function stripImageSectionHeadings(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  const imageSectionTitle = /^#{2,6}\s+(Hình ảnh|Images|Ảnh)\s*$/;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (imageSectionTitle.test(line)) {
      i += 1;
      while (i < lines.length && !/^#{1,6}\s+/.test(lines[i]!)) {
        i += 1;
      }
      i -= 1;
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
}

/** Middle segment of `YYYY-MM-DD--slug--hash` for compact toolbar label. */
function captureBreadcrumbLabel(id: string): string {
  const m = /^[\d]{4}-[\d]{2}-[\d]{2}--(.+)--[a-f0-9]{6}$/.exec(id);
  const slug = m?.[1] ?? id;
  if (slug.length <= 42) return slug;
  return `${slug.slice(0, 38)}…`;
}

/** ISO instant → Vietnamese prose, fixed to Asia/Ho_Chi_Minh (24h, locale wording). Omits vi-VN “lúc ” prefix. */
function formatIngestedVi(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso.trim() || '—';
  const d = new Date(t);
  const fmt = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return fmt
    .formatToParts(d)
    .filter((p) => !(p.type === 'literal' && p.value === 'lúc '))
    .map((p) => p.value)
    .join('');
}

/** Obsidian-style YAML frontmatter (single-line scalar values only). */
function parseSimpleYamlFrontmatter(md: string): { front: Record<string, string>; body: string } | null {
  const lines = md.replace(/^\uFEFF?/, '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  const front: Record<string, string> = {};
  let i = 1;
  let closed = false;
  for (; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.trim() === '---') {
      closed = true;
      i += 1;
      break;
    }
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (kv) {
      let v = kv[2]!.trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      front[kv[1]!] = v;
    }
  }
  if (!closed) return null;
  const body = lines.slice(i).join('\n');
  return { front, body };
}

function stripDigestBodyLeadingH1(md: string, week: string): string {
  const w = week.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^#\\s+Digest\\s+${w}\\s*(?:\\r?\\n)+`, 'im');
  return md.trimStart().replace(re, '');
}

function slugifyDigestHeading(text: string): string {
  const t = text
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return t || 'section';
}

/**
 * Marked requires a full Renderer (incl. `text`, `link`, …). A plain `{ heading }` object
 * replaces the default and breaks inline parsing → "renderer.text is not a function".
 */
class DigestHeadingRenderer extends Renderer {
  constructor(private readonly h2IdPrefix: string) {
    super();
  }

  override heading(token: Tokens.Heading): string {
    if (token.depth === 2) {
      const inner = this.parser.parseInline(token.tokens);
      const slug = slugifyDigestHeading(token.text);
      return `<h2 id="${this.h2IdPrefix}-${slug}" class="digest-h2">${inner}</h2>\n`;
    }
    return super.heading(token);
  }
}

/** Adds `digest-capture-link` for in-app capture navigation from wikilink-derived anchors. */
class DigestProseRenderer extends DigestHeadingRenderer {
  constructor(h2IdPrefix: string) {
    super(h2IdPrefix);
  }

  override link(token: Tokens.Link): string {
    const { href, title, tokens } = token;
    if (href.startsWith('#/capture/')) {
      const inner = this.parser.parseInline(tokens);
      const t =
        title != null && String(title).trim() !== ''
          ? ` title="${String(title).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`
          : '';
      return `<a href="${href}" class="digest-capture-link"${t}>${inner}</a>`;
    }
    return super.link(token);
  }
}

/**
 * CLI digest lines use Obsidian wikilinks: `[[Captures/<id>/note|Title]]`.
 * Marked does not parse those; convert to markdown links the SPA understands.
 */
function transformDigestCapturesWikilinks(markdown: string): string {
  const mdLink = (folder: string, display: string) => {
    const id = folder.trim();
    const raw = display.trim() || id;
    const label = raw
      .replace(/\\/g, '\\\\')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');
    return `[${label}](#/capture/${encodeURIComponent(id)})`;
  };
  let s = markdown;
  s = s.replace(/\[\[Captures\/(.+?)\/note\|([^\]]+)\]\]/g, (_, folder: string, alias: string) =>
    mdLink(folder, alias),
  );
  s = s.replace(/\[\[Captures\/(.+?)\/note\]\]/g, (_, folder: string) => mdLink(folder, folder));
  return s;
}

function markdownToProseHtml(markdown: string, opts?: { h2IdPrefix?: string }): string {
  const pfx = opts?.h2IdPrefix;
  if (!pfx) return marked.parse(markdown) as string;

  return marked.parse(markdown, { renderer: new DigestProseRenderer(pfx) }) as string;
}

function renderDigestMetaPanel(front: Record<string, string>): string {
  const rows: { k: string; v: string }[] = [];
  if (front.type) rows.push({ k: 'Loại', v: front.type });
  if (front.week) rows.push({ k: 'Tuần', v: front.week });
  if (front.since) rows.push({ k: 'Khung', v: front.since });
  if (front.generated_at) rows.push({ k: 'Sinh', v: formatIngestedVi(front.generated_at) });
  if (rows.length === 0) return '';
  const cells = rows
    .map(
      (r) =>
        `<div class="digest-meta__cell"><dt>${esc(r.k)}</dt><dd>${esc(r.v)}</dd></div>`,
    )
    .join('');
  return `<aside class="digest-meta" aria-label="Siêu dữ liệu digest"><div class="digest-meta__grid">${cells}</div></aside>`;
}

function renderDigestToc(bodyMd: string): string {
  const hasCaptures = /^##\s+Captures\s*$/im.test(bodyMd);
  const hasTongQuan = /^##\s+Tổng quan\s*$/im.test(bodyMd);
  if (!hasCaptures && !hasTongQuan) return '';
  const links: string[] = [];
  if (hasCaptures) links.push(`<a href="#digest-captures">Captures</a>`);
  if (hasTongQuan) links.push(`<a href="#digest-tong-quan">Tổng quan</a>`);
  return `<nav class="digest-toc" aria-label="Mục lục trong trang">${links.join('')}</nav>`;
}

/** Avoid repeating the same H1 under the hero title. */
function stripLeadingH1IfMatches(markdown: string, title: string): string {
  const trimmed = markdown.trimStart();
  const m = /^#\s+(.+)\s*$/m.exec(trimmed);
  if (!m) return markdown;
  const h1 = m[1]!.trim();
  if (h1 === title.trim() || h1.toLowerCase() === title.trim().toLowerCase()) {
    return trimmed.replace(/^#\s+[^\n\r]*(?:\r\n|\n|\r|$)/, '').trimStart();
  }
  return markdown;
}

function safeExternalHref(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Host/path heuristics (Reader UI: hide YouTube-only ingest step when not YouTube). */
function isLikelyYoutubeUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (!/^https?:$/i.test(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    if (h === 'youtu.be' || h.endsWith('.youtube.com') || h === 'youtube.com') return true;
    if (h.endsWith('.youtube-nocookie.com') || h === 'youtube-nocookie.com') return true;
    return false;
  } catch {
    return false;
  }
}

function isLikelyXOrTwitterUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (!/^https?:$/i.test(u.protocol)) return false;
    const h = u.hostname.toLowerCase().replace(/^www\./, '');
    return h === 'x.com' || h === 'twitter.com';
  } catch {
    return false;
  }
}

const FM_SKIP_IN_GRID = new Set(['url', 'fetch_method', 'publish', 'ingested_at']);

/** Parse `tags` from note frontmatter (JSON array, bracket list, or comma-separated). */
function parseTagList(raw: string | boolean | undefined): string[] {
  if (raw === undefined || typeof raw === 'boolean') return [];
  const s = String(raw).trim();
  if (!s) return [];

  if (s.startsWith('[') && s.endsWith(']')) {
    try {
      const j = JSON.parse(s) as unknown;
      if (Array.isArray(j) && j.every((x) => typeof x === 'string')) {
        return j.map((t) => t.trim()).filter(Boolean);
      }
    } catch {
      /* bracket list without valid JSON */
    }
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(',')
      .map((t) => t.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }

  return s
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function renderCaptureTagChips(tags: string[]): string {
  if (tags.length === 0) return '';
  const chips = tags
    .map((t) => `<span class="capture-tag"><span class="capture-tag__hash" aria-hidden="true">#</span>${esc(t)}</span>`)
    .join('');
  return `<div class="capture-tags capture-tags--fm" aria-label="Thẻ (tags)">${chips}</div>`;
}

/** One cell in frontmatter table (tags = chips; boolean = pill; text = body). */
function formatFmCellValue(key: string, v: string | boolean, tagList: string[]): string {
  if (key === 'tags') {
    return tagList.length
      ? renderCaptureTagChips(tagList)
      : '<span class="fm-value-empty">—</span>';
  }
  if (typeof v === 'boolean') {
    return `<span class="fm-value-bool${v ? ' fm-value-bool--true' : ' fm-value-bool--false'}">${v ? 'true' : 'false'}</span>`;
  }
  const s = String(v);
  if (!s.trim()) return '<span class="fm-value-empty">—</span>';
  return `<span class="fm-value-text">${esc(s)}</span>`;
}

function setSideInner(html: string) {
  const el = document.querySelector('#side-inner');
  if (el) el.innerHTML = html;
}

function layoutShell(): string {
  return `
  <header class="mobile-topbar">
    <button type="button" class="menu-toggle" id="menu-toggle" aria-expanded="false" aria-controls="nav-drawer" aria-label="Mở menu điều hướng">
      <span class="burger" aria-hidden="true"></span>
    </button>
    <span class="mobile-brand">Second brain</span>
    ${themeSwitcherHtml()}
  </header>
  <div class="nav-drawer-backdrop" id="nav-drawer-backdrop" aria-hidden="true"></div>
  <nav id="nav-drawer" class="nav-drawer" aria-label="Menu điều hướng" aria-hidden="true">
    <div class="drawer-header">
      <span>Điều hướng</span>
      <button type="button" class="drawer-close" id="drawer-close" aria-label="Đóng menu">×</button>
    </div>
    <div class="drawer-links">
      <button type="button" class="drawer-link active" data-route="home">Ingest</button>
      <button type="button" class="drawer-link" data-route="captures">Captures</button>
      <button type="button" class="drawer-link" data-route="digests">Digests</button>
    </div>
  </nav>
  <div class="app">
    <aside class="rail" aria-label="Chuyển view">
      <div class="rail-inner">
        <div class="mark" title="Second brain reader"></div>
        <button type="button" class="nav-dot active" data-route="home" aria-label="Ingest" title="Ingest"></button>
        <button type="button" class="nav-dot" data-route="captures" aria-label="Captures" title="Captures"></button>
        <button type="button" class="nav-dot" data-route="digests" aria-label="Digests" title="Digests"></button>
      </div>
    </aside>
    <main id="main"></main>
    <aside class="side" aria-label="Bảng phụ theo view">
      <div id="side-inner"></div>
    </aside>
  </div>
  `;
}

function parseHash(): { view: string; id?: string } {
  const h = (location.hash.slice(1) || '/').replace(/^\/+/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'capture' && parts[1]) return { view: 'capture', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'digest' && parts[1]) return { view: 'digest', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'captures') return { view: 'captures' };
  if (parts[0] === 'digests') return { view: 'digests' };
  return { view: 'home' };
}

function setHash(view: string, id?: string) {
  if (view === 'home') location.hash = '#/';
  else if (view === 'captures') location.hash = '#/captures';
  else if (view === 'digests') location.hash = '#/digests';
  else if (view === 'capture' && id) location.hash = `#/capture/${encodeURIComponent(id)}`;
  else if (view === 'digest' && id) location.hash = `#/digest/${encodeURIComponent(id)}`;
}

async function fetchJson<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json() as Promise<T>;
}

/** Challenge file is optional; 404 → null without failing digest load. */
async function fetchChallengeMarkdown(week: string): Promise<string | null> {
  const r = await fetch(`/api/challenges/${encodeURIComponent(week)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${r.status} /api/challenges/${week}`);
  const j = (await r.json()) as { markdown?: string };
  return typeof j.markdown === 'string' ? j.markdown : null;
}

type Health = {
  ok: boolean;
  vaultRoot: string;
  brainRoot: string;
  ingestAvailable: boolean;
  /** Same gate as ingest: Brain CLI + READER_ALLOW_INGEST. */
  digestAvailable?: boolean;
  /** When true, use `POST /api/ingest/start` + SSE stream for live steps. */
  ingestSse?: boolean;
};

type IngestSseEvent =
  | { v: 1; kind: 'phase'; phase: 'fetch' | 'translate' | 'vault' | 'llm'; state: 'active' | 'done' }
  | { v: 1; kind: 'done'; captureDir: string; captureId: string }
  | { v: 1; kind: 'error'; message: string; phase?: string };

function applyIngestSseToPanel(panel: HTMLElement, ev: IngestSseEvent) {
  if (ev.kind !== 'phase') return;
  const step = panel.querySelector<HTMLElement>(`[data-step="${ev.phase}"]`);
  if (!step) return;
  ingestAgentSetStep(step, ev.state === 'active' ? 'active' : 'done');
}

async function postIngestWithSse(
  body: { url: string },
  onProgress: (ev: IngestSseEvent) => void,
): Promise<{ ok: true; captureDir: string; captureId: string }> {
  const r = await fetch('/api/ingest/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as { error?: string; jobId?: string };
  if (!r.ok) {
    throw new Error(data.error || `${r.status} /api/ingest/start`);
  }
  if (typeof data.jobId !== 'string' || !data.jobId) {
    throw new Error('ingest/start: missing jobId');
  }
  const jobId = data.jobId;
  return new Promise((resolve, reject) => {
    let settled = false;
    const es = new EventSource(`/api/ingest/stream?jobId=${encodeURIComponent(jobId)}`);
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      try {
        es.close();
      } catch {
        /* ignore */
      }
      fn();
    };
    es.onmessage = (msg) => {
      if (settled) return;
      let ev: unknown;
      try {
        ev = JSON.parse(msg.data);
      } catch {
        finish(() => reject(new Error('invalid SSE payload')));
        return;
      }
      if (!ev || typeof ev !== 'object') {
        finish(() => reject(new Error('invalid SSE payload')));
        return;
      }
      const p = ev as IngestSseEvent;
      if (p.v !== 1) return;
      if (p.kind === 'phase' || p.kind === 'done' || p.kind === 'error') {
        onProgress(p);
      }
      if (p.kind === 'done') {
        finish(() => resolve({ ok: true, captureDir: p.captureDir, captureId: p.captureId }));
        return;
      }
      if (p.kind === 'error') {
        finish(() => reject(new Error(p.message || 'ingest error')));
      }
    };
    es.onerror = () => {
      if (settled) return;
      finish(() => reject(new Error('Kết nối tiến trình ingest bị gián đoạn (SSE).')));
    };
  });
}

async function postIngest(body: { url: string }): Promise<{
  ok: true;
  captureDir: string;
  captureId: string;
}> {
  const r = await fetch('/api/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as {
    error?: string;
    stderr?: string;
    ok?: boolean;
    captureId?: string;
    captureDir?: string;
  };
  if (!r.ok) {
    const tail = data.stderr ? `\n${data.stderr.slice(0, 1200)}` : '';
    throw new Error((data.error || `${r.status}`) + tail);
  }
  return data as { ok: true; captureDir: string; captureId: string };
}

/** Maps CLI/API error text to a short Vietnamese explanation for `#ingest-status-msg`. */
function ingestFailurePresentation(
  raw: string,
  context?: { ingestUrl?: string },
): { friendly: string; detail: string } {
  const s = raw.trim();
  const low = s.toLowerCase();
  const xUrl = context?.ingestUrl ? isLikelyXOrTwitterUrl(context.ingestUrl) : false;
  let friendly =
    'Không ingest được. Xem thêm dòng chi tiết phía dưới (log/terminal) để xử lý.';
  if (low.includes('reader_allow_ingest') || low.includes('ingest disabled')) {
    friendly = 'Ingest qua web đang tắt (READER_ALLOW_INGEST). Bật lại hoặc chạy `pnpm ingest` trong terminal.';
  } else if (low.includes('too many pending')) {
    friendly = 'Có quá nhiều lệnh ingest đang chờ — đợi vài giây rồi thử lại.';
  } else if (low.includes('unknown or expired jobid') || low.includes('missing jobid')) {
    friendly = 'Phiên ingest đã hết hạn hoặc không hợp lệ — thử chạy lại từ đầu.';
  } else if (low.includes('kết nối tiến trình ingest') || low.includes('(sse)')) {
    friendly = 'Mất kết nối luồng tiến độ với server — thử lại hoặc tải lại trang.';
  } else if (low.includes('invalid sse payload')) {
    friendly = 'Server trả về dữ liệu tiến độ không đọc được — thử lại hoặc cập nhật reader.';
  } else if (low.includes('apify_token') || /\bapify\b/.test(low)) {
    friendly =
      'URL này cần Apify nhưng thiếu hoặc sai APIFY_TOKEN — thêm vào `.env` của repo Brain và khởi động lại reader.';
  } else if (
    low.includes('configure x api') ||
    low.includes('x_bearer_token') ||
    (low.includes('x_bearer') && low.includes('twitter'))
  ) {
    friendly =
      'Thiếu X_BEARER_TOKEN — đặt trong `.env` của repo Brain (token App chỉ đọc từ developer.x.com).';
  } else if (
    low.includes('x api:') ||
    low.includes('x_linked_article:') ||
    low.includes('tweet links to') ||
    low.includes('article could not be loaded') ||
    low.includes('bot/error page') ||
    low.includes('open graph has no usable')
  ) {
    if (xUrl && (/\b401\b/.test(low) || /\b403\b/.test(low))) {
      friendly =
        'X API trả 401/403 — Bearer token có thể hết hạn, bị thu hồi hoặc không đủ quyền đọc tweet. Tạo lại token trên https://developer.x.com và cập nhật X_BEARER_TOKEN.';
    } else if (xUrl && (low.includes('empty response') || low.includes('tweet missing'))) {
      friendly =
        'Tweet không tồn tại, đã xóa, tài khoản khóa, hoặc token không xem được — thử URL khác hoặc kiểm tra quyền app.';
    } else if (xUrl) {
      friendly =
        'Lỗi pipeline X: lookup tweet, tải article nối từ tweet, hoặc HTML trả về trang lỗi/bot của X (giống “Something went wrong” trên trình duyệt). Xem chi tiết dưới.';
    } else {
      friendly = 'Lỗi nguồn X/Twitter trong ingest — xem chi tiết dưới.';
    }
  } else if (low.includes('openai_api_key') || /\bopenai\b/.test(low)) {
    friendly = xUrl
      ? 'Cần OPENAI_API_KEY cho bước enrich note (Tóm tắt/Insight). Ingest link X không liên quan transcript YouTube.'
      : 'Cần OPENAI_API_KEY hợp lệ cho dịch transcript YouTube hoặc enrich note — kiểm tra `.env` Brain.';
  } else if (low.includes('capture path not detected') || low.includes('capture path missing')) {
    friendly =
      'Ingest có vẻ chạy xong nhưng không lấy được đường dẫn capture từ output — xem log CLI bên dưới.';
  } else if (low.includes('routing') && (low.includes('yaml') || low.includes('config'))) {
    friendly = 'Lỗi đọc cấu hình routing (`config/routing.yaml`) — kiểm tra file tồn tại và hợp lệ.';
  } else if (low.includes(' 401 ') || low.includes(' 403 ') || /\b401\b/.test(low) || /\b403\b/.test(low)) {
    friendly = 'Dịch vụ từ chối truy cập (401/403) — token, quyền hoặc giới hạn gọi API.';
  } else if (low.includes(' 404 ') || /\b404\b/.test(low)) {
    friendly = 'Không tìm thấy tài nguyên (404) — URL sai, đã gỡ hoặc không công khai.';
  } else if (low.includes('timeout') || low.includes('etimedout')) {
    friendly = 'Hết thời gian chờ — nguồn chậm, mạng không ổn định hoặc dịch vụ bận.';
  } else if (
    low.includes('econnrefused') ||
    low.includes('enotfound') ||
    low.includes('network') ||
    low.includes('fetch failed')
  ) {
    friendly = 'Lỗi mạng khi tải URL — kiểm tra Internet, VPN hoặc URL.';
  } else if (low.includes('ingest failed') || low.includes('ingest exited') || low.includes('exit code')) {
    friendly = 'Lệnh ingest trong CLI dừng với lỗi — đọc phần stderr/log ngắn bên dưới.';
  }
  if (
    xUrl &&
    friendly.startsWith('Không ingest được.') &&
    !friendly.includes('X') &&
    !friendly.includes('Twitter')
  ) {
    friendly =
      'Không ingest được link X — thường do X_BEARER_TOKEN, tweet không tồn tại/khóa, hoặc giới hạn API. Xem chi tiết bên dưới.';
  }
  const detail = s.length > 1400 ? `${s.slice(0, 1400)}…` : s;
  return { friendly, detail };
}

function navKey(view: string): string {
  if (view === 'capture') return 'captures';
  if (view === 'digest') return 'digests';
  return view;
}

function updateNavActive(view: string) {
  const key = navKey(view);
  document.querySelectorAll('.nav-dot').forEach((btn) => {
    const r = (btn as HTMLElement).dataset.route;
    btn.classList.toggle('active', r === key);
  });
  document.querySelectorAll('.drawer-link').forEach((btn) => {
    const r = (btn as HTMLElement).dataset.route;
    btn.classList.toggle('active', r === key);
  });
}

function closeMobileNav() {
  document.getElementById('nav-drawer')?.classList.remove('is-open');
  document.getElementById('nav-drawer-backdrop')?.classList.remove('is-open');
  document.getElementById('menu-toggle')?.setAttribute('aria-expanded', 'false');
}

function openMobileNav() {
  document.getElementById('nav-drawer')?.classList.add('is-open');
  document.getElementById('nav-drawer-backdrop')?.classList.add('is-open');
  document.getElementById('menu-toggle')?.setAttribute('aria-expanded', 'true');
}

function bindMobileNav() {
  const drawer = document.getElementById('nav-drawer');
  const backdrop = document.getElementById('nav-drawer-backdrop');
  const toggle = document.getElementById('menu-toggle');
  toggle?.addEventListener('click', () => {
    if (drawer?.classList.contains('is-open')) closeMobileNav();
    else openMobileNav();
  });
  backdrop?.addEventListener('click', closeMobileNav);
  document.getElementById('drawer-close')?.addEventListener('click', closeMobileNav);
  document.querySelectorAll('.drawer-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = (btn as HTMLElement).dataset.route;
      if (r === 'home') setHash('home');
      if (r === 'captures') setHash('captures');
      if (r === 'digests') setHash('digests');
      closeMobileNav();
    });
  });
}

function sideHome(h: Health, shownOnHome: number, vaultTotal: number): string {
  return `
    <div>
      <div class="ingest-label" style="margin-bottom:0.5rem">Digest &amp; vault</div>
      <p style="margin:0;color:var(--muted);font-size:12px;line-height:1.5">Cùng thư mục với Obsidian · <code style="color:var(--signal)">READER_VAULT_ROOT</code></p>
    </div>
    <div class="digest-block">
      <h4>Trạng thái</h4>
      <ul>
        <li><strong>Vault</strong> — đường dẫn tuyệt đối trong status strip</li>
        <li>Ingest web ${h.ingestAvailable ? '<strong>bật</strong> (CLI Brain)' : '<strong>tắt</strong> hoặc thiếu repo'}</li>
        <li>Trang chủ: <strong>${shownOnHome}</strong> thẻ gần đây · <strong>${vaultTotal}</strong> captures trong vault</li>
      </ul>
    </div>
    <div class="digest-block">
      <h4>Link nhanh</h4>
      <p style="margin:0;font-size:12px;color:var(--muted);line-height:1.6">
        → <code style="color:var(--signal)">Captures/…</code> trong vault<br />
        → <code style="color:var(--signal)">Digests/YYYY-Www</code>
      </p>
    </div>
  `;
}

function sideCaptures(rows: CaptureListItem[]): string {
  const n = rows.length;
  const yt = rows.filter((r) => r.youtube_video_id).length;
  return `
    <div class="ingest-label" style="margin-bottom:0.5rem">Tổng quan</div>
    <div class="stat-block">
      <div class="stat"><b>${n}</b><span>Captures</span></div>
      <div class="stat"><b>${yt}</b><span>YouTube</span></div>
    </div>
    <div class="digest-block">
      <h4>Gợi ý</h4>
      <ul>
        <li>Mở note trong Obsidian, refresh reader để xem thay đổi</li>
      </ul>
    </div>
  `;
}

function sideCapture(d: CaptureDetail): string {
  return `
    <div class="ingest-label" style="margin-bottom:0.5rem">Capture</div>
    <div class="digest-block">
      <h4>${esc(d.id)}</h4>
      <p style="margin:0;font-size:12px;color:var(--muted);line-height:1.55">Folder trong <code style="color:var(--signal)">Captures/</code> — chỉnh <code style="color:var(--signal)">note.md</code> trong Obsidian.</p>
    </div>
  `;
}

function sideDigests(items: { week: string }[], digestAvailable: boolean): string {
  const uiHint = digestAvailable
    ? 'Nút <strong>Tạo digest</strong> trên thanh công cụ chạy cùng CLI trong repo Brain (<code style="color:var(--signal)">--since 7d</code> mặc định).'
    : 'Bật ingest (Brain CLI + <code style="color:var(--signal)">READER_ALLOW_INGEST</code>) hoặc chạy terminal: <code style="color:var(--signal)">pnpm digest</code>.';
  return `
    <div class="ingest-label" style="margin-bottom:0.5rem">Lịch digest</div>
    <div class="digest-block">
      <h4>Tạo digest</h4>
      <p style="margin:0;font-size:12px;color:var(--muted);line-height:1.55">${uiHint}</p>
    </div>
    <div class="digest-block">
      <h4>Đang có</h4>
      <p style="margin:0;font-size:12px;color:var(--muted)">${items.length} file · click thẻ để đọc</p>
    </div>
  `;
}

function sideDigestDetail(week: string, hasChallenge: boolean): string {
  const challengeHint = hasChallenge
    ? `Đã tải <code style="color:var(--signal)">Challenges/${esc(week)}.md</code> — kéo xuống dưới digest.`
    : `Chưa có file challenge — chạy <code style="color:var(--signal)">pnpm challenge --week ${esc(week)}</code> rồi refresh.`;
  return `
    <div class="ingest-label" style="margin-bottom:0.5rem">Tuần</div>
    <div class="stat-block">
      <div class="stat" style="grid-column:1/-1"><b style="font-size:1.1rem">${esc(week)}</b><span>Digests/${esc(week)}.md</span></div>
    </div>
    <div class="digest-block">
      <h4>Challenge</h4>
      <p style="margin:0;font-size:12px;color:var(--muted);line-height:1.55">${challengeHint}</p>
    </div>
  `;
}

/* ── Skeleton placeholders ──────────────────────────────── */

function skeletonCardsHtml(count: number): string {
  return Array.from({ length: count }, () => `
    <div class="skeleton-card">
      <div class="skeleton skeleton-card__line skeleton-card__line--meta"></div>
      <div class="skeleton skeleton-card__line skeleton-card__line--title"></div>
      <div class="skeleton skeleton-card__line skeleton-card__line--url"></div>
      <div class="skeleton skeleton-card__line skeleton-card__line--tag"></div>
    </div>`).join('');
}

function skeletonTableRowsHtml(count: number): string {
  return Array.from({ length: count }, () => `
    <tr class="skeleton-row">
      <td><div class="skeleton skeleton-row__bar skeleton-row__bar--title"></div></td>
      <td><div class="skeleton skeleton-row__bar skeleton-row__bar--source"></div></td>
      <td><div class="skeleton skeleton-row__bar skeleton-row__bar--rating"></div></td>
      <td></td>
    </tr>`).join('');
}

function skeletonProseHtml(): string {
  return `
    <div class="skeleton-prose">
      <div class="skeleton skeleton-prose__title"></div>
      <div class="skeleton skeleton-prose__line"></div>
      <div class="skeleton skeleton-prose__line"></div>
      <div class="skeleton skeleton-prose__line"></div>
      <div class="skeleton skeleton-prose__line"></div>
      <div class="skeleton skeleton-prose__line"></div>
    </div>`;
}

/** Max recent capture cards on home (grid shows up to 3×3 on wide desktop). */
const HOME_RECENT_CAPTURE_LIMIT = 9;

const CAPTURE_FOLDER_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD--stem--hash` → `stem`; otherwise returns `id`. */
function friendlySlugFromCaptureId(id: string): string {
  const parts = id.split('--');
  if (parts.length < 3) return id;
  if (!CAPTURE_FOLDER_DATE.test(parts[0]!)) return id;
  const hash = parts[parts.length - 1]!;
  const stem = parts.slice(1, -1).join('--');
  if (!stem || !/^[a-f0-9]{4,12}$/i.test(hash)) return id;
  return stem;
}

function captureSourceLabel(r: CaptureListItem): string {
  const u = r.url?.trim();
  if (u) {
    try {
      const host = new URL(u).hostname.replace(/^www\./i, '');
      if (host) return host;
    } catch {
      /* invalid URL */
    }
  }
  return r.source || '—';
}

/** Primary line in library table: note heading when distinct from folder id, else short slug. */
function captureTablePrimaryLine(r: CaptureListItem): string {
  if (r.title && r.title !== r.id) return r.title;
  return friendlySlugFromCaptureId(r.id);
}

/** Thư viện: sao rút gọn + một chữ số thập phân (spec format B). */
function formatLibraryRatingCell(r: CaptureListItem): string {
  if (r.reaction_avg == null || r.reaction_count === 0) {
    return '<span class="capture-rating capture-rating--empty">—</span>';
  }
  const avg = r.reaction_avg;
  const b = Math.min(5, Math.max(1, Math.round(avg)));
  const stars = ratingStarsOnly(b);
  const num = avg.toFixed(1);
  const label = `Đánh giá trung bình ${num} trên 5, ${r.reaction_count} lượt`;
  return `<span class="capture-rating" aria-label="${escAttr(label)}">${stars} ${num}</span>`;
}

function renderHome(h: Health, recent: CaptureListItem[], vaultCaptureTotal: number): string {
  const ingestShellClass = h.ingestAvailable ? 'ingest-shell' : 'ingest-shell ingest-shell-muted';
  const ingestInner = h.ingestAvailable
    ? `
    <div class="ingest-inner">
      <div class="ingest-inner__row">
        <div class="ingest-input-wrap">
          <input type="url" id="ingest-url" placeholder="https://www.youtube.com/watch?v=… hoặc https://x.com/…/status/…" autocomplete="url" />
        </div>
        <button type="button" class="btn-ingest" id="ingest-run">Chạy ingest</button>
      </div>
      <div
        class="ingest-agent-status"
        id="ingest-status"
        hidden
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <div class="ingest-agent-status__head">
          <span class="ingest-agent-status__badge" aria-hidden="true">Agent</span>
          <div class="ingest-agent-status__head-text">
            <p class="ingest-agent-status__msg" id="ingest-status-msg"></p>
            <div class="ingest-agent-status__scan" aria-hidden="true"></div>
          </div>
        </div>
        <ol class="ingest-agent-status__steps" id="ingest-status-steps" aria-label="Tiến trình ingest">
          <li class="ingest-agent-step" data-step="fetch">
            <span class="ingest-agent-step__rail" aria-hidden="true"></span>
            <span class="ingest-agent-step__dot" aria-hidden="true"></span>
            <span class="ingest-agent-step__body">
              <span class="ingest-agent-step__label">Fetch &amp; chuẩn hoá</span>
              <span class="ingest-agent-step__hint">Adapter · routing</span>
            </span>
          </li>
          <li class="ingest-agent-step" data-step="vault">
            <span class="ingest-agent-step__rail" aria-hidden="true"></span>
            <span class="ingest-agent-step__dot" aria-hidden="true"></span>
            <span class="ingest-agent-step__body">
              <span class="ingest-agent-step__label">Ghi vault</span>
              <span class="ingest-agent-step__hint">Captures/… · assets</span>
            </span>
          </li>
          <li class="ingest-agent-step ingest-agent-step--yt-only" data-step="translate">
            <span class="ingest-agent-step__rail" aria-hidden="true"></span>
            <span class="ingest-agent-step__dot" aria-hidden="true"></span>
            <span class="ingest-agent-step__body">
              <span class="ingest-agent-step__label">Dịch transcript</span>
              <span class="ingest-agent-step__hint">YouTube · EN → VI (batch)</span>
            </span>
          </li>
          <li class="ingest-agent-step" data-step="llm">
            <span class="ingest-agent-step__rail" aria-hidden="true"></span>
            <span class="ingest-agent-step__dot" aria-hidden="true"></span>
            <span class="ingest-agent-step__body">
              <span class="ingest-agent-step__label">Enrich note</span>
              <span class="ingest-agent-step__hint">Tóm tắt · insight (LLM)</span>
            </span>
          </li>
        </ol>
        <div class="ingest-agent-status__footer" id="ingest-status-footer"></div>
      </div>
    </div>`
    : `<div class="ingest-inner">
      <p class="hint" style="margin:0">Không khả dụng: <code>READER_BRAIN_ROOT</code> hoặc <code>READER_ALLOW_INGEST=0</code>. Dùng <code>pnpm ingest</code> trong terminal.</p>
    </div>`;

  const cards =
    recent.length === 0
      ? '<p class="hint">Chưa có capture — nhập URL phía trên hoặc ingest từ CLI.</p>'
      : recent
          .map((r) => {
            const sourceType = r.youtube_video_id
              ? 'youtube'
              : r.url && isLikelyXOrTwitterUrl(r.url)
                ? 'x'
                : 'article';
            return `
        <button type="button" class="card" data-card-id="${esc(r.id)}" data-source-type="${sourceType}">
          <div class="card-meta">
            <span>${esc(r.source)}<span class="card-source-dot" aria-hidden="true"></span></span>
            <span>${esc(r.fetch_method || '—')}</span>
          </div>
          <h3>${esc(r.title)}</h3>
          <p>${esc(r.url ? r.url.slice(0, 96) + (r.url.length > 96 ? '…' : '') : r.id)}</p>
          ${
            r.youtube_video_id
              ? '<div class="tag-row"><span class="tag">youtube</span></div>'
              : ''
          }
        </button>`;
          })
          .join('');

  const n = recent.length;
  const total = vaultCaptureTotal;
  const totalSuffix =
    total > n
      ? `<span class="section-title__total" aria-hidden="true"> / ${String(total).padStart(2, '0')} trong vault</span><span class="visually-hidden"> trên ${total} captures trong vault</span>`
      : '';
  return `
    <header class="masthead">
      ${themeSwitcherHtml()}
      <h1><span>Bộ nhớ</span><br /><em>thứ hai.</em></h1>
      <div class="status-strip">
        <div class="pulse${h.ingestAvailable ? '' : ' warn'}">${h.ingestAvailable ? 'Vault · ingest sẵn sàng' : 'Ingest · kiểm tra CLI'}</div>
        <div>Obsidian · local reader</div>
        <div style="margin-top:0.35rem"><span style="color:var(--warn)">vault</span> · ${esc(h.vaultRoot)}</div>
      </div>
    </header>
    <div class="view view-ingest active">
      <section class="ingest-zone" aria-label="Nhập URL">
        <div class="ingest-label">Luồng ingest</div>
        <div class="${ingestShellClass}">${ingestInner}</div>
      </section>
      <div class="sources" aria-label="Nguồn đã cấu hình">
        <span class="chip on">X API</span>
        <span class="chip on">Apify</span>
        <span class="chip on">Readability</span>
        <span class="chip on">YouTube</span>
      </div>
      <div class="recent-captures-bar">
        <div class="recent-captures-bar__titles">
          <h2 class="section-title section-title--home-recent" id="recent-captures-heading">
            Captures gần đây
            <span class="section-title__num">${String(n).padStart(2, '0')}</span>${totalSuffix}
          </h2>
          <p class="recent-captures-bar__sub">Tối đa ${HOME_RECENT_CAPTURE_LIMIT} mới nhất · màn rộng lưới 3 cột</p>
        </div>
        <a href="#/captures" class="recent-captures-cta">Toàn bộ thư viện<span class="recent-captures-cta__arrow" aria-hidden="true"> →</span></a>
      </div>
      <div class="cards" role="region" aria-labelledby="recent-captures-heading">${cards}</div>
      <p class="hint home-captures-hint">Click thẻ để mở chi tiết · rail <em>Captures</em> hoặc nút thư viện phía trên.</p>
    </div>
  `;
}

function renderCapturesTable(rows: CaptureListItem[]): string {
  const body = rows
    .map(
      (r) => `
    <tr class="capture-row" tabindex="0" data-id="${esc(r.id)}" data-slug="${esc(friendlySlugFromCaptureId(r.id))}">
      <td class="capture-title-cell" title="${esc(r.id)}">
        <div class="capture-title">${esc(captureTablePrimaryLine(r))}</div>
      </td>
      <td class="capture-source-cell">${esc(captureSourceLabel(r))}</td>
      <td class="capture-rating-cell">${formatLibraryRatingCell(r)}</td>
      <td class="capture-action-cell"><span class="mock-table-open" aria-hidden="true">${LIB_OPEN_CHEVRON_SVG}</span></td>
    </tr>`,
    )
    .join('');
  return `
    <header class="masthead">
      ${themeSwitcherHtml()}
      <h1>Thư viện<br /><em>captures.</em></h1>
      <div class="status-strip">
        <div class="pulse">${rows.length} mục trong vault</div>
        <div>Click hàng để chi tiết</div>
      </div>
    </header>
    <div class="view active">
      <div class="toolbar">
        <div class="search-wrap">
          <input type="search" id="lib-search" placeholder="Tìm theo tiêu đề, slug, URL, nguồn…" aria-label="Tìm captures" />
        </div>
        <button type="button" class="btn-ghost" id="back-home">← Ingest</button>
      </div>
      ${
        rows.length === 0
          ? '<p class="hint">Chưa có capture.</p>'
          : `<div class="mock-table-wrap"><table class="mock-table"><thead><tr>
            <th scope="col">Tiêu đề</th><th scope="col">Nguồn</th><th scope="col">Đánh giá</th><th scope="col" class="capture-action-th"><span class="visually-hidden">Mở</span></th>
          </tr></thead><tbody id="lib-tbody">${body}</tbody></table></div>`
      }
      <p class="hint lib-toolbar-hint">Lọc theo ô tìm kiếm · hàng có thể mở bằng Enter khi focus.</p>
    </div>
  `;
}

function bindLibrarySearch() {
  const input = document.querySelector<HTMLInputElement>('#lib-search');
  const tbody = document.getElementById('lib-tbody');
  if (!input || !tbody) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    tbody.querySelectorAll('tr').forEach((tr) => {
      const el = tr as HTMLElement;
      const t = tr.textContent?.toLowerCase() ?? '';
      const slug = el.dataset.slug?.toLowerCase() ?? '';
      const id = el.dataset.id?.toLowerCase() ?? '';
      el.style.display = !q || t.includes(q) || slug.includes(q) || id.includes(q) ? '' : 'none';
    });
  });
}

function renderSubRows(lines: MergedTranscriptLine[]): string {
  return lines
    .map(
      (L, i) => `
    <button type="button" class="yt-sub-row" role="listitem" data-start="${L.startSec}" data-i="${i}">
      <span class="yt-sub-ts">${esc(L.stamp)}</span>
      <span class="yt-sub-lines">
        <span class="yt-sub-line yt-sub-en">${esc(L.en || '—')}</span>
        <span class="yt-sub-line yt-sub-vi">${esc(L.vi || '—')}</span>
      </span>
    </button>`,
    )
    .join('');
}

/**
 * Scroll only `#yt-sub-list` (never the page): keep the active row in a comfortable reading position.
 * — Start: scrollTop stays 0 until centering would need to scroll up (row climbs from top toward middle).
 * — Middle: vertical center of the row ≈ vertical center of the list viewport.
 * — End: `ideal` hits maxScroll; the row naturally sits lower toward the bottom (no empty padding below).
 */
function scrollSubRowToReadingPosition(list: HTMLElement, row: HTMLElement) {
  if (row.hidden || row.offsetParent === null) return;
  const listRect = list.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  if (rowRect.height <= 0) return;
  const maxScroll = list.scrollHeight - list.clientHeight;
  if (maxScroll <= 0) return;

  const rowTopInContent = list.scrollTop + (rowRect.top - listRect.top);
  const rowCenterInContent = rowTopInContent + rowRect.height / 2;
  const ideal = rowCenterInContent - list.clientHeight / 2;
  list.scrollTop = Math.max(0, Math.min(ideal, maxScroll));
}

/**
 * Segmented transcript UI: YT IFrame API player, click row / milestone to seek, live highlight.
 * Returns cleanup (interval + player.destroy).
 */
function bindYoutubeSubPanel(
  videoId: string,
  lines: MergedTranscriptLine[],
  mainEl: HTMLElement,
): () => void {
  const panel = mainEl.querySelector<HTMLElement>('#yt-sub-panel');
  const list = mainEl.querySelector<HTMLElement>('#yt-sub-list');
  const search = mainEl.querySelector<HTMLInputElement>('#yt-sub-search');

  let pollId = 0;
  let playerReady = false;
  let player: YtPlayerApi | null = null;
  let pendingSeek: number | null = null;
  let lastIdx = -1;

  const seek = (t: number) => {
    if (playerReady && player) {
      player.seekTo(Math.floor(t), true);
      player.playVideo();
    } else {
      pendingSeek = t;
    }
  };

  const syncHighlight = () => {
    if (!playerReady || !player || !list) return;
    const idx = findActiveSegmentIndex(lines, player.getCurrentTime());
    if (idx === lastIdx) return;
    lastIdx = idx;
    list.querySelectorAll('.yt-sub-row').forEach((row, i) => {
      row.classList.toggle('is-current', i === idx);
    });
    const currentRow = list.querySelector<HTMLElement>(`.yt-sub-row[data-i="${idx}"]`);
    if (currentRow) scrollSubRowToReadingPosition(list, currentRow);
  };

  mainEl.querySelectorAll('.yt-tick').forEach((el) => {
    el.addEventListener('click', () => seek(Number((el as HTMLElement).dataset.t)));
  });
  mainEl.querySelectorAll('.yt-ms button').forEach((el) => {
    el.addEventListener('click', () => seek(Number((el as HTMLElement).dataset.seek)));
  });

  list?.querySelectorAll('.yt-sub-row').forEach((row) => {
    row.addEventListener('click', () => {
      seek(Number((row as HTMLElement).dataset.start));
      if (list) scrollSubRowToReadingPosition(list, row as HTMLElement);
    });
  });

  panel?.querySelectorAll('.yt-sub-mode').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset.subMode;
      if (!mode || !panel) return;
      panel.dataset.mode = mode;
      panel.querySelectorAll('.yt-sub-mode').forEach((b) =>
        b.classList.toggle('active', (b as HTMLElement).dataset.subMode === mode),
      );
    });
  });

  search?.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    list?.querySelectorAll('.yt-sub-row').forEach((row) => {
      const text = row.textContent?.toLowerCase() ?? '';
      (row as HTMLElement).hidden = Boolean(q && !text.includes(q));
    });
  });

  void loadYoutubeIframeApi().then(() => {
    const YT = (window as unknown as { YT: { Player: new (id: string, opts: object) => unknown } }).YT;
    if (!YT?.Player) return;
    new YT.Player('yt-player-root', {
      videoId,
      playerVars: { enablejsapi: 1, modestbranding: 1, rel: 0 },
      events: {
        onReady: (ev: { target: YtPlayerApi }) => {
          player = ev.target;
          playerReady = true;
          if (pendingSeek != null) {
            player.seekTo(Math.floor(pendingSeek), true);
            player.playVideo();
            pendingSeek = null;
          }
          pollId = window.setInterval(syncHighlight, 280);
        },
      },
    });
  });

  return () => {
    window.clearInterval(pollId);
    playerReady = false;
    lastIdx = -1;
    try {
      player?.destroy();
    } catch {
      /* YouTube API may throw if iframe already gone */
    }
    player = null;
  };
}

function reactionStarDisplay(rating: number): string {
  return `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`;
}

function formatReactionTime(at: string): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return at;
  return new Date(t).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
}

function renderReactionsTimelineHtml(entries: ReactionEntry[]): string {
  if (entries.length === 0) {
    return '<p class="hint cap-reactions-empty">Chưa có phản hồi.</p>';
  }
  const items = entries
    .map((e) => {
      const stars = reactionStarDisplay(e.rating);
      const textBlock = e.text
        ? `<p class="cap-reactions-item__text">${esc(e.text)}</p>`
        : '';
      return `<li class="cap-reactions-item">
  <div class="cap-reactions-item__head">
    <time class="cap-reactions-item__time" datetime="${escAttr(e.at)}">${esc(formatReactionTime(e.at))}</time>
    <span class="cap-reactions-item__stars" title="${e.rating}/5" aria-label="${e.rating} trên 5 sao">${stars}</span>
  </div>
  ${textBlock}
</li>`;
    })
    .join('');
  return `<ul class="cap-reactions-list">${items}</ul>`;
}

async function bindCaptureReactions(captureId: string): Promise<void> {
  const timeline = document.querySelector<HTMLElement>('#cap-reactions-timeline');
  const errEl = document.querySelector<HTMLElement>('#cap-reactions-err');
  const submit = document.querySelector<HTMLButtonElement>('#cap-reactions-submit');
  const ta = document.querySelector<HTMLTextAreaElement>('#cap-reactions-note');
  const starBtns = document.querySelectorAll<HTMLButtonElement>('.cap-reactions-star');
  if (!timeline || !submit || !ta) return;

  let selected: number | null = null;

  const setErr = (msg: string) => {
    if (!errEl) return;
    if (!msg) {
      errEl.hidden = true;
      errEl.textContent = '';
    } else {
      errEl.hidden = false;
      errEl.textContent = msg;
    }
  };

  const syncStarUi = () => {
    starBtns.forEach((b) => {
      const n = Number(b.dataset.star);
      const on = selected !== null && n <= selected;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    submit.disabled = selected === null;
  };

  starBtns.forEach((b) => {
    b.addEventListener('click', () => {
      selected = Number(b.dataset.star);
      syncStarUi();
      setErr('');
    });
  });

  const load = async () => {
    try {
      const { entries } = await fetchJson<{ entries: ReactionEntry[] }>(
        `/api/captures/${encodeURIComponent(captureId)}/reactions`,
      );
      const sorted = [...entries].sort((a, b) => {
        const ta = Date.parse(a.at);
        const tb = Date.parse(b.at);
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
      });
      timeline.innerHTML = renderReactionsTimelineHtml(sorted);
    } catch (e) {
      timeline.innerHTML = `<p class="err cap-reactions-load-err">${esc(e instanceof Error ? e.message : String(e))}</p>`;
    }
  };

  submit.addEventListener('click', async () => {
    if (selected === null) {
      setErr('Chọn số sao trước khi gửi.');
      return;
    }
    setErr('');
    submit.disabled = true;
    const body: { rating: number; comment?: string } = { rating: selected };
    const c = ta.value.trim();
    if (c) body.comment = c;
    try {
      const r = await fetch(`/api/captures/${encodeURIComponent(captureId)}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok) {
        setErr(typeof j.error === 'string' ? j.error : `${r.status}`);
        submit.disabled = selected === null;
        syncStarUi();
        return;
      }
      ta.value = '';
      selected = null;
      syncStarUi();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      submit.disabled = selected === null;
      syncStarUi();
    }
  });

  syncStarUi();
  await load();
}

function renderCaptureDetail(d: CaptureDetail): string {
  const yt = d.youtubeVideoId;
  const maxT =
    d.milestones && d.milestones.length > 0
      ? Math.max(...d.milestones.map((m) => m.t), 1)
      : 1;
  const ticks =
    d.milestones
      ?.map((m) => {
        const left = `${(m.t / maxT) * 100}%`;
        const hl = m.kind === 'highlight' ? ' hl' : '';
        return `<div class="yt-tick${hl}" style="left:${left}" data-t="${m.t}" title="${esc(m.label)}"></div>`;
      })
      .join('') ?? '';
  const msBtns =
    d.milestones
      ?.map((m) => {
        const mm = Math.floor(m.t / 60);
        const ss = String(m.t % 60).padStart(2, '0');
        return `<button type="button" data-seek="${m.t}">${mm}:${ss} — ${esc(m.label)}</button>`;
      })
      .join('') ?? '';

  const subLines = yt ? mergeTranscriptsForUi(d.transcriptEn ?? '', d.transcriptVi ?? '') : [];
  const useSubPanel = Boolean(yt && subLines.length > 0);

  const ytMilestonesBlock =
    d.milestones?.length
      ? `
      <span class="ingest-label">Mốc · click để tua</span>
      <div class="yt-track" id="yt-track">${ticks}</div>
      <div class="yt-ms" id="yt-ms">${msBtns}</div>`
      : '';

  const ytHint = useSubPanel
    ? 'Click dòng phụ đề hoặc mốc để tua. Dòng đang phát được làm nổi bật.'
    : 'Seek: <code>?start=</code> trên embed YouTube.';

  const ytVideoBlock = useSubPanel
    ? `<div id="yt-player-root" class="yt-player-root" title="YouTube"></div>`
    : `<iframe id="yt-iframe" title="YouTube" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" src="https://www.youtube.com/embed/${esc(yt!)}?enablejsapi=1"></iframe>`;

  /** Collapsible markdown transcript: full-width row below the split (same width as #cap-note), not inside the video column. */
  const ytSubRawUnderVideo = useSubPanel
    ? `
      <details class="yt-sub-raw source-details" id="yt-sub-raw">
        <summary class="source-details-summary yt-sub-raw-summary">Transcript gốc (markdown)</summary>
        <div class="yt-sub-raw-grid">
          <div><span class="tr-col-label">English</span><pre class="transcript-pre">${esc(d.transcriptEn || '(Không có)')}</pre></div>
          <div><span class="tr-col-label">Tiếng Việt (LLM)</span><pre class="transcript-pre">${esc(d.transcriptVi || '(Không có)')}</pre></div>
        </div>
      </details>`
    : '';

  const ytTranscriptBlock = useSubPanel
    ? `
      <div class="yt-sub-panel" id="yt-sub-panel" data-mode="bilingual">
        <div class="yt-sub-list" id="yt-sub-list" role="list">${renderSubRows(subLines)}</div>
        <div class="yt-sub-toolbar">
          <label class="yt-sub-search-wrap">
            <span class="visually-hidden">Tìm trong phụ đề</span>
            <input type="search" id="yt-sub-search" class="yt-sub-search" placeholder="Tìm trong phụ đề…" autocomplete="off" />
          </label>
          <div class="yt-sub-modes" role="group" aria-label="Chế độ hiển thị">
            <button type="button" class="yt-sub-mode active" data-sub-mode="bilingual">Song ngữ</button>
            <button type="button" class="yt-sub-mode" data-sub-mode="en">EN</button>
            <button type="button" class="yt-sub-mode" data-sub-mode="vi">VI</button>
          </div>
        </div>
      </div>`
    : `
      <div class="transcript-tabs" role="tablist" aria-label="Ngôn ngữ transcript">
        <button type="button" class="tr-tab active" data-tab="en">English</button>
        <button type="button" class="tr-tab" data-tab="vi">Tiếng Việt</button>
        <button type="button" class="tr-tab" data-tab="both">Song song</button>
      </div>
      <div class="tr-pane active" data-pane="en">
        <pre class="transcript-pre">${esc(d.transcriptEn || '(Không có)')}</pre>
      </div>
      <div class="tr-pane" data-pane="vi">
        <pre class="transcript-pre">${esc(d.transcriptVi || '(Không có)')}</pre>
      </div>
      <div class="tr-pane tr-split" data-pane="both">
        <div><span class="tr-col-label">EN</span><pre class="transcript-pre">${esc(d.transcriptEn || '—')}</pre></div>
        <div><span class="tr-col-label">VI (LLM)</span><pre class="transcript-pre">${esc(d.transcriptVi || '—')}</pre></div>
      </div>`;

  const tagList = parseTagList(d.noteFm.tags);
  const fmEntries = Object.entries(d.noteFm).filter(([k]) => !FM_SKIP_IN_GRID.has(k));
  const fmNoteInner = fmEntries
    .map(
      ([k, v]) => `
      <div class="fm-row">
        <dt class="fm-grid__key">${esc(k)}</dt>
        <dd class="fm-grid__value">${formatFmCellValue(k, v, tagList)}</dd>
      </div>`,
    )
    .join('');
  const fmNote =
    fmEntries.length > 0
      ? fmNoteInner
      : `<div class="fm-row fm-row--empty"><dt class="fm-grid__key">—</dt><dd class="fm-grid__value"><span class="fm-value-empty">(empty)</span></dd></div>`;

  const fetchMethod = String(d.noteFm.fetch_method ?? d.sourceFm.fetch_method ?? '')
    .trim();
  const fetchDisplay = fetchMethod || '—';
  const fetchTitle =
    'Chiến lược ingest (fetch_method). Capture cũ có thể chỉ khai báo trong source.md — đã gộp từ note + source.';

  const title = d.noteBody.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? d.id;
  const ingestedRaw = String(d.noteFm.ingested_at ?? d.sourceFm.ingested_at ?? '').trim();
  const rawUrl = String(d.noteFm.url ?? '').trim();
  const href = rawUrl ? safeExternalHref(rawUrl) : null;
  const sourceKind = String(d.noteFm.source ?? d.sourceFm.source ?? '').trim();

  const metaParts: string[] = [];
  if (ingestedRaw) {
    metaParts.push(
      `<time class="detail-meta-time" datetime="${escAttr(ingestedRaw)}">${esc(formatIngestedVi(ingestedRaw))}</time>`,
    );
  }
  if (sourceKind) {
    metaParts.push(`<span class="mono-sm" title="source (frontmatter)">${esc(sourceKind)}</span>`);
  }
  metaParts.push(
    `<span class="mono-sm" title="${esc(fetchTitle)}">${esc(fetchDisplay)}</span>`,
  );
  if (href) {
    metaParts.push(
      `<a href="${escAttr(href)}" target="_blank" rel="noopener noreferrer" class="detail-meta-link">Mở nguồn ↗</a>`,
    );
  }
  const metaLine = metaParts.join('<span class="detail-meta-sep" aria-hidden="true">·</span>');

  const vaultPath = `${d.vaultRoot.replace(/\/+$/, '')}/Captures/${d.id}`;
  const bc = captureBreadcrumbLabel(d.id);

  const tocLinks = [
    `<a href="#cap-frontmatter">Frontmatter</a>`,
    ...(yt ? [`<a href="#cap-youtube">Video</a>`] : []),
    `<a href="#cap-note">Ghi chú</a>`,
    `<a href="#cap-source">Source</a>`,
    `<a href="#cap-reactions">Phản hồi</a>`,
  ].join('');

  const starBtns = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<button type="button" class="cap-reactions-star" data-star="${n}" aria-label="${n} sao" aria-pressed="false">★</button>`,
    )
    .join('');

  const sourceExcerpt = d.sourceBody;
  const sourceTooLong = sourceExcerpt.length > 12000;

  return `
    <div class="toolbar detail-toolbar">
      <button type="button" class="btn-ghost" id="cap-back">← Thư viện</button>
      <span class="detail-breadcrumb" title="${escAttr(d.id)}">Captures / ${esc(bc)}</span>
      <button type="button" class="btn-ghost btn-tiny" id="cap-copy-path" data-path="${escAttr(vaultPath)}">Copy path</button>
    </div>
    <div class="view active">
    <nav class="detail-toc" aria-label="Trên trang này">${tocLinks}</nav>
    <div class="detail-hero">
      <h2 id="cap-title">${esc(title)}</h2>
      <div class="detail-meta-line" aria-label="Tóm tắt metadata">${metaLine}</div>
    </div>
    <div class="section cap-anchor" id="cap-frontmatter">
      <h3>Frontmatter (note)</h3>
      <p class="hint fm-frontmatter-hint">Bảng dưới đây lấy từ YAML note. <code>ingested_at</code>, <code>url</code> và <code>fetch_method</code> đã gộp lên dòng meta phía trên; <code>tags</code> hiển thị dạng thẻ trong ô.</p>
      <dl class="fm-grid">${fmNote}</dl>
    </div>
    ${
      yt
        ? `
    <div class="section cap-anchor" id="cap-youtube">
      <h3>Video &amp; transcript</h3>
      <p class="hint" style="margin-top:0">${ytHint}</p>
      <div class="yt-split">
        <div class="yt-split__media">
          <div class="yt-iframe-wrap">
            ${ytVideoBlock}
          </div>
          ${ytMilestonesBlock}
        </div>
        <div class="yt-split__transcript">
          ${ytTranscriptBlock}
        </div>
        ${ytSubRawUnderVideo}
      </div>
    </div>`
        : ''
    }
    <div class="section cap-anchor" id="cap-note">
      <h3>note.md</h3>
      <div class="prose" id="note-prose"></div>
    </div>
    <div class="section cap-anchor" id="cap-source">
      <h3>source.md</h3>
      <details class="source-details">
        <summary class="source-details-summary">Đầy đủ · mặc định đóng${
          sourceTooLong ? ` · ${sourceExcerpt.length.toLocaleString('vi-VN')} ký tự` : ''
        }</summary>
        <pre class="transcript-pre source-details-pre">${esc(sourceExcerpt)}</pre>
      </details>
    </div>
    <div class="section cap-anchor" id="cap-reactions">
      <h3>Phản hồi</h3>
      <p class="hint cap-reactions-intro">Đánh giá 1–5 sao; ghi chú tùy chọn. Lưu timeline Markdown trong file <code>.comment</code> cùng thư mục capture (đọc được trong Obsidian).</p>
      <div class="cap-reactions-form" id="cap-reactions-form">
        <div class="cap-reactions-stars" role="group" aria-label="Chọn từ 1 đến 5 sao">${starBtns}</div>
        <label class="cap-reactions-label" for="cap-reactions-note">Ghi chú <span class="cap-reactions-optional">(tuỳ chọn)</span></label>
        <textarea id="cap-reactions-note" class="cap-reactions-textarea" rows="3" maxlength="8000" placeholder="Ấn tượng, điểm cần nhớ…"></textarea>
        <button type="button" class="btn-ingest cap-reactions-submit" id="cap-reactions-submit" disabled>Gửi</button>
        <p class="cap-reactions-err" id="cap-reactions-err" role="alert" hidden></p>
      </div>
      <div class="cap-reactions-timeline" id="cap-reactions-timeline" aria-live="polite">
        <p class="hint cap-reactions-loading">Đang tải phản hồi…</p>
      </div>
    </div>
    </div>
  `;
}

function renderDigestsList(
  items: { id: string; week: string }[],
  digestAvailable: boolean,
): string {
  const cards = items
    .map(
      (x) => `
    <button type="button" class="digest-card interactive" data-week="${esc(x.week)}">
      <div class="meta">${esc(x.week)}</div>
      <h3>Digest — ${esc(x.week)}</h3>
      <p>Markdown trong vault tại <code style="color:var(--signal)">Digests/${esc(x.week)}.md</code></p>
      <div class="tag-row" style="margin-top:1rem">
        <span class="tag">[[Digests/${esc(x.week)}]]</span>
      </div>
    </button>`,
    )
    .join('');
  const digestBtnAttrs = digestAvailable
    ? ''
    : ' disabled title="Cần Brain CLI và READER_ALLOW_INGEST (xem /api/health)"';
  return `
    <header class="masthead">
      ${themeSwitcherHtml()}
      <h1>Lịch sử<br /><em>digest.</em></h1>
      <div class="status-strip">
        <div class="pulse">${items.length} tuần</div>
        <div>Click thẻ để đọc</div>
      </div>
    </header>
    <div class="view active">
      <div class="toolbar digest-list-toolbar">
        <span class="ingest-label">Lịch sử digest</span>
        <div class="digest-list-toolbar__actions">
          <button type="button" class="btn-ingest" id="digest-run"${digestBtnAttrs}>Tạo digest</button>
          <button type="button" class="btn-ghost" id="back-home-d">← Ingest</button>
        </div>
      </div>
      <p class="hint lib-toolbar-hint" id="digest-run-hint" hidden></p>
      ${
        items.length === 0
          ? `<p class="hint" id="digest-empty-hint">Chưa có digest — bấm <strong>Tạo digest</strong> hoặc chạy <code>pnpm digest</code>.</p>`
          : `<div class="digest-timeline">${cards}</div>`
      }
      <p class="hint lib-toolbar-hint">Giống CLI: gom capture có <code>ingested_at</code> trong cửa sổ <code>--since</code> (mặc định 7d), ghi <code>Digests/YYYY-Www.md</code>.</p>
    </div>
  `;
}

function renderDigestDetail(week: string, markdown: string, challengeMarkdown?: string | null): string {
  const parsed = parseSimpleYamlFrontmatter(markdown);
  const bodyMd = stripDigestBodyLeadingH1(parsed?.body ?? markdown, week);
  const metaPanel = parsed?.front ? renderDigestMetaPanel(parsed.front) : '';
  const toc = renderDigestToc(bodyMd);
  const bodyHtml = markdownToProseHtml(transformDigestCapturesWikilinks(bodyMd), {
    h2IdPrefix: 'digest',
  });

  const ch = challengeMarkdown?.trim();
  const challengeBlock =
    ch && ch.length > 0
      ? `
      <section class="digest-challenge" aria-label="Reading challenge">
        <div class="digest-challenge__head">
          <span class="digest-challenge__badge" aria-hidden="true">Challenge</span>
          <h3 class="digest-challenge-title">${esc(week)}</h3>
          <p class="digest-challenge-path"><code>Challenges/${esc(week)}.md</code></p>
        </div>
        <div class="prose digest-prose digest-prose--challenge">${markdownToProseHtml(ch, { h2IdPrefix: 'challenge' })}</div>
      </section>`
      : '';
  return `
    <header class="masthead">
      ${themeSwitcherHtml()}
      <h1>Digest<br /><em>${esc(week)}</em></h1>
      <div class="status-strip">
        <div class="pulse">Chi tiết digest</div>
        <div class="status-strip-mono"><code style="color:var(--signal)">Digests/${esc(week)}.md</code></div>
      </div>
    </header>
    <div class="view active digest-view">
      <div class="toolbar detail-toolbar digest-toolbar">
        <button type="button" class="btn-ghost" id="dig-back">← Danh sách digest</button>
        <span class="ingest-label digest-toolbar__file">Digests/${esc(week)}.md</span>
      </div>
      <article class="digest-article" lang="vi">
        ${metaPanel ? `<div class="digest-detail-meta-band">${metaPanel}</div>` : ''}
        ${toc}
        <div class="digest-body">
          <div class="prose digest-prose digest-prose--main">${bodyHtml}</div>
        </div>
        ${challengeBlock}
      </article>
    </div>
  `;
}

function bindRail() {
  document.querySelectorAll('.nav-dot').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = (btn as HTMLElement).dataset.route;
      if (r === 'home') setHash('home');
      if (r === 'captures') setHash('captures');
      if (r === 'digests') setHash('digests');
    });
  });
}

async function route() {
  ytCaptureCleanup?.();
  ytCaptureCleanup = null;
  closeFilmstripImageLightbox();

  const main = document.querySelector<HTMLElement>('#main')!;
  const { view, id } = parseHash();
  updateNavActive(view);

  try {
    if (view === 'home') {
      main.innerHTML = `
        <header class="masthead"><h1><span>Bộ nhớ</span><br /><em>thứ hai.</em></h1></header>
        <div class="view active">
          <div class="cards">${skeletonCardsHtml(3)}</div>
        </div>`;
      const [h, capData] = await Promise.all([
        fetchJson<Health>('/api/health'),
        fetchJson<{ captures: CaptureListItem[] }>('/api/captures'),
      ]);
      const allCaps = capData.captures;
      const recent = allCaps.slice(0, HOME_RECENT_CAPTURE_LIMIT);
      main.innerHTML = renderHome(h, recent, allCaps.length);
      setSideInner(sideHome(h, recent.length, allCaps.length));

      main.querySelectorAll('.card[data-card-id]').forEach((el) => {
        el.addEventListener('click', () => {
          const cid = (el as HTMLElement).dataset.cardId;
          if (cid) setHash('capture', cid);
        });
      });

      const runBtn = main.querySelector<HTMLButtonElement>('#ingest-run');
      const urlIn = main.querySelector<HTMLInputElement>('#ingest-url');
      const st = main.querySelector<HTMLElement>('#ingest-status');
      const stMsg = main.querySelector<HTMLElement>('#ingest-status-msg');
      const stFoot = main.querySelector<HTMLElement>('#ingest-status-footer');
      if (runBtn && urlIn && st && stMsg && stFoot && h.ingestAvailable) {
        runBtn.addEventListener('click', async () => {
          const url = urlIn.value.trim();
          if (!url) {
            st.hidden = false;
            st.className =
              'ingest-agent-status ingest-agent-status--compact ingest-agent-status--err';
            stMsg.textContent = 'Nhập URL.';
            stFoot.textContent = '';
            stFoot.style.whiteSpace = '';
            return;
          }
          const yt = isLikelyYoutubeUrl(url);
          const useSse = Boolean(h.ingestSse);
          let stopTicker = () => {};
          st.className = [
            'ingest-agent-status',
            'ingest-agent-status--running',
            yt ? '' : 'ingest-agent-status--no-yt',
          ]
            .filter(Boolean)
            .join(' ');
          st.hidden = false;
          stMsg.textContent = 'Đang chạy pipeline ingest';
          stFoot.innerHTML = '';
          stFoot.style.whiteSpace = '';
          ingestAgentResetSteps(st);
          if (!useSse) {
            stopTicker = startIngestAgentStepTicker(st);
          }
          runBtn.disabled = true;
          runBtn.classList.add('processing');
          try {
            const out = useSse
              ? await postIngestWithSse({ url }, (ev) => {
                  if (ev.kind === 'phase') applyIngestSseToPanel(st, ev);
                })
              : await postIngest({ url });
            stopTicker();
            ingestAgentMarkAllDone(st);
            st.className = [
              'ingest-agent-status',
              'ingest-agent-status--ok',
              yt ? '' : 'ingest-agent-status--no-yt',
            ]
              .filter(Boolean)
              .join(' ');
            stMsg.textContent = 'Hoàn tất · capture đã ghi.';
            stFoot.style.whiteSpace = '';
            stFoot.innerHTML = `<button type="button" class="btn-link" id="ingest-open-cap">${esc(out.captureId)}</button><span class="ingest-agent-status__path mono-sm">${esc(out.captureDir)}</span>`;
            main.querySelector('#ingest-open-cap')?.addEventListener('click', () => setHash('capture', out.captureId));
          } catch (e) {
            stopTicker();
            ingestAgentMarkActiveError(st);
            st.className = [
              'ingest-agent-status',
              'ingest-agent-status--err',
              yt ? '' : 'ingest-agent-status--no-yt',
            ]
              .filter(Boolean)
              .join(' ');
            const raw = e instanceof Error ? e.message : String(e);
            const { friendly, detail } = ingestFailurePresentation(raw, { ingestUrl: url });
            stMsg.textContent = friendly;
            stFoot.textContent = detail;
            stFoot.style.whiteSpace = 'pre-wrap';
          } finally {
            runBtn.disabled = false;
            runBtn.classList.remove('processing');
          }
        });
      }
      return;
    }
    if (view === 'captures') {
      main.innerHTML = `
        <header class="masthead"><h1>Thư viện<br /><em>captures.</em></h1></header>
        <div class="view active">
          <div class="mock-table-wrap"><table class="mock-table"><thead><tr>
            <th scope="col">Tiêu đề</th><th scope="col">Nguồn</th><th scope="col">Đánh giá</th><th scope="col" class="capture-action-th"><span class="visually-hidden">Mở</span></th>
          </tr></thead><tbody>${skeletonTableRowsHtml(5)}</tbody></table></div>
        </div>`;
      const { captures } = await fetchJson<{ captures: CaptureListItem[] }>('/api/captures');
      main.innerHTML = renderCapturesTable(captures);
      setSideInner(sideCaptures(captures));
      document.querySelector('#back-home')?.addEventListener('click', () => setHash('home'));
      bindLibrarySearch();
      const openRow = (tr: HTMLElement) => {
        const cid = tr.dataset.id;
        if (cid) setHash('capture', cid);
      };
      main.querySelectorAll('tr.capture-row').forEach((tr) => {
        tr.addEventListener('click', () => openRow(tr as HTMLElement));
        tr.addEventListener('keydown', (ev: Event) => {
          const ke = ev as KeyboardEvent;
          if (ke.key === 'Enter' || ke.key === ' ') {
            ke.preventDefault();
            openRow(tr as HTMLElement);
          }
        });
      });
      return;
    }
    if (view === 'capture' && id) {
      main.innerHTML = `
        <div class="toolbar detail-toolbar">
          <button type="button" class="btn-ghost" id="cap-back-skel">← Thư viện</button>
        </div>
        <div class="view active">${skeletonProseHtml()}</div>`;
      document.querySelector('#cap-back-skel')?.addEventListener('click', () => setHash('captures'));
      const d = await fetchJson<CaptureDetail>(`/api/captures/${encodeURIComponent(id)}`);
      main.innerHTML = renderCaptureDetail(d);
      setSideInner(sideCapture(d));
      document.querySelector('#cap-back')?.addEventListener('click', () => setHash('captures'));
      const titleLine = d.noteBody.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? d.id;
      const isYoutubeCapture =
        Boolean(d.youtubeVideoId) ||
        d.noteFm.source === 'youtube' ||
        d.sourceFm.source === 'youtube';
      const noteHtml = noteToHtml(stripLeadingH1IfMatches(d.noteBody, titleLine), d.id, {
        omitImages: isYoutubeCapture,
      });
      const prose = document.querySelector('#note-prose');

      const copyBtn = document.querySelector<HTMLButtonElement>('#cap-copy-path');
      copyBtn?.addEventListener('click', async () => {
        const p = copyBtn.dataset.path ?? copyBtn.getAttribute('data-path');
        if (!p) return;
        const label = copyBtn.textContent;
        try {
          await navigator.clipboard.writeText(p);
          copyBtn.textContent = 'Đã copy';
          window.setTimeout(() => {
            copyBtn.textContent = label ?? 'Copy path';
          }, 1600);
        } catch {
          copyBtn.textContent = 'Lỗi copy';
          window.setTimeout(() => {
            copyBtn.textContent = label ?? 'Copy path';
          }, 2000);
        }
      });
      if (prose) {
        prose.innerHTML = noteHtml;
        wrapConsecutiveProseImagesInFilmstrips(prose);
        bindFilmstripImageLightbox(prose as HTMLElement);
      }

      const mergedSub = d.youtubeVideoId
        ? mergeTranscriptsForUi(d.transcriptEn ?? '', d.transcriptVi ?? '')
        : [];
      const useSubPanel = Boolean(d.youtubeVideoId && mergedSub.length > 0);

      if (useSubPanel && d.youtubeVideoId) {
        ytCaptureCleanup = bindYoutubeSubPanel(d.youtubeVideoId, mergedSub, main);
      } else {
        const iframe = document.querySelector<HTMLIFrameElement>('#yt-iframe');
        const seek = (t: number) => {
          if (!iframe || !d.youtubeVideoId) return;
          iframe.src = `https://www.youtube.com/embed/${d.youtubeVideoId}?start=${Math.floor(t)}&autoplay=1&enablejsapi=1`;
        };
        document.querySelectorAll('.yt-tick').forEach((el) => {
          el.addEventListener('click', () => seek(Number((el as HTMLElement).dataset.t)));
        });
        document.querySelectorAll('.yt-ms button').forEach((el) => {
          el.addEventListener('click', () => seek(Number((el as HTMLElement).dataset.seek)));
        });

        main.querySelectorAll('.tr-tab').forEach((btn) => {
          btn.addEventListener('click', () => {
            const tab = (btn as HTMLElement).dataset.tab!;
            main.querySelectorAll('.tr-tab').forEach((b) =>
              b.classList.toggle('active', (b as HTMLElement).dataset.tab === tab),
            );
            main.querySelectorAll('.tr-pane').forEach((p) =>
              p.classList.toggle('active', (p as HTMLElement).dataset.pane === tab),
            );
          });
        });
      }
      void bindCaptureReactions(d.id);
      return;
    }
    if (view === 'digests') {
      const [h, { digests }] = await Promise.all([
        fetchJson<Health>('/api/health'),
        fetchJson<{ digests: { id: string; week: string }[] }>('/api/digests'),
      ]);
      const digestOk = Boolean(h.digestAvailable ?? h.ingestAvailable);
      main.innerHTML = renderDigestsList(digests, digestOk);
      setSideInner(sideDigests(digests, digestOk));
      document.querySelector('#back-home-d')?.addEventListener('click', () => setHash('home'));
      const digestRun = main.querySelector<HTMLButtonElement>('#digest-run');
      const digestHint = main.querySelector<HTMLElement>('#digest-run-hint');
      if (digestRun && digestHint && digestOk) {
        digestRun.addEventListener('click', async () => {
          digestHint.hidden = false;
          digestHint.className = 'hint lib-toolbar-hint digest-run-hint digest-run-hint--pending';
          digestHint.textContent = 'Đang chạy digest (CLI)…';
          digestRun.disabled = true;
          digestRun.classList.add('processing');
          try {
            const r = await fetch('/api/digest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            const j = (await r.json()) as {
              ok?: boolean;
              weekId?: string;
              error?: string;
              stderr?: string;
            };
            if (!r.ok || !j.weekId) {
              const tail = j.stderr?.trim() ? ` — ${j.stderr.trim().slice(-400)}` : '';
              throw new Error((j.error ?? `HTTP ${r.status}`) + tail);
            }
            digestHint.className = 'hint lib-toolbar-hint digest-run-hint digest-run-hint--ok';
            digestHint.textContent = `Đã tạo ${j.weekId}. Đang mở…`;
            setHash('digest', j.weekId);
          } catch (e) {
            digestHint.className = 'hint lib-toolbar-hint digest-run-hint digest-run-hint--err';
            digestHint.textContent = e instanceof Error ? e.message : String(e);
            digestRun.disabled = false;
            digestRun.classList.remove('processing');
          }
        });
      }
      main.querySelectorAll('.digest-card[data-week]').forEach((el) => {
        el.addEventListener('click', () => {
          const w = (el as HTMLElement).dataset.week;
          if (w) setHash('digest', w);
        });
      });
      return;
    }
    if (view === 'digest' && id) {
      const [data, challengeMd] = await Promise.all([
        fetchJson<{ week: string; markdown: string }>(
          `/api/digests/${encodeURIComponent(id)}`,
        ),
        fetchChallengeMarkdown(id),
      ]);
      main.innerHTML = renderDigestDetail(data.week, data.markdown, challengeMd);
      setSideInner(sideDigestDetail(data.week, challengeMd !== null));
      document.querySelector('#dig-back')?.addEventListener('click', () => setHash('digests'));
      return;
    }
  } catch (e) {
    main.innerHTML = `<div class="err">${esc(e instanceof Error ? e.message : String(e))}</div>`;
    setSideInner('');
  }
}

export function initApp() {
  app.innerHTML = layoutShell();
  bindRail();
  bindMobileNav();
  window.addEventListener('hashchange', () => route());
  void route();
}

document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.theme-btn');
  if (btn?.dataset.theme && THEMES.includes(btn.dataset.theme as ThemeName)) {
    setTheme(btn.dataset.theme as ThemeName);
  }
});

initApp();
